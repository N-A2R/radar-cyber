#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Vérifie le critère de sortie « exposition par criticité exploitable ».
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-exposition-risque.mts
 *
 * Sortie brute attendue par le juge :
 *   count >= 25 pour les catégories base_de_donnees / vpn / rdp avec
 *   epss_max >= 0,1 ou KEV, et zéro ligne sans source ou plus vieille que 7 jours.
 */
import { closePools, query } from "../apps/api/src/db.js";

const SEUIL = 25;

try {
	const dangereux = await query<{ n: number }>(
		`SELECT count(*)::int AS n
		   FROM exposition_risque
		  WHERE categorie IN ('base_de_donnees', 'vpn', 'rdp')
		    AND (epss_max >= 0.1 OR kev)`,
	);
	const invalides = await query<{ n: number }>(
		`SELECT count(*)::int AS n
		   FROM exposition_risque
		  WHERE source_url IS NULL OR source_url = ''
		     OR consulted_at < now() - interval '7 days'`,
	);
	const parCategorie = await query<{ categorie: string; n: number }>(
		`SELECT categorie, count(*)::int AS n
		   FROM exposition_risque
		  WHERE categorie IN ('base_de_donnees', 'vpn', 'rdp')
		    AND (epss_max >= 0.1 OR kev)
		  GROUP BY categorie
		  ORDER BY categorie`,
	);
	const total = Number(dangereux.rows[0]?.n ?? 0);
	const lignesInvalides = Number(invalides.rows[0]?.n ?? 0);

	console.log(`count=${total}`);
	console.log(`categories=${parCategorie.rows.map((row) => `${row.categorie}:${row.n}`).join(",")}`);
	console.log(`lignes_sans_source_ou_perimees=${lignesInvalides}`);
	console.log(`seuil=${SEUIL}`);
	console.log(`verdict=${total >= SEUIL && lignesInvalides === 0 ? "ok" : "echec"}`);

	if (total < SEUIL || lignesInvalides !== 0) process.exitCode = 1;
} finally {
	await closePools();
}
