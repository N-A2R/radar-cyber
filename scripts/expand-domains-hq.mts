/**
 * Fourth public-source route: Wikidata P856 official websites for entities
 * headquartered in Nouvelle-Aquitaine (P159 -> P131* region). The geographic
 * route above used the entity's own location; this one reaches companies whose
 * registered place is elsewhere in the region but whose head office is here.
 * Candidates are paired by full Wikidata label in exactly one organisation
 * name and still need the same strict HTTP proof before any write.
 *
 * Usage (DATABASE_URL selects the database):
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-hq.mts \
 *       [--refresh] [--limit=400] [--concurrency=32] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, withTransaction } from "../apps/api/src/db.js";
import { measure } from "./domain-coverage.mts";
import {
	fetchPage, pageVerdict, withConcurrency,
	type Verdict,
} from "./expand-domains.mts";
import {
	attributedQids, excludeKnownCandidates, labelTokens, organisationsByTokens,
	parseGeoCandidates, parseSparqlBinding, selectByLabel, type GeoSelection,
} from "./expand-domains-geo.mts";

export const REGION_QID = "Q18678082";
export const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
export const SPARQL_QUERY = `SELECT DISTINCT ?item ?site ?itemLabel WHERE {
  ?item wdt:P856 ?site ; wdt:P159/wdt:P131* wd:${REGION_QID} .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" . }
}`;
export const HQ_SOURCE = "wikidata:P856:siege:http200";
export const DEFAULT_PRIOR_CANDIDATES = "bench/domain-candidates/wikidata-siren-sites.tsv,bench/domain-candidates/wikidata-na-sites.tsv";

/** QID column of a cached Wikidata candidate TSV, ignoring malformed rows. */
export function parsePriorQids(text: string): Set<string> {
	const qids = new Set<string>();
	for (const line of text.split("\n")) {
		const qid = line.trim().split("\t")[2];
		if (/^Q\d+$/.test(qid ?? "")) qids.add(qid);
	}
	return qids;
}

/** Union of QIDs already examined by the SIREN export and geographic routes. */
export async function loadPriorQids(paths: string[]): Promise<Set<string>> {
	const qids = new Set<string>();
	for (const path of paths) {
		for (const qid of parsePriorQids(await readFile(path, "utf8"))) qids.add(qid);
	}
	return qids;
}

/** Provenance keeps the head-office route distinct from the other three. */
export function provenanceForHq(selection: GeoSelection, verdict: Verdict) {
	return {
		source: HQ_SOURCE,
		confiance: verdict.confidence,
		preuve: {
			qid: selection.candidate.qid,
			label: selection.candidate.label,
			source: "wikidata:P856:siege",
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

/** Fetches the public head-office SPARQL results into a reusable candidate cache. */
export async function refreshHqCandidates(outputPath: string): Promise<number> {
	const url = `${SPARQL_ENDPOINT}?${new URLSearchParams({ query: SPARQL_QUERY, format: "json" })}`;
	const response = await fetch(url, {
		signal: AbortSignal.timeout(55_000),
		headers: {
			accept: "application/sparql-results+json",
			"user-agent": "RadarCyberNA/1.5 (public-source verification)",
		},
	});
	if (!response.ok) throw new Error(`sparql-http-${response.status}`);
	const payload = await response.json() as {
		results?: { bindings?: Array<Record<string, { value?: string }>> };
	};
	const seen = new Set<string>();
	const rows: string[] = [];
	for (const binding of payload.results?.bindings ?? []) {
		const candidate = parseSparqlBinding(binding);
		if (!candidate) continue;
		const key = `${candidate.qid}\t${candidate.url}`;
		if (seen.has(key)) continue;
		seen.add(key);
		rows.push(`${candidate.qid}\t${candidate.url}\t${candidate.label.replace(/\t/g, " ")}`);
	}
	await writeFile(outputPath, `${rows.join("\n")}\n`);
	return rows.length;
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "400")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "32"))));
	const candidatesPath = option("candidates", "bench/domain-candidates/wikidata-na-hq-sites.tsv");
	const outputPath = option("output", "bench/results/domains-from-hq.json");
	const priorPaths = option("prior", DEFAULT_PRIOR_CANDIDATES).split(",").filter(Boolean);
	if (process.argv.includes("--refresh")) {
		console.log(`hq_candidates_cached=${await refreshHqCandidates(candidatesPath)}`);
	}
	const candidates = parseGeoCandidates(await readFile(candidatesPath, "utf8"));
	const prior = await loadPriorQids(priorPaths);
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
				const proof = provenanceForHq(entry.selection, entry.verdict);
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
	console.log(`candidates=${candidates.length} priorQids=${prior.size} selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
