/**
 * Vérification en lecture seule de l'objectif déclaré de la calibration.
 *
 *   pnpm verifie:objectif-calibration
 *
 * Relit l'artefact publié (bench/results/rule-calibration-30d.json) et
 * docs/calibration-regles.md, imprime l'unique ligne OBJECTIF et sort en
 * erreur si le chiffre ou la déclaration a changé. Pas de base, pas de
 * réseau, aucune donnée personnelle, aucune écriture.
 */
import { readFileSync } from "node:fs";
import {
	mesurerObjectifCalibration,
	verifierDeclarationObjectifCalibration,
} from "../apps/api/src/detect/calibration.js";

const artefact = JSON.parse(
	readFileSync(new URL("../bench/results/rule-calibration-30d.json", import.meta.url), "utf8"),
) as {
	holdout: { alerts: number };
	rules: Parameters<typeof mesurerObjectifCalibration>[0];
};
const rapport = readFileSync(new URL("../docs/calibration-regles.md", import.meta.url), "utf8");

const objectif = mesurerObjectifCalibration(artefact.rules, artefact.holdout.alerts);
const declare = verifierDeclarationObjectifCalibration(rapport, objectif.ligne);

console.log(objectif.ligne);
console.log(`report declaration : ${declare ? "ok" : "missing or stale"}`);
if (!objectif.atteint || !declare) process.exitCode = 1;
