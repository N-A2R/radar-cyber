/**
 * Nouvelle route grise : les mentions légales publiées par le site officiel
 * déclaré dans un alias SIRENE public. Quand la page d'accueil ne nomme pas
 * l'organisation, le site lui-même peut publier son SIREN ou son SIRET dans
 * ses mentions légales. Ces identifiants sont publics et non personnels.
 *
 * La preuve reste stricte : la page d'accueil et la mention légale répondent
 * en HTTP 200 sur la même racine, la page est réelle, et elle publie
 * l'identifiant exact de l'organisation (au plus trois identifiants afin
 * d'écarter les annuaires). Aucun site n'est deviné, aucune écriture sans
 * --apply, aucune donnée personnelle lue ou stockée.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-mentions.mts \
 *       [--limit=1200] [--concurrency=24] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, withTransaction } from "../apps/api/src/db.js";
import { measure, normalizeDomain } from "./domain-coverage.mts";
import { distinctiveTokens, withConcurrency } from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";
import { pageIdentifiers } from "./expand-domains-identifiant.mts";
import {
	aliasRows, attributedDomains, selectAliasDomains, type AliasDomainSelection, type AliasRow,
} from "./expand-domains-alias-domaine.mts";

export const SOURCE = "sirene:alias-domaine:mentions-legales:http200";
export const MAX_IDENTIFIERS_ON_PAGE = 3;
const MAX_LEGAL_LINKS = 3;
const FALLBACK_LEGAL_PATHS = ["/mentions-legales", "/mentions", "/legal"];
const PERSON_NAME = /^[A-Z][A-Za-zéèàêëîïôûùç-]+ [A-Z][A-Za-zéèàêëîïôûùç-]+(?: \(|&)/;
const LEGAL_FORM = /\b(SARL|SAS|SASU|EURL|SCI|SNC|ASSOC|ASSOCIATION|GIE)\b/i;

export interface LegalVerdict {
	ok: boolean;
	motif: string;
	status: number | null;
	finalUrl: string;
	htmlLength: number;
	identifiersOnPage: number;
}

/** Visible text without scripts, styles or markup. */
export function visibleText(html: string): string {
	return html.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
		.replace(/&[a-z]+;|&#\d+;/gi, " ")
		.replace(/\s+/g, " ").trim();
}

/** Legal-notice links of the official root, deduplicated and rate-limited. */
export function legalNoticeUrls(html: string, baseUrl: string, domain: string): string[] {
	const urls = new Set<string>();
	const links = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
	for (const match of html.matchAll(links)) {
		const label = visibleText(match[2] ?? "");
		if (!/mention|l[ée]gal|impressum/i.test(`${match[1]} ${label}`)) continue;
		let url: URL;
		try {
			url = new URL(match[1], baseUrl);
		} catch {
			continue;
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") continue;
		if (normalizeDomain(url.toString()) !== domain) continue;
		urls.add(url.toString());
		if (urls.size >= MAX_LEGAL_LINKS) break;
	}
	return [...urls];
}

/** The legal page must publish the exact public identifier or two name tokens. */
export function legalNoticeVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: AliasDomainSelection,
): LegalVerdict {
	const base: LegalVerdict = {
		ok: false, motif: "", status, finalUrl, htmlLength: html.length, identifiersOnPage: 0,
	};
	if (status !== 200) return { ...base, motif: "http-not-200" };
	if (normalizeDomain(finalUrl) !== selection.domain) return { ...base, motif: "redirect-off-root" };
	const text = visibleText(html).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const sirets = pageIdentifiers(html, 14);
	const sirens = pageIdentifiers(html, 9);
	const published = new Set([...sirens, ...sirets]);
	base.identifiersOnPage = published.size;
	if (published.size > MAX_IDENTIFIERS_ON_PAGE) return { ...base, motif: "directory-page" };
	const identifier = selection.row.identifier;
	if (identifier && /^\d{9,14}$/.test(identifier)) {
		const siren = identifier.length === 14 ? identifier.slice(0, 9) : identifier;
		if (sirens.has(siren) || sirets.has(identifier)) {
			return { ...base, ok: true, motif: "http200-published-legal-identifier" };
		}
	}
	const cityTokens = new Set(distinctiveTokens(selection.row.city, null));
	const nameTokens = distinctiveTokens(selection.row.name, null)
		.filter((token) => token.length >= 5 && !cityTokens.has(token));
	const publishedTokens = nameTokens.filter((token) => new RegExp(`\\b${token}\\b`).test(text));
	if (publishedTokens.length >= 2) return { ...base, ok: true, motif: "http200-published-name" };
	return { ...base, motif: "no-published-identity" };
}

/** Links found on the root, or the conventional legal paths as a fallback. */
export function candidateLegalUrls(html: string, finalUrl: string, domain: string): string[] {
	const linked = legalNoticeUrls(html, finalUrl, domain);
	if (linked.length) return linked;
	return FALLBACK_LEGAL_PATHS.map((path) => new URL(path, finalUrl).toString())
		.filter((url) => normalizeDomain(url) === domain);
}

/** Live proof on the declared root followed by one of its own legal notices. */
export async function verifyLegalNotice(
	selection: AliasDomainSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<(LegalVerdict & { homeUrl: string; legalUrl: string }) | null> {
	const homeUrl = `https://${selection.domain}/`;
	let home: Awaited<ReturnType<PageFetch>>;
	try {
		home = await fetcher(homeUrl);
	} catch {
		return null;
	}
	if (home.status !== 200 || normalizeDomain(home.finalUrl) !== selection.domain) return null;
	for (const legalUrl of candidateLegalUrls(home.html, home.finalUrl, selection.domain)) {
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(legalUrl);
		} catch {
			continue;
		}
		const verdict = legalNoticeVerdict(page.html, page.status, page.finalUrl, selection);
		if (verdict.ok) return { ...verdict, homeUrl, legalUrl };
	}
	return null;
}

/** Provenance tying the public alias to the live legal-notice proof. */
export function provenanceForLegalNotice(selection: AliasDomainSelection, verdict: LegalVerdict & { legalUrl: string }) {
	return {
		source: SOURCE,
		confiance: 0.9,
		preuve: {
			alias: selection.row.alias,
			aliasSource: selection.row.aliasSource,
			domain: selection.domain,
			identifier: selection.row.identifier,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			urlMentions: verdict.legalUrl,
			identifiantsSurPage: verdict.identifiersOnPage,
			motif: verdict.motif,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** Legal-notice route never attributes a domain to a natural person. */
export function selectLegalNoticeDomains(
	rows: AliasRow[],
	attributed: ReadonlySet<string> = new Set(),
): AliasDomainSelection[] {
	return selectAliasDomains(
		rows.filter((row) => !PERSON_NAME.test(row.name) || LEGAL_FORM.test(row.name)),
		attributed,
	);
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "1200")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "24"))));
	const outputPath = option("output", "bench/results/domains-from-mentions-legales.json");
	const before = await measure();
	const selected = selectLegalNoticeDomains(await aliasRows(), await attributedDomains()).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyLegalNotice(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: AliasDomainSelection; verdict: LegalVerdict & { legalUrl: string } } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForLegalNotice(entry.selection, entry.verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.row.orgId, entry.selection.domain, `https://${entry.selection.domain}/`],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO NOTHING`,
					[
						entry.selection.row.orgId, entry.selection.domain,
						proof.source, proof.confiance, JSON.stringify(proof.preuve),
					],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.row.orgId,
			name: entry.selection.row.name,
			alias: entry.selection.row.alias,
			domain: entry.selection.domain,
			identifier: entry.selection.row.identifier,
			page: entry.verdict.legalUrl,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
