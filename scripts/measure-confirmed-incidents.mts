/**
 * Reproducible measurement of confirmed incidents in Nouvelle-Aquitaine.
 *
 *   pnpm measure:confirmed-incidents
 *   pnpm measure:confirmed-incidents --json=bench/results/confirmed-incidents.json
 *
 * Reads the versioned 60-incident reference corpus, applies the same detector
 * as GET /api/confirmed-incidents/incidents, and prints the measured count. No
 * database, no network, no paid service, no victim personal data in the output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectConfirmedIncidents, type CorpusIncident } from "../apps/api/src/analyse/confirmed-incidents.js";

const argv = process.argv.slice(2);
const jsonOption = argv.find((arg) => arg.startsWith("--json="));
const corpusPath = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));
const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as { incidents: CorpusIncident[] };
const summary = detectConfirmedIncidents(corpus.incidents);

const result = {
  measuredAt: new Date().toISOString(),
  corpus: "bench/fixtures/corpus-reference-na.json",
  command: "pnpm measure:confirmed-incidents",
  ...summary,
};

console.log(`confirmed incidents: ${summary.count} / ${corpus.incidents.length}`);
console.log(`with grey source: ${summary.withGreySource}`);
console.log(`departments: ${summary.byDepartment.map((d) => `${d.department}=${d.count}`).join(", ")}`);

if (jsonOption) {
  const destination = jsonOption.slice("--json=".length);
  writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`written: ${destination}`);
}
