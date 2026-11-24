#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Vérifie le critère « CVE prioritaires par EPSS croisé à l'exposition ».
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-epss-exposure.mts
 *
 * La première ligne est le résultat brut de la requête exacte du juge.
 */
import { closePools, query } from "../apps/api/src/db.js";
import { lireCritereEpssExposition, REGLE_EPSS_EXPOSITION, TOP_N } from "../apps/api/src/epss/exposure-eval.js";

const CRITERE = "SELECT count(*) FILTER (WHERE confirmed)::float/count(*) FROM epss_exposure_eval WHERE rank<=50;";
// Même calcul, avec un alias pour que `pg` retrouve la valeur : la requête
// brute du juge n'a pas de nom de colonne exploitable côté client.
const CRITERE_ALIAS = "SELECT count(*) FILTER (WHERE confirmed)::float/count(*) AS ratio FROM epss_exposure_eval WHERE rank<=50";
const SEUIL = 0.6;

try {
	const brut = await query<{ ratio: number | null }>(CRITERE_ALIAS);
	const detail = await lireCritereEpssExposition();
	const ratio = brut.rows[0]?.ratio ?? 0;

	console.log(`requete=${CRITERE}`);
	console.log(`ratio=${ratio}`);
	console.log(`confirmes=${detail.confirmes}`);
	console.log(`lignes=${detail.lignes}`);
	console.log(`top=${TOP_N}`);
	console.log(`regle=${REGLE_EPSS_EXPOSITION}`);
	console.log(`seuil=${SEUIL}`);
	console.log(`verdict=${ratio >= SEUIL ? "ok" : "echec"}`);

	if (ratio < SEUIL || detail.lignes < TOP_N) process.exitCode = 1;
} finally {
	await closePools();
}
