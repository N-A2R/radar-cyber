#!/usr/bin/env -S npx tsx
/**
 * Recalcule `leak_claim.corroboration_score` et vérifie la surface publique.
 *
 *   tsx scripts/backfill-corroboration-revendications.mts
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/backfill-corroboration-revendications.mts
 *
 * Le calcul est fait par la fonction SQL de la migration 204, à partir de
 * `event`, `fuite_reference` et de la seconde source. Le script est idempotent :
 * un rejeu recalcule les mêmes scores sans rien dupliquer.
 */
// `db.ts` lit DATABASE_URL à l'import : on le fixe avant l'import dynamique,
// comme le font les autres scripts d'exploitation du dépôt.
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { closePools, query } = await import("../apps/api/src/db.js");

type Distribution = { corroboration_score: number; n: string };

try {
	const updated = await query<{ n: number }>(
		"SELECT public.recompute_leak_claim_corroboration() AS n",
	);
	const distribution = await query<Distribution>(
		`SELECT corroboration_score, count(*)::text AS n
		   FROM leak_claim
		  GROUP BY corroboration_score
		  ORDER BY corroboration_score`,
	);
	const objectif = await query<{ n: string }>(
		`SELECT count(*)::text AS n
		   FROM leak_claim
		  WHERE na AND corroboration_score >= 2 AND org_id IS NOT NULL`,
	);
	const publiques = await query<{ total: string; isolees: string }>(
		`SELECT count(*)::text AS total,
		        count(*) FILTER (WHERE corroboration_score = 0)::text AS isolees
		   FROM leak_claim_public`,
	);

	console.log(`lignes recalculées : ${updated.rows[0]?.n ?? 0}`);
	for (const row of distribution.rows) {
		console.log(`  score ${row.corroboration_score} : ${row.n}`);
	}
	console.log(
		`critère : ${objectif.rows[0]?.n ?? 0} revendication(s) NA corroborée(s) et rattachée(s) (cible >= 10)`,
	);
	console.log(
		`diffusion publique : ${publiques.rows[0]?.total ?? 0} ligne(s), dont ${publiques.rows[0]?.isolees ?? 0} annonce(s) isolée(s)`,
	);
	if (Number(objectif.rows[0]?.n ?? 0) < 10) process.exitCode = 1;
	if (Number(publiques.rows[0]?.isolees ?? 0) > 0) process.exitCode = 1;
} finally {
	await closePools();
}
