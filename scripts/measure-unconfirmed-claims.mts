/**
 * Reproducible measurement of unconfirmed claims in Nouvelle-Aquitaine.
 *
 *   pnpm measure:unconfirmed-claims
 *   pnpm measure:unconfirmed-claims --json=bench/results/unconfirmed-claims.json
 *
 * Reads the versioned 60-incident reference corpus, applies the same detector
 * as GET /api/unconfirmed-claims/incidents, and prints the measured count. No
 * database, no network, no paid service, no victim personal data in the output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectUnconfirmedClaims, type CorpusIncident } from "../apps/api/src/analyse/unconfirmed-claims.js";

const argv = process.argv.slice(2);
const jsonOption = argv.find((arg) => arg.startsWith("--json="));
const corpusPath = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));
const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as { incidents: CorpusIncident[] };
const summary = detectUnconfirmedClaims(corpus.incidents);

const result = {
  measuredAt: new Date().toISOString(),
  corpus: "bench/fixtures/corpus-reference-na.json",
  command: "pnpm measure:unconfirmed-claims",
  ...summary,
};

console.log(`unconfirmed claims: ${summary.count} / ${corpus.incidents.length}`);
console.log(`with grey source: ${summary.withGreySource}`);
console.log(`departments: ${summary.byDepartment.map((d) => `${d.department}=${d.count}`).join(", ")}`);

if (jsonOption) {
  const destination = jsonOption.slice("--json=".length);
  writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`written: ${destination}`);
}
