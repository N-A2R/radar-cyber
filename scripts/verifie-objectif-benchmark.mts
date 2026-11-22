/**
 * Vérification en lecture seule de l'objectif déclaré du benchmark.
 *
 *   pnpm verifie:objectif-benchmark
 *
 * Lit la mesure publiée et le rapport nominatif, imprime l'unique ligne
 * OBJECTIF et sort en erreur si le chiffre ou la déclaration a changé.
 * Pas de base, pas de réseau, aucune écriture.
 */
import { readFileSync } from "node:fs";
import {
	verifierDeclarationObjectif,
	verifierObjectifBenchmark,
	type MesureObjectifBenchmark,
} from "../apps/api/src/analyse/objectif-benchmark.js";

const mesure = JSON.parse(
	readFileSync(new URL("../bench/results/benchmark-premier-regard.json", import.meta.url), "utf8"),
) as MesureObjectifBenchmark;
const rapport = readFileSync(new URL("../docs/benchmark-incidents.md", import.meta.url), "utf8");

const objectif = verifierObjectifBenchmark(mesure);
const declare = verifierDeclarationObjectif(rapport, objectif.line);

console.log(objectif.line);
console.log(`report declaration : ${declare ? "ok" : "missing or stale"}`);
if (!objectif.reached || !declare) process.exitCode = 1;
