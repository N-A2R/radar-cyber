#!/usr/bin/env -S npx tsx
/**
 * Rejoue le critère de sortie de la tranche corroboration des revendications.
 *
 *   tsx scripts/verifie-corroboration-revendications.mts
 *
 * Sortie brute : le compte exigé (>= 10), puis la preuve qu'aucune annonce
 * isolée n'a rejoint la diffusion publique. Code de sortie 1 si l'un des deux
 * contrôles échoue.
 */
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { closePools, query } = await import("../apps/api/src/db.js");

try {
	const critere = await query<{ n: string }>(
		`SELECT count(*)::text AS n
		   FROM leak_claim
		  WHERE na AND corroboration_score >= 2 AND org_id IS NOT NULL`,
	);
	const isolees = await query<{ n: string }>(
		`SELECT count(*)::text AS n
		   FROM leak_claim_public
		  WHERE corroboration_score = 0`,
	);
	const distribution = await query<{ corroboration_score: number; n: string }>(
		`SELECT corroboration_score, count(*)::text AS n
		   FROM leak_claim
		  GROUP BY corroboration_score
		  ORDER BY corroboration_score`,
	);

	console.log("SELECT count(*) FROM leak_claim WHERE na AND corroboration_score >= 2 AND org_id IS NOT NULL :");
	console.log(critere.rows[0]?.n ?? "0");
	console.log("annonces isolées (score 0) présentes dans leak_claim_public :");
	console.log(isolees.rows[0]?.n ?? "0");
	console.log("distribution des scores :");
	for (const row of distribution.rows) {
		console.log(`  score ${row.corroboration_score} : ${row.n}`);
	}

	const atteint = Number(critere.rows[0]?.n ?? 0) >= 10;
	const fuite = Number(isolees.rows[0]?.n ?? 0) > 0;
	console.log(atteint ? "cible >= 10 : ATTEINTE" : "cible >= 10 : NON ATTEINTE");
	console.log(fuite ? "diffusion publique : FUITE D'ANNONCE ISOLÉE" : "diffusion publique : aucune annonce isolée");
	if (!atteint || fuite) process.exitCode = 1;
} finally {
	await closePools();
}
