/**
 * Cinquième source grise : les sites Wikidata P856 des entités situées ou
 * ayant leur siège en Nouvelle-Aquitaine, non retenus par l'appariement du
 * libellé entier, sont appariés par jeton distinctif de la racine de domaine.
 * Le libellé Wikidata et le jeton de racine doivent tous deux nommer
 * l'organisation ; la même preuve HTTP stricte que les routes précédentes est
 * exigée avant toute écriture.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-racine-regionale.mts \
 *       [--limit=500] [--concurrency=24] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, ingestQuery, withTransaction } from "../apps/api/src/db.js";
import { measure, NOUVELLE_AQUITAINE_DEPTS } from "./domain-coverage.mts";
import {
	domainRoot, fetchPage, pageVerdict, withConcurrency, type Verdict,
} from "./expand-domains.mts";
import {
	attributedQids, compact, parseGeoCandidates, type GeoCandidate, type GeoSelection,
} from "./expand-domains-geo.mts";
import { labelMatches, rootTokens } from "./expand-domains-racine.mts";

export const SOURCE = "wikidata:P856:racine-regionale:http200";
export const DEFAULT_CANDIDATES = "bench/domain-candidates/wikidata-na-sites.tsv,bench/domain-candidates/wikidata-na-hq-sites.tsv";
const LABEL_BATCH_SIZE = 100;
const MAX_ORGS_PER_LABEL = 25;
const MIN_LABEL_LENGTH = 6;

/**
 * Pairs a regional Wikidata site only when the distinctive domain-root token
 * and the full Wikidata label both point at the same organisation.
 */
export function selectRegionalRootMatches(
	candidates: GeoCandidate[],
	organisationsByLabel: Map<string, Array<GeoSelection["organisation"]>>,
	attributed: ReadonlySet<string>,
	maxOrgsPerLabel: number = MAX_ORGS_PER_LABEL,
): GeoSelection[] {
	const selected: GeoSelection[] = [];
	const usedOrgs = new Set<number>();
	const usedQids = new Set<string>();
	const usedDomains = new Set<string>();
	for (const candidate of candidates) {
		const domain = domainRoot(candidate.url);
		const token = rootTokens(candidate.url)[0];
		const label = compact(candidate.label);
		if (!domain || !token || label.length < MIN_LABEL_LENGTH || !label.includes(token)) continue;
		if (attributed.has(candidate.qid) || usedQids.has(candidate.qid) || usedDomains.has(domain)) continue;
		const group = organisationsByLabel.get(label) ?? [];
		if (group.length > maxOrgsPerLabel) continue;
		const matches = group.filter((organisation) => !usedOrgs.has(organisation.id)
			&& compact(organisation.name).includes(token)
			&& labelMatches(organisation.name, candidate.label));
		if (matches.length !== 1) continue;
		const [organisation] = matches;
		usedOrgs.add(organisation.id);
		usedQids.add(candidate.qid);
		usedDomains.add(domain);
		selected.push({ candidate, organisation, domain });
	}
	return selected;
}

/** Traceable provenance for the regional root-token route. */
export function provenanceForRegionalRoot(selection: GeoSelection, verdict: Verdict, token: string) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			qid: selection.candidate.qid,
			label: selection.candidate.label,
			source: "wikidata:P856:racine-regionale",
			urlItem: `https://www.wikidata.org/wiki/${selection.candidate.qid}`,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
			appariement: "racine-regionale",
			jeton: token,
		},
	};
}

/** Trigram-indexed label lookup, batched to stay inside the ingest timeout. */
export async function organisationsForLabels(labels: string[]): Promise<Map<string, Array<GeoSelection["organisation"]>>> {
	const unique = [...new Set(labels.map(compact).filter((label) => label.length >= MIN_LABEL_LENGTH))];
	const grouped = new Map<string, Array<GeoSelection["organisation"]>>();
	for (let index = 0; index < unique.length; index += LABEL_BATCH_SIZE) {
		const batch = unique.slice(index, index + LABEL_BATCH_SIZE);
		const { rows } = await ingestQuery<GeoSelection["organisation"] & { name_norm: string | null }>(`
			SELECT o.id, o.name, o.city, o.dept, o.siren, o.domain, o.name_norm
			FROM org o
			WHERE o.dept = ANY($1::text[])
			  AND (o.domain IS NULL OR btrim(o.domain) = '')
			  AND o.name_norm ILIKE ANY($2::text[])
		`, [[...NOUVELLE_AQUITAINE_DEPTS], batch.map((label) => `%${label}%`)]);
		for (const row of rows) {
			const name = compact(row.name);
			for (const label of batch) {
				if (!name.includes(label)) continue;
				const group = grouped.get(label) ?? [];
				group.push({
					id: row.id, name: row.name, city: row.city, dept: row.dept,
					siren: row.siren, domain: row.domain,
				});
				grouped.set(label, group);
			}
		}
	}
	return grouped;
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "500")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "24"))));
	const maxOrgsPerLabel = Math.max(1, Number(option("max-orgs", String(MAX_ORGS_PER_LABEL))));
	const outputPath = option("output", "bench/results/domains-from-racine-regionale.json");
	const candidatesPath = option("candidates", DEFAULT_CANDIDATES);
	const candidates = (await Promise.all(candidatesPath.split(",").filter(Boolean).map(async (path) =>
		parseGeoCandidates(await readFile(path, "utf8"))))).flat();
	const before = await measure();
	const labels = [...new Set(candidates.map((candidate) => candidate.label))];
	const selected = selectRegionalRootMatches(
		candidates, await organisationsForLabels(labels), await attributedQids(), maxOrgsPerLabel,
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
				const proof = provenanceForRegionalRoot(
					entry.selection, entry.verdict, rootTokens(entry.selection.candidate.url)[0] ?? "",
				);
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
		labels: labels.length,
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
	console.log(`candidates=${candidates.length} labels=${labels.length} selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
