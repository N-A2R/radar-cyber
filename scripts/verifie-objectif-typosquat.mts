#!/usr/bin/env -S npx tsx
/**
 * Vérification reproductible de l'objectif du balayage typo exhaustif NA.
 *
 *   apps/api/node_modules/.bin/tsx scripts/verifie-objectif-typosquat.mts
 *
 * Rejoue la définition de l'alerte brute sur les 25 lots archivés : DNS actif
 * au relevé, base officielle du référentiel NA, similarité >= 0,8. Aucune
 * écriture, aucun réseau, aucune donnée personnelle.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  confirmerCandidats,
  type ArchivedBatch,
  type NaTarget,
} from "../apps/api/src/detect/typosquat-proof.js";

const DIR = "bench/results/typosquat-exhaustive";
const AGGREGATE = "bench/results/typosquat-exhaustive.json";
const TARGETS = "bench/results/typosquat-targets-na.json";

const files = (await readdir(DIR)).filter((f) => f.endsWith(".json")).sort();
const batches: ArchivedBatch[] = await Promise.all(
  files.map(async (f) => JSON.parse(await readFile(join(DIR, f), "utf8")) as ArchivedBatch),
);
const aggregate = JSON.parse(await readFile(AGGREGATE, "utf8")) as {
  alarms: number; active: number; batches: number;
};
const referential = JSON.parse(await readFile(TARGETS, "utf8")) as { targets: NaTarget[] };

const measure = confirmerCandidats(batches, referential.targets);
const consistent =
  files.length === aggregate.batches &&
  measure.candidates === aggregate.alarms &&
  batches.reduce((sum, batch) => sum + batch.activeList.length, 0) === aggregate.active;

console.log(
  `lots=${files.length} candidats=${measure.candidates} confirmes=${measure.confirmed} ` +
    `usurpations=${measure.usurpations} coherence=${consistent}`,
);
if (measure.rejected.length > 0) {
  console.log(`rejets: ${measure.rejected.slice(0, 5).map((r) => `${r.domain}:${r.reason}`).join(", ")}`);
}
const atteint = consistent && measure.confirmed === aggregate.alarms;
console.log(
  `OBJECTIF : ${atteint ? "atteint" : "partiel"} — ${measure.confirmed} / ${aggregate.alarms} ` +
    `domaines candidats confirmés avec preuve (${measure.usurpations} usurpation confirmée)`,
);
if (!atteint) process.exitCode = 1;
