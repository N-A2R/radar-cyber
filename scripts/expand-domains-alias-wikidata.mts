/**
 * Dix-septième route grise : les libellés Wikidata P856 déjà collectés pour la
 * Nouvelle-Aquitaine sont appariés aux alias publics des organisations
 (`referentiel-na`, FINESS, annuaire de l'éducation, annuaire des entreprises).
 * Les routes précédentes appariaient le libellé entier (t6/t7) ou le jeton de
 * la racine (t8) : une commune dont le libellé est ambigu pour le nom court
 * restait sans domaine. Ici l'alias public lève l'ambiguïté, puis la preuve
 * HTTP stricte inchangée est exigée en direct (200, racine stable, contenu
 * réel, jeton distinctif du libellé publié par la page).
 *
 * Aucun QID déjà attribué par une route antérieure n'est retenté, aucune
 * racine déjà attribuée n'est réutilisée, aucune donnée personnelle n'est lue
 * ni écrite. Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-alias-wikidata.mts \
 *       [--limit=2000] [--concurrency=32] [--apply]
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	measure, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import {
	domainRoot, distinctiveTokens, pageVerdict, withConcurrency, type Organisation, type Verdict,
} from "./expand-domains.mts";
import { attributedDomains } from "./expand-domains-exposition.mts";
import { fetchRetryPage, retryUrls } from "./expand-domains-retry.mts";

export const SOURCE = "wikidata:P856:alias-public:http200";
export const ALIAS_SOURCES = [
	"referentiel-na", "finess", "annuaire-education", "annuaire-entreprises",
] as const;
export const CANDIDATE_FILES = [
	"bench/domain-candidates/wikidata-na-sites.tsv",
	"bench/domain-candidates/wikidata-na-hq-sites.tsv",
] as const;

export interface AliasRow {
	orgId: number;
	alias: string;
	source: string;
	name: string;
}

export interface WikidataSite {
	qid: string;
	url: string;
	label: string;
}

export interface AliasMatch {
	qid: string;
	url: string;
	label: string;
	alias: string;
	identityName: string;
	org: Organisation;
	domain: string;
}

export interface AliasSiteResult {
	verdict: Verdict;
	url: string;
	tried: string[];
}

const CIVIC_WORDS = /\b(mairie|commune|ville|departement|region|saint|sainte|de|des|du|d|le|la|les|sur|en)\b/g;

/** Accent-free civic key shared by a Wikidata label and a public alias. */
export function normalizeAlias(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
		.replace(CIVIC_WORDS, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** One public alias may only name one organisation of the region. */
export function indexAliases(rows: AliasRow[]): Map<string, { orgId: number; name: string; alias: string }> {
	const groups = new Map<string, Map<number, { orgId: number; name: string; alias: string }>>();
	for (const row of rows) {
		const key = normalizeAlias(row.alias);
		if (key.length < 4) continue;
		const group = groups.get(key) ?? new Map();
		group.set(row.orgId, { orgId: row.orgId, name: row.name, alias: row.alias });
		groups.set(key, group);
	}
	const unique = new Map<string, { orgId: number; name: string; alias: string }>();
	for (const [key, group] of groups) {
		if (group.size === 1) unique.set(key, [...group.values()][0]);
	}
	return unique;
}

/** Cached public Wikidata P856 rows: QID, official URL, label. */
export function parseWikidataSites(lines: string[]): WikidataSite[] {
	const sites: WikidataSite[] = [];
	for (const line of lines) {
		const [qid, url, label] = line.trim().split("\t");
		if (!/^Q\d+$/.test(qid ?? "") || !/^https?:\/\//i.test(url ?? "") || !(label ?? "").trim()) continue;
		sites.push({ qid, url, label: label.trim() });
	}
	return sites;
}

/**
 * A site is eligible only when its label matches one unique public alias,
 * its QID is new and its root has never been attributed to an organisation.
 */
export function selectAliasSites(
	sites: WikidataSite[],
	aliases: ReadonlyMap<string, { orgId: number; name: string; alias: string }>,
	usedQids: ReadonlySet<string>,
	usedDomains: ReadonlySet<string>,
	organisations: ReadonlyMap<number, Organisation>,
	limit = Number.POSITIVE_INFINITY,
): AliasMatch[] {
	const ordered = [...sites].sort((a, b) => Number(b.url.startsWith("https:")) - Number(a.url.startsWith("https:")));
	const selected: AliasMatch[] = [];
	const seenOrgs = new Set<number>();
	const seenRoots = new Set<string>();
	for (const site of ordered) {
		if (selected.length >= limit) break;
		if (usedQids.has(site.qid)) continue;
		const key = normalizeAlias(site.label);
		if (key.length < 4) continue;
		const anchor = aliases.get(key);
		if (!anchor) continue;
		const org = organisations.get(anchor.orgId);
		if (!org || seenOrgs.has(org.id)) continue;
		const domain = domainRoot(site.url);
		if (!domain || usedDomains.has(domain) || seenRoots.has(domain)) continue;
		if (!distinctiveTokens(key, null).length) continue;
		seenOrgs.add(org.id);
		seenRoots.add(domain);
		selected.push({
			qid: site.qid, url: site.url, label: site.label, alias: anchor.alias,
			identityName: key, org, domain,
		});
	}
	return selected;
}

/** Same strict proof, with the Wikidata label as the published identity anchor. */
export async function verifyAliasSite(
	selection: AliasMatch,
	fetcher: (url: string) => Promise<{ html: string; status: number; finalUrl: string }> = fetchRetryPage,
): Promise<AliasSiteResult | null> {
	const tried: string[] = [];
	for (const url of retryUrls(selection.url)) {
		tried.push(url);
		let page: Awaited<ReturnType<typeof fetcher>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		const verdict = pageVerdict(
			page.html, page.status, page.finalUrl,
			{ ...selection.org, name: selection.identityName } as Organisation,
			selection.domain,
		);
		if (verdict.ok) return { verdict, url, tried };
	}
	return null;
}

/** Provenance linking the alias, the QID and the page that answered. */
export function provenanceForAliasSite(selection: AliasMatch, result: AliasSiteResult) {
	return {
		source: SOURCE,
		confiance: result.verdict.confidence,
		preuve: {
			qid: selection.qid,
			urlWikidata: `https://www.wikidata.org/wiki/${selection.qid}`,
			libelleWikidata: selection.label,
			alias: selection.alias,
			aliasSource: "public-registry",
			urlSource: selection.url,
			urlReponse: result.url,
			tentatives: result.tried.length,
			statut: result.verdict.status,
			urlFinale: result.verdict.finalUrl,
			titre: result.verdict.title,
			token: result.verdict.token,
			motif: result.verdict.motif,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** QIDs already written by earlier routes are never retried. */
export async function previouslyUsedQids(dir = "bench/results", excludeFile = ""): Promise<Set<string>> {
	const qids = new Set<string>();
	const files = (await readdir(dir)).filter((file) => file.endsWith(".json") && file !== excludeFile);
	const walk = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) walk(item);
		} else if (value && typeof value === "object") {
			for (const [key, item] of Object.entries(value)) {
				if ((key === "qid" || key === "q_id") && typeof item === "string") qids.add(item);
				walk(item);
			}
		}
	};
	for (const file of files) {
		try {
			const result = JSON.parse(await readFile(join(dir, file), "utf8"));
			if (result?.applied === false) continue;
			walk(result);
		} catch {
			// A malformed result file must not block the route; its QIDs stay unused.
		}
	}
	return qids;
}

/** Public name aliases of Nouvelle-Aquitaine organisations without a domain. */
export async function aliasRows(): Promise<AliasRow[]> {
	const { rows } = await query<AliasRow>(`
		SELECT a.org_id AS "orgId", a.alias, a.source, o.name
		FROM org_alias a
		JOIN org o ON o.id = a.org_id
		WHERE o.dept = ANY($1::text[])
		  AND (o.domain IS NULL OR btrim(o.domain) = '')
		  AND a.source = ANY($2::text[])
		ORDER BY a.org_id, a.id
	`, [[...NOUVELLE_AQUITAINE_DEPTS], [...ALIAS_SOURCES]]);
	return rows;
}

async function organisationsById(ids: number[]): Promise<Map<number, Organisation>> {
	if (!ids.length) return new Map();
	const { rows } = await query<Organisation>(`
		SELECT id, name, city, dept, siren, domain FROM org WHERE id = ANY($1::int[])
	`, [ids]);
	return new Map(rows.map((row) => [row.id, row]));
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "2000")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "32"))));
	const outputPath = option("output", "bench/results/domains-from-alias-wikidata.json");
	const before = await measure();
	const aliases = indexAliases(await aliasRows());
	const sites = parseWikidataSites(
		(await Promise.all(CANDIDATE_FILES.map((file) => readFile(file, "utf8"))))
			.flatMap((content) => content.split("\n")),
	);
	const usedQids = await previouslyUsedQids("bench/results", basename(outputPath));
	const usedDomains = await attributedDomains();
	const candidateIds = [...new Set(
		sites.map((site) => aliases.get(normalizeAlias(site.label))?.orgId).filter((id): id is number => !!id),
	)];
	const organisations = await organisationsById(candidateIds);
	const selected = selectAliasSites(sites, aliases, usedQids, usedDomains, organisations, limit);
	const results = await withConcurrency(selected, concurrency, (entry) => verifyAliasSite(entry));
	const accepted = selected
		.map((entry, index) => ({ entry, result: results[index] }))
		.filter((item): item is { entry: AliasMatch; result: AliasSiteResult } => !!item.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const { entry, result } of accepted) {
				const proof = provenanceForAliasSite(entry, result);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.org.id, entry.domain, entry.url],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO UPDATE SET
					   valeur = EXCLUDED.valeur, source = EXCLUDED.source,
					   confiance = EXCLUDED.confiance, preuve = EXCLUDED.preuve, verifie_at = now()`,
					[entry.org.id, entry.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map(({ entry, result }) => ({
			orgId: entry.org.id, name: entry.org.name, qid: entry.qid, label: entry.label,
			alias: entry.alias, domain: entry.domain, page: result.url, token: result.verdict.token,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
