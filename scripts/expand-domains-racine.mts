/**
 * Deuxième source grise : les candidats Wikidata P856 dont le SIREN ne
 * correspond à aucune organisation de Nouvelle-Aquitaine sont appariés par
 * jeton distinctif de la racine de domaine. La même preuve HTTP stricte que
 * `expand-domains.mts` est exigée avant toute écriture.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-racine.mts \
 *       --candidates=bench/domain-candidates/wikidata-siren-sites.tsv \
 *       --limit=300 [--concurrency=48] [--labels-from=rapport.json] [--apply]
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
	parseCandidate,
	withConcurrency,
	type Candidate,
	type Organisation,
	type Selection,
	type Verdict,
} from "./expand-domains.mts";
const WIKIDATA_LABELS_URL = "https://www.wikidata.org/w/api.php";
const LABEL_BATCH_SIZE = 50;
const MIN_LABEL_LENGTH = 6;

const MINIMUM_TOKEN_LENGTH = 6;
const DEFAULT_MAX_ORGS_PER_TOKEN = 3;
const DEFAULT_MAX_CANDIDATES_PER_TOKEN = 5;

/** Distinctive accent-free words of the candidate domain's first label. */
export function rootTokens(url: string): string[] {
	const root = domainRoot(url);
	if (!root) return [];
	const plain = root.split(".")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	return [...new Set(plain.split(/[^a-z0-9]+/).filter(
		(token) => token.length >= MINIMUM_TOKEN_LENGTH && !GENERIC_TOKENS.has(token),
	))];
}

/** Groups candidate URLs by the distinctive token of their domain root. */
export function candidatesByToken(candidates: Candidate[]): Map<string, Candidate[]> {
	const groups = new Map<string, Candidate[]>();
	for (const candidate of candidates) {
		for (const token of rootTokens(candidate.url)) {
			const group = groups.get(token) ?? [];
			if (!group.includes(candidate)) group.push(candidate);
			groups.set(token, group);
		}
	}
	return groups;
}

/**
 * Pairs a candidate with an organisation only when its root token is rare on
 * both sides, and never when the SIREN route already covers the organisation.
 */
export function selectByRootToken(
	candidates: Candidate[],
	organisationsByToken: Map<string, Organisation[]>,
	options: { maxOrgsPerToken?: number; maxCandidatesPerToken?: number } = {},
): Selection[] {
	const maxOrgs = options.maxOrgsPerToken ?? DEFAULT_MAX_ORGS_PER_TOKEN;
	const maxCandidates = options.maxCandidatesPerToken ?? DEFAULT_MAX_CANDIDATES_PER_TOKEN;
	const byToken = candidatesByToken(candidates);
	const used = new Set<number>();
	const usedCandidates = new Set<string>();
	const usedSirens = new Set<string>();
	const usedDomains = new Set<string>();
	const selected: Selection[] = [];
	for (const [token, organisations] of organisationsByToken) {
		const group = byToken.get(token) ?? [];
		if (organisations.length > maxOrgs || group.length > maxCandidates) continue;
		for (const candidate of group) {
			if (usedCandidates.has(candidate.qid)) continue;
			const domain = domainRoot(candidate.url);
			if (!domain || usedDomains.has(domain)) continue;
			for (const organisation of organisations) {
				if (used.has(organisation.id)) continue;
				if (organisation.siren && (organisation.siren === candidate.siren || usedSirens.has(organisation.siren))) continue;
				used.add(organisation.id);
				usedCandidates.add(candidate.qid);
				usedDomains.add(domain);
				if (organisation.siren) usedSirens.add(organisation.siren);
				selected.push({ candidate, organisation, domain });
			}
		}
	}
	return selected;
}

/** A candidate already used by a verified-domain route cannot be attributed again. */
export function excludeAttributedCandidates(
	selections: Selection[],
	attributedQids: ReadonlySet<string>,
): Selection[] {
	return selections.filter((selection) => !attributedQids.has(selection.candidate.qid));
}

/** Provenance keeps the root-match route distinct from the SIREN route. */
export function provenanceForRacine(selection: Selection, verdict: Verdict, token: string, label: string) {
	return {
		source: "wikidata:P856:racine:http200",
		confiance: verdict.confidence,
		preuve: {
			qid: selection.candidate.qid,
			siren: selection.candidate.siren,
			source: "wikidata:P856:racine",
			urlItem: `https://www.wikidata.org/wiki/${selection.candidate.qid}`,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
			appariement: "racine",
			jeton: token,
			label,
		},
	};
}

/** True when the Wikidata label identifies the organisation by its full name. */
export function labelMatches(name: string, label: string | null | undefined): boolean {
	if (!label) return false;
	const compact = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/[^a-z0-9]/g, "");
	const needle = compact(label);
	return needle.length >= MIN_LABEL_LENGTH && compact(name).includes(needle);
}

/** Reads French or English labels from Wikidata in public batch requests. */
export async function fetchLabels(qids: string[]): Promise<Map<string, string>> {
	const labels = new Map<string, string>();
	for (let index = 0; index < qids.length; index += LABEL_BATCH_SIZE) {
		const batch = qids.slice(index, index + LABEL_BATCH_SIZE);
		const url = `${WIKIDATA_LABELS_URL}?${new URLSearchParams({
			action: "wbgetentities", ids: batch.join("|"), props: "labels",
			languages: "fr|en", format: "json",
		})}`;
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(10_000),
				headers: { "user-agent": "RadarCyberNA/1.3 (public-source verification)" },
			});
			if (!response.ok) continue;
			const payload = await response.json() as {
				entities?: Record<string, { labels?: Record<string, { value?: string }> }>;
			};
			for (const qid of batch) {
				const entity = payload.entities?.[qid];
				const label = entity?.labels?.fr?.value ?? entity?.labels?.en?.value;
				if (label) labels.set(qid, label);
			}
		} catch {
			// A missing label cannot confirm an attribution; the pair is skipped.
		}
	}
	return labels;
}

/** Reuses labels recorded by a dry run when the Wikidata API is rate-limited. */
export function labelsFromReport(report: { domains?: Array<{ qid: string; label: string }> }): Map<string, string> {
	const labels = new Map<string, string>();
	for (const domain of report.domains ?? []) {
		if (domain.qid && domain.label) labels.set(domain.qid, domain.label);
	}
	return labels;
}

/** Reads only Nouvelle-Aquitaine organisations whose name shares a candidate token. */
async function organisationsByToken(tokens: string[]): Promise<Map<string, Organisation[]>> {
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

/** QIDs already carrying a verified domain, read from public provenance only. */
async function attributedQids(): Promise<Set<string>> {
	const { rows } = await query<{ qid: string }>(`
		SELECT DISTINCT preuve->>'qid' AS qid
		FROM org_enrichissement
		WHERE champ = 'domaine'
		  AND source IN ('wikidata:P856:http200', 'wikidata:P856:racine:http200')
		  AND preuve->>'qid' IS NOT NULL
	`);
	return new Set(rows.map((row) => row.qid));
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "300")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "32"))));
	const outputPath = option("output", "bench/results/domains-from-root-match.json");
	const candidatesPath = option("candidates", "bench/domain-candidates/wikidata-siren-sites.tsv");
	const candidates = (await readFile(candidatesPath, "utf8"))
		.split("\n").map(parseCandidate)
		.filter((candidate): candidate is Candidate => candidate !== null);
	const before = await measure();
	const tokens = [...new Set(candidates.flatMap((candidate) => rootTokens(candidate.url)))];
	const selected = excludeAttributedCandidates(
		selectByRootToken(candidates, await organisationsByToken(tokens)), await attributedQids(),
	).slice(0, limit);
	const labelsPath = option("labels-from", "");
	const labels = labelsPath
		? labelsFromReport(JSON.parse(await readFile(labelsPath, "utf8")) as { domains?: Array<{ qid: string; label: string }> })
		: await fetchLabels([...new Set(selected.map((selection) => selection.candidate.qid))]);
	const confirmed = selected.filter((selection) =>
		labelMatches(selection.organisation.name, labels.get(selection.candidate.qid)));
	const verdicts = await withConcurrency(confirmed, concurrency, async (selection) => {
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
	const accepted = confirmed
		.map((selection, index) => ({
			selection, verdict: verdicts[index],
			token: rootTokens(selection.candidate.url)[0] ?? "",
			label: labels.get(selection.candidate.qid) ?? "",
		}))
		.filter((entry) => entry.verdict.ok);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForRacine(entry.selection, entry.verdict, entry.token, entry.label);
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
		tokens: tokens.length,
		examined: selected.length,
		labelConfirmed: confirmed.length,
		verified: accepted.length,
		applied: apply,
		before,
		after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			siren: entry.selection.candidate.siren,
			domain: entry.selection.domain,
			qid: entry.selection.candidate.qid,
			jeton: entry.token,
			label: entry.label,
			confidence: entry.verdict.confidence,
		})),
	};
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`candidates=${candidates.length} tokens=${tokens.length} examined=${selected.length} confirmed=${confirmed.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
