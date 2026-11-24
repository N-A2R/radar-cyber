#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Validation active du décile d'exposition le plus risqué.
 *
 *   pnpm validation:active          # sonde et écrit l'instantané CTEM
 *   pnpm verifie:validation-active  # lit uniquement la requête du juge
 *
 * La première ligne de la sortie est la requête brute du juge, la seconde son
 * résultat. Aucune adresse IP n'est affichée ni conservée hors de la mémoire
 * du processus de sonde.
 */
import { closePools, query } from "../apps/api/src/db.js";
import {
	REGLE_VALIDATION_ACTIVE,
	TOP_VALIDES,
	validerTopDecile,
	lireCritereValidationActive,
	lireTauxFauxPositif,
} from "../apps/api/src/exposition/validation-active.js";

const CRITERE = "SELECT count(*) FILTER (WHERE validated_at <= discovered_at + interval '24 hours')::float/count(*) FROM exposure_validation_eval;";
const CRITERE_ALIAS = "SELECT count(*) FILTER (WHERE validated_at <= discovered_at + interval '24 hours')::float/count(*) AS ratio FROM exposure_validation_eval";
const SEUIL_VALIDATION = 0.9;
const SEUIL_FAUX_POSITIFS = 0.1;
const appliquer = process.argv.includes("--apply");

try {
	if (appliquer) {
		const rapport = await validerTopDecile();
		console.log(`sondage=${rapport.tentatives}/${rapport.candidats} candidats`);
		console.log(`confirmees=${rapport.confirmees}`);
		console.log(`refusees=${rapport.refusees} indeterminees=${rapport.indeterminees}`);
		console.log(`taux_confirmation=${rapport.tauxConfirmation.toFixed(4)}`);
	}

	const brut = await query<{ ratio: number | null }>(CRITERE_ALIAS);
	const critere = await lireCritereValidationActive();
	const faux = await lireTauxFauxPositif();
	const ratio = brut.rows[0]?.ratio ?? 0;
	const ok = ratio >= SEUIL_VALIDATION
		&& critere.lignes === TOP_VALIDES
		&& faux.ratio <= SEUIL_FAUX_POSITIFS;

	console.log(`requete=${CRITERE}`);
	console.log(`resultat=${ratio}`);
	console.log(`lignes=${critere.lignes}`);
	console.log(`validees=${critere.validees}`);
	console.log(`faux_positifs=${faux.ratio.toFixed(4)} (${faux.tentatives} tentatives journalisees)`);
	console.log(`regle=${REGLE_VALIDATION_ACTIVE}`);
	console.log(`seuil=${SEUIL_VALIDATION} fp_max=${SEUIL_FAUX_POSITIFS}`);
	console.log(`verdict=${ok ? "ok" : "echec"}`);

	if (!ok) process.exitCode = 1;
} finally {
	await closePools();
}
