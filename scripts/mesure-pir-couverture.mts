#!/usr/bin/env -S npx tsx
/**
 * Mesure de la couverture des priorités de renseignement.
 *
 *   pnpm mesure:pir
 *   pnpm verifie:pir     # échoue si moins de 8 questions rendues sans signal
 *
 * Affiche la requête du contrôle externe, sa sortie brute, puis les questions
 * restées sans réponse. Aucune écriture, aucun réseau.
 */
import { closePools, query } from "../apps/api/src/db.js";
import {
	CRITERE_PIR,
	compterPirSansReponse,
	lireCouverturePir,
} from "../apps/api/src/analyse/pir-couverture.js";

const VERIFIER = process.argv.includes("--check");

try {
	const brut = await query<{ count: string }>(CRITERE_PIR);
	console.log(CRITERE_PIR);
	console.log(`count = ${brut.rows[0]?.count}`);

	const lignes = await lireCouverturePir();
	const sansReponse = lignes.filter((l) => l.signaux_30d === 0 && l.rendu_le !== null);
	console.log(`(${lignes.length} priorités, ${sansReponse.length} rendues sans signal)`);
	for (const ligne of sansReponse) {
		console.log(`- ${ligne.code} [${ligne.owner}] ${ligne.question}`);
	}

	const compteur = await compterPirSansReponse();
	if (VERIFIER && compteur < 8) {
		console.error(`ÉCHEC : ${compteur} questions sans réponse, seuil 8.`);
		process.exitCode = 1;
	}
} finally {
	await closePools();
}
