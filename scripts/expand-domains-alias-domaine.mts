/**
 * Nouvelle route grise : les enseignes et noms SIRENE publics qui déclarent
 * eux-mêmes un nom de domaine (par exemple « JESTOCKE.COM »). L'alias est une
 * donnée publique non personnelle rattachée à un SIREN ; le domaine n'est
 * accepté que s'il répond encore en direct avec la preuve stricte inchangée :
 * statut 200, racine stable après redirection, page réelle, identité de
 * l'organisation publiée sur la page (jeton distinctif ou identifiant légal),
 * et racine non déjà attribuée. Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-alias-domaine.mts \
 *       [--limit=1200] [--concurrency=32] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import {
	distinctiveTokens, domainRoot, GENERIC_TOKENS, withConcurrency,
} from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";
import { pageIdentifiers } from "./expand-domains-identifiant.mts";

export const SOURCE = "sirene:alias-domaine:http200";
const TLD = "(?:fr|com|net|org|eu|info|biz|io|tv|site|online|paris)";
const DOMAIN_IN_ALIAS = new RegExp(`(?:www\\.)?[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.${TLD}\\b`, "gi");
const PLATFORMS = new Set([
	"facebook.com", "instagram.com", "linkedin.com", "youtube.com", "twitter.com",
	"google.com", "wordpress.com", "blogspot.com", "wixsite.com", "sites.google.com",
]);

export interface AliasRow {
	orgId: number;
	name: string;
	city: string | null;
	dept: string | null;
	identifier: string | null;
	alias: string;
	aliasSource: string;
}

export interface AliasDomainSelection {
	row: AliasRow;
	domain: string;
	identityToken: string | null;
}

export interface AliasDomainVerdict {
	ok: boolean;
	motif: string;
	status: number | null;
	finalUrl: string;
	title: string | null;
	htmlLength: number;
	identity: string;
}

/** Domain names declared in a public SIRENE alias, deduplicated and validated. */
export function aliasDomains(alias: string): string[] {
	const found = new Set<string>();
	for (const match of alias.match(DOMAIN_IN_ALIAS) ?? []) {
		const domain = normalizeDomain(match);
		if (!domain || PLATFORMS.has(domain)) continue;
		const label = domain.split(".")[0];
		if (label.length < 5 || GENERIC_TOKENS.has(label)) continue;
		found.add(domain);
	}
	return [...found].sort();
}
const PERSON_ALIAS = /^[A-Z][A-Za-zéèàêëîïôûùç-]+ [A-Z][A-Za-zéèàêëîïôûùç-]+ \(/;
const LEGAL_FORM = /\b(SARL|SAS|SASU|EURL|SCI|SNC|ASSOC|ASSOCIATION|GIE)\b/i;

/** A domain declared by SIRENE for one organisation, never a shared platform. */
export function selectAliasDomains(
	rows: AliasRow[],
	attributed: ReadonlySet<string> = new Set(),
): AliasDomainSelection[] {
	const usedOrgs = new Set<number>();
	const usedDomains = new Set<string>();
	const selected: AliasDomainSelection[] = [];
	for (const row of rows) {
		if (PERSON_ALIAS.test(row.alias) && !LEGAL_FORM.test(row.alias)) continue;
		const nameTokens = new Set(distinctiveTokens(row.name, row.city));
		const cityTokens = new Set(distinctiveTokens(row.city, null));
		const identifier = row.identifier && /^\d{9,14}$/.test(row.identifier) ? row.identifier : null;
		for (const domain of aliasDomains(row.alias)) {
			if (attributed.has(domain) || usedDomains.has(domain)) continue;
			const label = domain.split(".")[0];
			const identityToken = nameTokens.has(label) && !cityTokens.has(label) ? label : null;
			if (!identityToken && !identifier) continue;
			selected.push({ row, domain, identityToken });
			usedOrgs.add(row.orgId);
			usedDomains.add(domain);
			break;
		}
	}
	return selected;
}

/** Strict HTTP proof plus an identity published by the site itself. */
export function aliasDomainVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: AliasDomainSelection,
): AliasDomainVerdict {
	const base: AliasDomainVerdict = {
		ok: false, motif: "", status, finalUrl, title: null, htmlLength: html.length, identity: "",
	};
	if (status !== 200) return { ...base, motif: "http-not-200" };
	if (normalizeDomain(finalUrl) !== selection.domain) return { ...base, motif: "redirect-off-root" };
	const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
		.replace(/&[a-z]+;|&#\d+;/gi, " ").normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
	if (text.length < 150) return { ...base, motif: "content-too-short" };
	if (/\b(domain (is )?for sale|domaine a vendre|sedo|parking page|buy this domain)\b/i.test(text)) {
		return { ...base, motif: "parking-page" };
	}
	if (selection.row.identifier && pageIdentifiers(html, selection.row.identifier.length).has(selection.row.identifier)) {
		return {
			...base, ok: true, motif: "http200-published-identifier", identity: "identifiant-public",
			title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? null,
		};
	}
	if (selection.identityToken && new RegExp(`\\b${selection.identityToken}\\b`).test(text)) {
		return {
			...base, ok: true, motif: "http200-published-name", identity: selection.identityToken,
			title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? null,
		};
	}
	return { ...base, motif: "no-published-identity" };
}

/** Live re-check of the SIRENE-declared domain. */
export async function verifyAliasDomain(
	selection: AliasDomainSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<AliasDomainVerdict | null> {
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(`https://${selection.domain}`);
	} catch {
		return null;
	}
	const verdict = aliasDomainVerdict(page.html, page.status, page.finalUrl, selection);
	return verdict.ok ? verdict : null;
}

/** Provenance tying the SIRENE alias to the live strict proof. */
export function provenanceForAliasDomain(selection: AliasDomainSelection, verdict: AliasDomainVerdict) {
	return {
		source: SOURCE,
		confiance: 0.9,
		preuve: {
			alias: selection.row.alias,
			aliasSource: selection.row.aliasSource,
			identifiant: selection.row.identifier,
			urlSource: `https://${selection.domain}`,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			identite: verdict.identity,
			motif: verdict.motif,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** Roots already attributed to any organisation, whatever the provenance. */
export async function attributedDomains(): Promise<Set<string>> {
	const { rows } = await query<{ domain: string }>(
		"SELECT lower(domain) AS domain FROM org WHERE domain IS NOT NULL AND btrim(domain) <> ''",
	);
	return new Set(rows.map((row) => normalizeDomain(row.domain)).filter((value): value is string => !!value));
}

/** Public SIRENE aliases of Nouvelle-Aquitaine organisations without a domain. */
export async function aliasRows(): Promise<AliasRow[]> {
	const { rows } = await query<AliasRow>(`
		SELECT o.id AS "orgId", o.name, o.city, o.dept,
		       CASE WHEN o.entity_code ~ '^\\d{9,14}$' THEN o.entity_code ELSE o.siren END AS identifier,
		       a.alias, a.source AS "aliasSource"
		FROM org_alias a
		JOIN org o ON o.id = a.org_id
		WHERE o.dept = ANY($1::text[])
		  AND (o.domain IS NULL OR btrim(o.domain) = '')
		  AND a.status = 'active'
		  AND a.source IN ('sirene', 'sirene-nom', 'sirene-usuelle', 'sirene-enseigne')
		  AND a.alias ~* ('\\.' || $2::text)
		ORDER BY o.id, a.id
	`, [[...NOUVELLE_AQUITAINE_DEPTS], TLD]);
	return rows;
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "1200")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "32"))));
	const outputPath = option("output", "bench/results/domains-from-alias-domaine.json");
	const before = await measure();
	const selected = selectAliasDomains(await aliasRows(), await attributedDomains()).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyAliasDomain(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: AliasDomainSelection; verdict: AliasDomainVerdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForAliasDomain(entry.selection, entry.verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.row.orgId, entry.selection.domain, proof.preuve.urlSource],
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
			page: entry.verdict.finalUrl,
			identity: entry.verdict.identity,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
