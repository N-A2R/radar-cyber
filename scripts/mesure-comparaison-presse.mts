/**
 * Mesure reproductible de docs/comparaison-presse.md.
 *
 * Lit le corpus vérifié versionné, sélectionne les dix premiers incidents dont
 * la preuve principale est un article de presse, puis compare la date de
 * publication à la première trace radar (`preuve.consulteLe`). Aucune base,
 * aucun réseau, aucune donnée personnelle de victime : seuls les identifiants,
 * les dates, les éditeurs et les écarts sont calculés.
 *
 *   pnpm mesure:comparaison-presse             # écrit bench/results/comparaison-presse.json
 *   pnpm mesure:comparaison-presse -- --check  # vérifie la cible sans écrire
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	comparerPresseRadar,
	OBJECTIF_COMPARAISON_PRESE,
	type CorpusPresse,
} from "../apps/api/src/analyse/comparaison-presse.js";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const CORPUS = "bench/fixtures/corpus-reference-na.json";
const SORTIE = "bench/results/comparaison-presse.json";

const corpus = JSON.parse(readFileSync(resolve(RACINE, CORPUS), "utf8")) as CorpusPresse;
const bilan = comparerPresseRadar(corpus);
const { ecartJours } = bilan;

console.log(
	`comparaison presse/radar : ${bilan.pressePremier} / ${bilan.total}, `
	+ `radar ${bilan.radarPremier} / ${bilan.total}, `
	+ `écart médian ${ecartJours.mediane} j (min ${ecartJours.min} j, max ${ecartJours.max} j)`,
);

if (process.argv.includes("--check")) {
	if (!bilan.objectifAtteint) {
		console.error(`objectif non atteint : attendu ${JSON.stringify(OBJECTIF_COMPARAISON_PRESE)}`);
		process.exitCode = 1;
	}
} else {
	const resultat = {
		dateMesure: new Date().toISOString().slice(0, 10),
		source: CORPUS,
		methode: "10 premiers incidents à preuve presse du corpus ; écart = consulteLe − datePublique (jours calendaires)",
		objectif: OBJECTIF_COMPARAISON_PRESE,
		mesure: {
			total: bilan.total,
			pressePremier: bilan.pressePremier,
			radarPremier: bilan.radarPremier,
			ecartJours,
			objectifAtteint: bilan.objectifAtteint,
		},
		selection: bilan.selection,
		lignes: bilan.lignes,
	};
	writeFileSync(resolve(RACINE, SORTIE), `${JSON.stringify(resultat, null, 2)}\n`);
	console.log(`résultat écrit : ${SORTIE}`);
}
