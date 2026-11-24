/**
 * Dix-huitième route grise : l'identité publiée dans les métadonnées d'une page
 * déjà prouvée HTTP 200 par un registre public (title, og:site_name, JSON-LD
 * name/legalName) peut lever l'ambiguïté des pages dont le texte visible ne
 * nomme pas l'organisation. La preuve HTTP reste stricte : statut 200, racine
 * inchangée après redirection, page réelle, non parking et identité publique
 * (jeton distinctif du nom ou SIREN exact, au plus trois identifiants).
 *
 * Aucune URL n'est devinée, aucune donnée personnelle n'est lue ou écrite,
 * rien n'est écrit sans --apply. Aucune racine déjà attribuée n'est reprise.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-identite-structuree.mts \
 *       [--limit=2000] [--concurrency=24] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, withTransaction } from "../apps/api/src/db.js";
import { measure, normalizeDomain } from "./domain-coverage.mts";
import { distinctiveTokens, withConcurrency } from "./expand-domains.mts";
import {
	attributedDomains, expositionCandidates, selectExpositionCandidates,
	type ExpositionSelection,
} from "./expand-domains-exposition.mts";
import { fetchRetryPage, retryUrls, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "exposition-service:identite-structuree:http200";

export interface IdentityAnchor {
	field: string;
	value: string;
}

export interface StructuredVerdict {
	ok: boolean;
	motif: string;
	identity: string | null;
	field: string | null;
	token: string | null;
	confidence: number;
	title: string | null;
	status: number | null;
	finalUrl: string | null;
	htmlLength: number;
}

export interface StructuredResult {
	verdict: StructuredVerdict;
	url: string;
	tried: string[];
}

const MAX_ANCHOR_LENGTH = 120;
const MAX_PUBLIC_IDENTIFIERS = 3;

function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
		.replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(parseInt(digits, 16)))
		.replace(/&(amp|quot|apos|nbsp|eacute|egrave|agrave|ccedilla|ucirc);/gi, (entity) => ({
			"&amp;": "&", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&eacute;": "é",
			"&egrave;": "è", "&agrave;": "à", "&ccedilla;": "ç", "&ucirc;": "û",
		}[entity.toLowerCase()] ?? entity));
}

/** Reads only explicit identity slots, never arbitrary body text. */
export function structuredAnchors(html: string): IdentityAnchor[] {
	const anchors: IdentityAnchor[] = [];
	const add = (field: string, value: string | undefined): void => {
		const clean = decodeEntities(value ?? "")
			.replace(/\s+/g, " ").trim();
		if (clean.length >= 2 && clean.length <= MAX_ANCHOR_LENGTH) anchors.push({ field, value: clean });
	};
	add("title", /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
	for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
		const tag = match[0];
		if (!/property\s*=\s*["']og:site_name["']|name\s*=\s*["'](?:application-name|site_name)["']/i.test(tag)) continue;
		add("meta", /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
	}
	const walk = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) walk(item);
			return;
		}
		if (!value || typeof value !== "object") return;
		const record = value as Record<string, unknown>;
		const type = Array.isArray(record["@type"]) ? record["@type"].join(" ") : String(record["@type"] ?? "");
		if (!type || /organization|corporation|localsbusiness|school|educational/i.test(type)) {
			for (const key of ["legalName", "name", "alternateName"]) {
				if (typeof record[key] === "string") add(`jsonld:${key}`, record[key] as string);
			}
		}
		for (const item of Object.values(record)) walk(item);
	};
	for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
		try {
			walk(JSON.parse(match[1] ?? ""));
		} catch {
			// Malformed structured data is ignored, never treated as an identity.
		}
	}
	const seen = new Set<string>();
	return anchors.filter((anchor) => {
		const key = `${anchor.field}:${anchor.value.toLowerCase()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function visibleText(html: string): string {
	return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ")
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function anchorWords(value: string): Set<string> {
	return new Set(decodeEntities(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().split(/[^a-z0-9]+/));
}

function publicIdentifiers(...texts: string[]): Set<string> {
	const ids = new Set<string>();
	for (const text of texts) {
		for (const match of text.matchAll(/\d{9}(?:\d{5})?/g)) {
			ids.add(match[0].length === 14 ? match[0].slice(0, 9) : match[0]);
		}
	}
	return ids;
}

/**
 * Accepts only a live, real page whose published metadata names this
 * organisation. The name token must come from the organisation, not its city.
 */
export function structuredVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: ExpositionSelection,
): StructuredVerdict {
	const base: StructuredVerdict = {
		ok: false, motif: "", identity: null, field: null, token: null,
		confidence: 0, title: null, status, finalUrl, htmlLength: html.length,
	};
	if (status !== 200) return { ...base, motif: "http-not-200" };
	if (normalizeDomain(finalUrl) !== selection.domain) return { ...base, motif: "redirect-off-root" };
	const text = visibleText(html);
	if (text.length < 150) return { ...base, motif: "content-too-short" };
	if (/\b(domain (is )?for sale|domaine a vendre|sedo|parking page|buy this domain)\b/i.test(text)) {
		return { ...base, motif: "parking-page" };
	}
	const anchors = structuredAnchors(html);
	const title = anchors.find((anchor) => anchor.field === "title")?.value ?? null;
	const ids = publicIdentifiers(text, ...anchors.map((anchor) => anchor.value));
	if (ids.size > MAX_PUBLIC_IDENTIFIERS) return { ...base, motif: "directory-page", title };
	const tokens = distinctiveTokens(selection.organisation.name, null);
	if (!tokens.length) return { ...base, motif: "no-identity-token", title };
	const rootTokens = new Set(selection.domain.split(".").slice(0, -1)
		.flatMap((label) => label.toLowerCase().split(/[^a-z]+/)).flatMap((word) => distinctiveTokens(word, null)));
	if (!tokens.some((token) => rootTokens.has(token))) {
		return { ...base, motif: "root-not-named", title };
	}
	const siren = selection.organisation.siren;
	if (siren && /^\d{9}$/.test(siren) && ids.has(siren)) {
		return {
			...base, ok: true, motif: "http200-published-siren", identity: "identifiant-public",
			field: "page", token: siren, confidence: 0.95, title,
		};
	}
	for (const anchor of anchors) {
		const words = anchorWords(anchor.value);
		const token = tokens.find((candidate) => words.has(candidate));
		if (token) {
			return {
				...base, ok: true, motif: "http200-structured-identity", identity: "identite-publiee",
				field: anchor.field, token, confidence: 0.9, title,
			};
		}
	}
	return { ...base, motif: "no-structured-identity", title };
}

/** Tries the same official host variants with the longer budget. */
export async function verifyStructuredIdentity(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<StructuredResult | null> {
	const tried: string[] = [];
	for (const url of retryUrls(selection.row.sourceUrl)) {
		tried.push(url);
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		const verdict = structuredVerdict(page.html, page.status, page.finalUrl, selection);
		if (verdict.ok) return { verdict, url, tried };
	}
	return null;
}

/** Provenance tied to the registry row and the page that published the identity. */
export function provenanceForStructuredIdentity(selection: ExpositionSelection, result: StructuredResult) {
	return {
		source: SOURCE,
		confiance: result.verdict.confidence,
		preuve: {
			serviceId: selection.row.serviceId,
			registre: selection.row.source,
			provider: selection.row.provider,
			urlSource: selection.row.sourceUrl,
			urlReponse: result.url,
			tentatives: result.tried.length,
			statut: result.verdict.status,
			urlFinale: result.verdict.finalUrl,
			titre: result.verdict.title,
			champIdentite: result.verdict.field,
			identite: result.verdict.identity,
			token: result.verdict.token,
			motif: result.verdict.motif,
			verifieLe: new Date().toISOString(),
		},
	};
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "2000")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "24"))));
	const outputPath = option("output", "bench/results/domains-from-identite-structuree.json");
	const before = await measure();
	const selected = selectExpositionCandidates(await expositionCandidates(), await attributedDomains()).slice(0, limit);
	const results = await withConcurrency(selected, concurrency, async (selection) => verifyStructuredIdentity(selection));
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: StructuredResult } => entry.result !== null);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForStructuredIdentity(entry.selection, entry.result);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.selection.row.sourceUrl],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO UPDATE SET
					   valeur = EXCLUDED.valeur, source = EXCLUDED.source,
					   confiance = EXCLUDED.confiance, preuve = EXCLUDED.preuve, verifie_at = now()`,
					[entry.selection.organisation.id, entry.selection.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length,
		verified: accepted.length,
		applied: apply,
		before,
		after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			name: entry.selection.organisation.name,
			domain: entry.selection.domain,
			registry: entry.selection.row.source,
			field: entry.result.verdict.field,
			token: entry.result.verdict.token,
			url: entry.result.url,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
