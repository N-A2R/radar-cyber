/**
 * Third public-source route: Wikidata P856 websites for entities located in
 * Nouvelle-Aquitaine, selected by the Wikidata label named in the
 * organisation's SIRENE name. No SIREN export is reused here: the geographic
 * SPARQL query reaches communes and local bodies absent from that export.
 * The same strict HTTP proof as the other routes is required before writing.
 *
 * Usage (DATABASE_URL selects the database):
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-geo.mts \
 *       [--refresh] [--limit=300] [--concurrency=32] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { measure, NOUVELLE_AQUITAINE_DEPTS } from "./domain-coverage.mts";
import {
	GENERIC_TOKENS,
	domainRoot,
	fetchPage,
	pageVerdict,
	withConcurrency,
	type Organisation,
	type Verdict,
} from "./expand-domains.mts";

export interface GeoCandidate {
	qid: string;
	url: string;
	label: string;
}

export interface GeoSelection {
	candidate: GeoCandidate;
	organisation: Organisation;
	domain: string;
}

export const REGION_QID = "Q18678082";
export const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
export const SPARQL_QUERY = `SELECT DISTINCT ?item ?site ?itemLabel WHERE {
  ?item wdt:P856 ?site ; wdt:P131* wd:${REGION_QID} .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" . }
}`;
const MINIMUM_LABEL_LENGTH = 6;
const MINIMUM_TOKEN_LENGTH = 4;
const DEFAULT_MAX_ORGS_PER_TOKEN = 25;
const GEO_GENERIC_TOKENS = new Set(["communaute", "communautes", "communes", "intercommunal", "intercommunalite"]);

/** Accent-free lowercase letters and digits, used for label comparison. */
export function compact(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Distinctive words of a Wikidata label, never generic administrative words. */
export function labelTokens(label: string): string[] {
	const plain = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	return [...new Set(plain.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= MINIMUM_TOKEN_LENGTH
			&& !GENERIC_TOKENS.has(token) && !GEO_GENERIC_TOKENS.has(token)))];
}

/** Parses the cached qid/site/label TSV produced by a SPARQL fetch. */
export function parseGeoCandidates(text: string): GeoCandidate[] {
	const candidates: GeoCandidate[] = [];
	for (const line of text.split("\n")) {
		const [qid, url, label] = line.trim().split("\t");
		if (!/^Q\d+$/.test(qid ?? "") || !/^https?:\/\//i.test(url ?? "") || !label) continue;
		candidates.push({ qid, url, label });
	}
	return candidates;
}

/** Parses one SPARQL JSON result row into a candidate. */
export function parseSparqlBinding(binding: {
	item?: { value?: string };
	site?: { value?: string };
	itemLabel?: { value?: string };
}): GeoCandidate | null {
	const qid = /\/Q\d+$/.exec(binding.item?.value ?? "")?.[0]?.slice(1);
	const url = binding.site?.value;
	const label = binding.itemLabel?.value;
	if (!qid || !url || !label || !/^https?:\/\//i.test(url)) return null;
	return { qid, url, label };
}

/**
 * Pairs a candidate only when its full Wikidata label is contained in one and
 * only one Nouvelle-Aquitaine organisation name. Ambiguous labels are skipped.
 */
export function selectByLabel(
	candidates: GeoCandidate[],
	organisationsByToken: Map<string, Organisation[]>,
	options: { maxOrgsPerToken?: number } = {},
): GeoSelection[] {
	const maxOrgs = options.maxOrgsPerToken ?? DEFAULT_MAX_ORGS_PER_TOKEN;
	const usedOrgs = new Set<number>();
	const usedQids = new Set<string>();
	const usedDomains = new Set<string>();
	const selected: GeoSelection[] = [];
	for (const candidate of candidates) {
		const needle = compact(candidate.label);
		const domain = domainRoot(candidate.url);
		if (needle.length < MINIMUM_LABEL_LENGTH || !domain) continue;
		if (usedQids.has(candidate.qid) || usedDomains.has(domain)) continue;
		const matches = new Map<number, Organisation>();
		for (const token of labelTokens(candidate.label)) {
			const group = organisationsByToken.get(token) ?? [];
			if (group.length > maxOrgs) continue;
			for (const organisation of group) {
				if (compact(organisation.name).includes(needle)) matches.set(organisation.id, organisation);
			}
		}
		if (matches.size !== 1) continue;
		const [organisation] = [...matches.values()];
		if (usedOrgs.has(organisation.id)) continue;
		usedOrgs.add(organisation.id);
		usedQids.add(candidate.qid);
		usedDomains.add(domain);
		selected.push({ candidate, organisation, domain });
	}
	return selected;
}

/** Drops QIDs already verified or already examined by the SIREN export routes. */
export function excludeKnownCandidates(
	selections: GeoSelection[],
	attributed: ReadonlySet<string>,
	prior: ReadonlySet<string>,
): GeoSelection[] {
	return selections.filter((selection) =>
		!attributed.has(selection.candidate.qid) && !prior.has(selection.candidate.qid));
}

/** Provenance keeps the geographic label route distinct from the other two. */
export function provenanceForGeo(selection: GeoSelection, verdict: Verdict) {
	return {
		source: "wikidata:P856:geographie:http200",
		confiance: verdict.confidence,
		preuve: {
			qid: selection.candidate.qid,
			label: selection.candidate.label,
			source: "wikidata:P856:geographie",
			requete: SPARQL_QUERY,
			urlItem: `https://www.wikidata.org/wiki/${selection.candidate.qid}`,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
			appariement: "libelle",
		},
	};
}

/** Reads Nouvelle-Aquitaine organisations without a domain by name token. */
export async function organisationsByTokens(tokens: string[]): Promise<Map<string, Organisation[]>> {
	if (!tokens.length) return new Map();
	const { rows } = await query<Organisation & { jeton: string }>(`
		SELECT DISTINCT o.id, o.name, o.city, o.dept, o.siren, o.domain, lower(jeton) AS jeton
		FROM org o,
		     regexp_split_to_table(regexp_replace(o.name_norm, '[^a-z0-9]+', ' ', 'g'), ' ') jeton
		WHERE o.dept = ANY($1::text[])
		  AND (o.domain IS NULL OR btrim(o.domain) = '')
		  AND length(jeton) >= $2
		  AND lower(jeton) = ANY($3::text[])
	`, [[...NOUVELLE_AQUITAINE_DEPTS], MINIMUM_TOKEN_LENGTH, tokens]);
	const grouped = new Map<string, Organisation[]>();
	for (const row of rows) {
		const group = grouped.get(row.jeton) ?? [];
		group.push({
			id: row.id, name: row.name, city: row.city, dept: row.dept,
			siren: row.siren, domain: row.domain,
		});
		grouped.set(row.jeton, group);
	}
	return grouped;
}

/** QIDs carrying a verified domain, read from public provenance only. */
export async function attributedQids(): Promise<Set<string>> {
	const { rows } = await query<{ qid: string }>(`
		SELECT DISTINCT preuve->>'qid' AS qid
		FROM org_enrichissement
		WHERE champ = 'domaine' AND source LIKE 'wikidata:P856:%' AND preuve->>'qid' IS NOT NULL
	`);
	return new Set(rows.map((row) => row.qid));
}

/** Fetches the public SPARQL results and writes the reusable candidate cache. */
export async function refreshCandidates(outputPath: string): Promise<GeoCandidate[]> {
	const url = `${SPARQL_ENDPOINT}?${new URLSearchParams({ query: SPARQL_QUERY, format: "json" })}`;
	const response = await fetch(url, {
		signal: AbortSignal.timeout(55_000),
		headers: {
			accept: "application/sparql-results+json",
			"user-agent": "RadarCyberNA/1.4 (public-source verification)",
		},
	});
	if (!response.ok) throw new Error(`sparql-http-${response.status}`);
	const payload = await response.json() as {
		results?: { bindings?: Array<Record<string, { value?: string }>> };
	};
	const seen = new Set<string>();
	const candidates: GeoCandidate[] = [];
	for (const binding of payload.results?.bindings ?? []) {
		const candidate = parseSparqlBinding(binding);
		if (!candidate) continue;
		const key = `${candidate.qid}\t${candidate.url}`;
		if (seen.has(key)) continue;
		seen.add(key);
		candidates.push(candidate);
	}
	await writeFile(outputPath, `${candidates
		.map((candidate) => `${candidate.qid}\t${candidate.url}\t${candidate.label.replace(/\t/g, " ")}`).join("\n")}\n`);
	return candidates;
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "300")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "32"))));
	const candidatesPath = option("candidates", "bench/domain-candidates/wikidata-na-sites.tsv");
	const outputPath = option("output", "bench/results/domains-from-geo.json");
	const priorPath = option("prior", "bench/domain-candidates/wikidata-siren-sites.tsv");
	const candidates = process.argv.includes("--refresh")
		? await refreshCandidates(candidatesPath)
		: parseGeoCandidates(await readFile(candidatesPath, "utf8"));
	const prior = new Set((await readFile(priorPath, "utf8")).split("\n")
		.map((line) => line.trim().split("\t")[2]).filter((qid): qid is string => /^Q\d+$/.test(qid ?? "")));
	const before = await measure();
	const tokens = [...new Set(candidates.flatMap((candidate) => labelTokens(candidate.label)))];
	const selected = excludeKnownCandidates(
		selectByLabel(candidates, await organisationsByTokens(tokens)),
		await attributedQids(), prior,
	).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			const page = await fetchPage(selection.candidate.url);
			return pageVerdict(page.html, page.status, page.finalUrl, selection.organisation, selection.domain);
		} catch (error) {
			return {
				ok: false, motif: `fetch-${error instanceof Error ? error.name : "error"}`,
				token: null, confidence: 0, title: null, status: null, finalUrl: null, htmlLength: 0,
			} satisfies Verdict;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry) => entry.verdict.ok);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForGeo(entry.selection, entry.verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.selection.candidate.url],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO NOTHING`,
					[entry.selection.organisation.id, entry.selection.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
				);
			}
		});
	}
	const after = await measure();
	const report = {
		candidates: candidates.length,
		priorQids: prior.size,
		tokens: tokens.length,
		selected: selected.length,
		verified: accepted.length,
		applied: apply,
		before,
		after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			siren: entry.selection.organisation.siren,
			domain: entry.selection.domain,
			qid: entry.selection.candidate.qid,
			label: entry.selection.candidate.label,
			confidence: entry.verdict.confidence,
		})),
	};
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`candidates=${candidates.length} tokens=${tokens.length} selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
