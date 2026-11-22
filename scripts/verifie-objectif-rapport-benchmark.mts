/**
 * Vérification en lecture seule de l'objectif déclaré du rapport court.
 *
 *   pnpm verifie:objectif-rapport
 *
 * Relit la mesure publiée et docs/benchmark.md, imprime l'unique ligne
 * OBJECTIF et sort en erreur si le chiffre ou la déclaration a changé.
 * Pas de base, pas de réseau, aucune écriture.
 */
import { readFileSync } from "node:fs";
import {
	mesurerObjectifRapport,
	verifierDeclarationObjectifRapport,
	type IncidentDate,
} from "../apps/api/src/analyse/rapport-benchmark.js";

const mesure = JSON.parse(
	readFileSync(new URL("../bench/results/benchmark-premier-regard.json", import.meta.url), "utf8"),
) as { incidents: IncidentDate[] };
const rapport = readFileSync(new URL("../docs/benchmark.md", import.meta.url), "utf8");

const objectif = mesurerObjectifRapport(mesure.incidents);
const declare = verifierDeclarationObjectifRapport(rapport, objectif.ligne);

console.log(objectif.ligne);
console.log(`report declaration : ${declare ? "ok" : "missing or stale"}`);
if (!objectif.atteint || !declare) process.exitCode = 1;
