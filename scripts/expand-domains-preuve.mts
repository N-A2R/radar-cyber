/**
 * Rattrapage des preuves HTTP 200 déjà collectées mais incomplètes : la page
 * nommait l'organisation et répondait 200, mais le champ `urlFinale` manquait,
 * ce qui empêchait la mesure de compter le domaine. Aucun domaine n'est deviné
 * ici : l'URL enregistrée est revérifiée en direct avec la preuve stricte
 * inchangée (statut 200, racine identique, contenu réel, jeton du nom).
 * Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-preuve.mts [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS } from "./domain-coverage.mts";
import { pageVerdict, withConcurrency, type Verdict } from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "domaine:reverification-http200";

export interface UnprovenRow {
	orgId: number;
	name: string;
	domain: string | null;
	valeur: string;
	source: string;
	preuve: Record<string, unknown>;
}

export interface RepairedProof {
	preuve: Record<string, unknown>;
	verdict: Verdict;
}

/** A stored HTTP 200 proof that the coverage metric cannot count yet. */
export function isRepairable(row: UnprovenRow): boolean {
	const domain = normalizeDomain(row.domain);
	if (!domain || normalizeDomain(row.valeur) !== domain) return false;
	if (String(row.preuve.statut) !== "200") return false;
	if (typeof row.preuve.urlFinale === "string" && row.preuve.urlFinale.trim()) return false;
	return typeof row.preuve.url === "string" && /^https?:\/\//i.test(row.preuve.url);
}

/** Re-checks the stored page with the unchanged strict proof and adds its final URL. */
export async function repairProof(
	row: UnprovenRow,
	fetcher: PageFetch = fetchRetryPage,
): Promise<RepairedProof | null> {
	if (!isRepairable(row)) return null;
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(String(row.preuve.url));
	} catch {
		return null;
	}
	const verdict = pageVerdict(page.html, page.status, page.finalUrl, {
		id: row.orgId, name: row.name, city: null, dept: null, siren: null,
	}, normalizeDomain(row.domain)!);
	if (!verdict.ok) return null;
	return {
		verdict,
		preuve: {
			...row.preuve,
			urlFinale: verdict.finalUrl,
			urlReponse: String(row.preuve.url),
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
			htmlLength: verdict.htmlLength,
			reverifieLe: new Date().toISOString(),
		},
	};
}

/** Only Nouvelle-Aquitaine proofs with a stored URL but no final URL. */
export async function repairableRows(): Promise<UnprovenRow[]> {
	const { rows } = await query<UnprovenRow>(`
		SELECT e.org_id AS "orgId", o.name, o.domain, e.valeur, e.source, e.preuve
		FROM org_enrichissement e
		JOIN org o ON o.id = e.org_id
		WHERE e.champ = 'domaine'
		  AND o.dept = ANY($1::text[])
		  AND e.preuve->>'statut' = '200'
		  AND e.preuve->>'urlFinale' IS NULL
	`, [[...NOUVELLE_AQUITAINE_DEPTS]]);
	return rows.filter(isRepairable);
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const outputPath = option("output", "bench/results/domains-from-preuve-reparee.json");
	const before = await measure();
	const selected = await repairableRows();
	const results = await withConcurrency(selected, 8, async (row) => {
		try {
			return await repairProof(row);
		} catch {
			return null;
		}
	});
	const repaired = selected
		.map((row, index) => ({ row, result: results[index] }))
		.filter((entry): entry is { row: UnprovenRow; result: RepairedProof } => !!entry.result);
	if (apply && repaired.length) {
		await withTransaction(async (client) => {
			for (const entry of repaired) {
				await client.query(
					`UPDATE org_enrichissement SET source = $2, preuve = $3::jsonb
					 WHERE org_id = $1 AND champ = 'domaine' AND preuve->>'urlFinale' IS NULL`,
					[entry.row.orgId, SOURCE, JSON.stringify(entry.result.preuve)],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: repaired.length, applied: apply, before, after,
		domains: repaired.map((entry) => ({
			orgId: entry.row.orgId,
			name: entry.row.name,
			domain: normalizeDomain(entry.row.domain),
			page: entry.result.preuve.urlFinale,
			token: entry.result.verdict.token,
			previousSource: entry.row.source,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${repaired.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
