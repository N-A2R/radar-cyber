/**
 * Mesure reproductible de la couverture du rapport de progression du corpus.
 *
 *   pnpm mesure:corpus-progression
 *   pnpm mesure:corpus-progression --check   # échoue si la cible n'est plus atteinte
 *
 * Lecture seule : le rapport et l'historique publiés ne sont pas réécrits.
 * Aucune donnée personnelle, aucun réseau, aucun service payant.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEPT_LABELS } from "../apps/api/src/collectors/relevance.js";
import { OBJECTIF_CORPUS_PROGRESSION } from "../apps/api/src/analyse/rapport-corpus.js";
import { mesurerRapportProgression } from "../apps/api/src/analyse/mesure-corpus-progression.js";

const argumentsConnus = new Set(["--check"]);
const argumentsInconnus = process.argv.slice(2).filter((argument) => !argumentsConnus.has(argument));
if (argumentsInconnus.length > 0) {
	process.stderr.write(`mesure-corpus-progression: argument inconnu : ${argumentsInconnus[0]}\n`);
	process.exit(2);
}

const codesNA = Object.keys(DEPT_LABELS);
const rapport = fileURLToPath(new URL("../docs/corpus-progression.md", import.meta.url));
const mesure = mesurerRapportProgression(readFileSync(rapport, "utf8"), codesNA);
const manquants = codesNA.filter((code) => !mesure.departementsNA.includes(code));

process.stdout.write(
	`couverture du rapport corpus : ${mesure.departementsNA.length}/${OBJECTIF_CORPUS_PROGRESSION.departements} départements NA, ` +
		`${mesure.cellules}/${OBJECTIF_CORPUS_PROGRESSION.cellules} cellules ` +
		`(${mesure.indicateurs.length}/${OBJECTIF_CORPUS_PROGRESSION.indicateurs} indicateurs)\n`,
);
if (mesure.date !== null) process.stdout.write(`date du rapport : ${mesure.date}\n`);
if (manquants.length > 0) process.stdout.write(`départements manquants : ${manquants.join(", ")}\n`);

if (process.argv.includes("--check") && !mesure.objectifAtteint) {
	process.stderr.write("mesure-corpus-progression: objectif non atteint\n");
	process.exit(1);
}
