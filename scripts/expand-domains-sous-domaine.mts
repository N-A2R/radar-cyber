/**
 * Réaligne une preuve HTTP 200 déjà vérifiée avec l'hôte exact qui a répondu.
 * Certaines organisations portent la racine d'un groupe (aeroport.fr) alors
 * que la page prouvée est un sous-domaine nommé (bordeaux.aeroport.fr) : la
 * mesure ne peut pas les compter. Aucun domaine n'est deviné ici — l'hôte
 * final provient de la preuve existante et la page est revérifiée en direct
 * avec la preuve stricte inchangée. Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-sous-domaine.mts [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS } from "./domain-coverage.mts";
import { pageVerdict, withConcurrency, type Verdict } from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "domaine:sous-domaine-verifie:http200";

export interface SubdomainRow {
	orgId: number;
	name: string;
	domain: string | null;
	valeur: string;
	source: string;
	confiance: number;
	preuve: Record<string, unknown>;
}

export interface RepairedSubdomain {
	host: string;
	verdict: Verdict;
	preuve: Record<string, unknown>;
}

/** A counted-impossible proof whose final URL is a named subdomain of the stored root. */
export function isSubdomainProof(row: SubdomainRow): boolean {
	const stored = normalizeDomain(row.domain);
	if (!stored || normalizeDomain(row.valeur) !== stored) return false;
	if (String(row.preuve.statut) !== "200" || !(row.confiance >= 0.8)) return false;
	const final = row.preuve.urlFinale;
	if (typeof final !== "string" || !/^https?:\/\//i.test(final)) return false;
	const host = normalizeDomain(final);
	return !!host && host !== stored && host.endsWith(`.${stored}`);
}

/** Re-checks the recorded final page; only the exact answering host may replace the root. */
export async function repairSubdomain(
	row: SubdomainRow,
	fetcher: PageFetch = fetchRetryPage,
): Promise<RepairedSubdomain | null> {
	if (!isSubdomainProof(row)) return null;
	const host = normalizeDomain(String(row.preuve.urlFinale))!;
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(String(row.preuve.urlFinale));
	} catch {
		return null;
	}
	const verdict = pageVerdict(page.html, page.status, page.finalUrl, {
		id: row.orgId, name: row.name, city: null, dept: null, siren: null,
	}, host);
	if (!verdict.ok) return null;
	return {
		host,
		verdict,
		preuve: {
			...row.preuve,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
			racineInitiale: normalizeDomain(row.domain),
			reverifieLe: new Date().toISOString(),
		},
	};
}

/** Nouvelle-Aquitaine proofs whose final URL sits on a subdomain, read by domain only. */
export async function subdomainRows(): Promise<SubdomainRow[]> {
	const { rows } = await query<SubdomainRow>(`
		SELECT e.org_id AS "orgId", o.name, o.domain, e.valeur, e.source, e.confiance, e.preuve
		FROM org_enrichissement e
		JOIN org o ON o.id = e.org_id
		WHERE e.champ = 'domaine'
		  AND o.dept = ANY($1::text[])
		  AND e.preuve->>'statut' = '200'
		  AND e.preuve->>'urlFinale' IS NOT NULL
	`, [[...NOUVELLE_AQUITAINE_DEPTS]]);
	return rows.filter(isSubdomainProof);
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const outputPath = option("output", "bench/results/domains-from-sous-domaine.json");
	const before = await measure();
	const selected = await subdomainRows();
	const results = await withConcurrency(selected, 8, async (row) => {
		try {
			return await repairSubdomain(row);
		} catch {
			return null;
		}
	});
	const repaired = selected
		.map((row, index) => ({ row, result: results[index] }))
		.filter((entry): entry is { row: SubdomainRow; result: RepairedSubdomain } => !!entry.result);
	if (apply && repaired.length) {
		await withTransaction(async (client) => {
			for (const entry of repaired) {
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND domain = $4",
					[entry.row.orgId, entry.result.host, String(entry.row.preuve.urlFinale), entry.row.domain],
				);
				await client.query(
					`UPDATE org_enrichissement SET valeur = $2, source = $3, confiance = $4, preuve = $5::jsonb
					 WHERE org_id = $1 AND champ = 'domaine' AND valeur = $6`,
					[
						entry.row.orgId, entry.result.host, SOURCE, entry.result.verdict.confidence,
						JSON.stringify(entry.result.preuve), entry.row.valeur,
					],
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
			domain: entry.result.host,
			previousDomain: entry.row.domain,
			page: entry.result.preuve.urlFinale,
			token: entry.result.verdict.token,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${repaired.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
