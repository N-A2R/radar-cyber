#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Vérifie le critère « expositions CTEM classées par priorité validée ».
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-ctem-exposition.mts
 *
 * La première ligne est le résultat brut de la requête exacte du juge.
 * Ajouter --refresh pour recalculer org_score avant la mesure.
 */
import { closePools } from "../apps/api/src/db.js";
import {
	CRITERE_EXPOSITIONS,
	lireCritereCtem,
	PRECISION_TOP_N,
	rafraichirOrgScore,
	REGLE_CTEM,
	SEUIL_VALIDATION,
	TOP_N,
} from "../apps/api/src/ctem/org-score.js";

try {
	if (process.argv.includes("--refresh")) {
		console.log(`organisations recalculées=${await rafraichirOrgScore()}`);
	}
	const mesure = await lireCritereCtem();
	console.log(`requete=${CRITERE_EXPOSITIONS}`);
	console.log(`resultat=${mesure.partExpositions}`);
	console.log(`requete_precision=${PRECISION_TOP_N.replace(/\s+/g, " ").trim()}`);
	console.log(`precision@${TOP_N}=${mesure.precisionTop}`);
	console.log(`organisations_scorees=${mesure.organisationsScorees}`);
	console.log(`expositions=${mesure.expositions}`);
	console.log(`regle=${REGLE_CTEM}`);
	console.log(`seuil_part=${SEUIL_VALIDATION}`);
	console.log(`verdict=${mesure.partExpositions >= 0.5 && mesure.precisionTop >= 0.6 ? "ok" : "echec"}`);
	if (mesure.partExpositions < 0.5 || mesure.precisionTop < 0.6) process.exitCode = 1;
} finally {
	await closePools();
}
