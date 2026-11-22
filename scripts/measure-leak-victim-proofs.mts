#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of Nouvelle-Aquitaine leak-site victims whose
 * claim has an archived WARC capture. Every capture is re-read and checked:
 * digest, length, source URL, claim fingerprint, hash and redaction.
 *
 *   pnpm leak-proofs:measure
 *   pnpm leak-proofs:measure --json=bench/results/leak-victim-proofs-measure.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { measureVictimProofs } from "../apps/api/src/leak-victim-proofs.js";

const argv = process.argv.slice(2);
const option = (name: string): string | undefined =>
  argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const manifestPath = option("manifest") ?? "bench/results/leak-victim-proofs.json";
const output = option("json");

const measurement = measureVictimProofs(manifestPath);
console.log(
  `NA leak victims with archived claim capture: ${measurement.count} ` +
    `(victims=${measurement.total}, valid claim records=${measurement.validClaims}, ` +
    `invalid=${measurement.invalid.length})`,
);
for (const problem of measurement.invalid) console.log(`  invalid ${problem.victimKey}: ${problem.reason}`);
if (output) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ ...measurement, manifest: manifestPath }, null, 2)}\n`);
}
