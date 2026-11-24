/**
 * Quinzième source grise : les pages dédiées d'un établissement hébergées sur
 * le site d'un groupe (EMEIS, Colisée, RETAB, …). Ces URL sont publiées par
 * FINESS et déjà prouvées HTTP 200, mais les passes précédentes écartaient
 * leur racine comme place de marché. Une page n'est acceptée que si son
 * adresse nomme l'organisation et si la vérification stricte inchangée passe
 * (statut 200, racine identique après redirection, contenu réel, jeton du nom).
 * Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-groupe.mts \
 *       [--limit=1000] [--concurrency=32] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { inNouvelleAquitaine, measure, normalizeDomain } from "./domain-coverage.mts";
import {
	domainRoot, pageVerdict, withConcurrency, type Verdict,
} from "./expand-domains.mts";
import {
	TRUSTED_SOURCES, expositionCandidates,
	type ExpositionRow, type ExpositionSelection,
} from "./expand-domains-exposition.mts";
import { fetchRetryPage, retryUrls, type PageFetch } from "./expand-domains-retry.mts";
import { isDedicatedPageUrl } from "./expand-domains-shared.mts";

export const SOURCE = "exposition-service:page-groupe:http200";

/** Group sites whose registry records point to one dedicated page per establishment. */
export const GROUP_ROOTS = new Set([
	"emeis.fr", "retab.fr", "colisee.fr", "cmso.com", "medilab-group.eu",
]);

export interface GroupResult {
	verdict: Verdict;
	url: string;
	tried: string[];
}

/** One dedicated page per organisation, without reserving a root exclusive to it. */
export function selectGroupCandidates(rows: ExpositionRow[]): ExpositionSelection[] {
	const usedOrgs = new Set<number>();
	const usedUrls = new Set<string>();
	const selected: ExpositionSelection[] = [];
	for (const row of rows) {
		if (!TRUSTED_SOURCES.has(row.source) || usedOrgs.has(row.orgId)) continue;
		if (!isDedicatedPageUrl(row.name, null, row.sourceUrl) || usedUrls.has(row.sourceUrl)) continue;
		const domain = domainRoot(row.sourceUrl);
		if (!domain || !GROUP_ROOTS.has(domain) || normalizeDomain(row.evidenceDomain) !== domain) continue;
		if (!isDedicatedPageUrl(row.name, row.city, row.sourceUrl) || usedUrls.has(row.sourceUrl)) continue;
		usedOrgs.add(row.orgId);
		usedUrls.add(row.sourceUrl);
		selected.push({
			row,
			organisation: {
				id: row.orgId, name: row.name, city: row.city, dept: row.dept, siren: row.siren,
			},
			domain,
		});
	}
	return selected;
}

/** Keeps the first answering variant that still names the establishment. */
export async function verifyGroupCandidate(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<GroupResult | null> {
	const { name } = selection.organisation;
	const tried: string[] = [];
	for (const url of retryUrls(selection.row.sourceUrl)) {
		tried.push(url);
		if (domainRoot(url) !== selection.domain) continue;
		if (!isDedicatedPageUrl(name, null, url)) continue;
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		if (!isDedicatedPageUrl(name, null, page.finalUrl)) continue;
		const verdict = pageVerdict(
			page.html, page.status, page.finalUrl, selection.organisation, selection.domain,
		);
		if (verdict.ok) return { verdict, url, tried };
	}
	return null;
}

/** Provenance row tying the dedicated group page to the live strict check. */
export function provenanceForGroup(selection: ExpositionSelection, result: GroupResult) {
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
			urlDediee: true,
			statut: result.verdict.status,
			urlFinale: result.verdict.finalUrl,
			titre: result.verdict.title,
			token: result.verdict.token,
			motif: result.verdict.motif,
		},
	};
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "1000")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "32"))));
	const outputPath = option("output", "bench/results/domains-from-group-pages.json");
	const before = await measure();
	const existing = await query<{ orgId: number }>("SELECT org_id AS \"orgId\" FROM org_enrichissement WHERE champ = 'domaine'");
	const alreadyProven = new Set(existing.rows.map((row) => row.orgId));
	const selected = selectGroupCandidates(await expositionCandidates())
		.filter((entry) => !alreadyProven.has(entry.organisation.id))
		.slice(0, limit);
	const results = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyGroupCandidate(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: GroupResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForGroup(entry.selection, entry.result);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.result.url],
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
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			siren: entry.selection.organisation.siren,
			name: entry.selection.organisation.name,
			domain: entry.selection.domain,
			page: entry.result.url,
			registry: entry.selection.row.source,
			confidence: entry.result.verdict.confidence,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
