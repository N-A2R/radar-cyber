#!/usr/bin/env node
/**
 * Reproducible measurement of the frozen gold corpus (offline, no database).
 *
 * Usage: pnpm gold:measure
 * Exits non-zero when the corpus is not exactly 500 valid NA incidents.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	parseGoldJsonl,
	summariseGoldCorpus,
	validateGoldCorpus,
} from "../apps/api/src/gold/corpus.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const path = join(root, "bench", "gold", "incidents-na-500.jsonl");
const records = parseGoldJsonl(readFileSync(path, "utf8"));
const validation = validateGoldCorpus(records);
const summary = summariseGoldCorpus(records);

console.log(`Gold corpus: ${summary.incidents}/500 incidents annotated`);
console.log(`NA departments covered: ${summary.departments}/12`);
console.log(`Evidence tiers: verified=${summary.verified} reported=${summary.reported} claimed=${summary.claimed}`);
console.log(`Source kinds: official=${summary.official} press=${summary.press} grey=${summary.grey}`);
console.log(`Personal-data findings: ${validation.errors.filter((error) => error.includes("personal data")).length}`);
console.log(`Validation errors: ${validation.errors.length}`);
console.log(`SHA-256: ${summary.sha256}`);

if (validation.errors.length > 0 || summary.incidents !== 500) {
	for (const error of validation.errors.slice(0, 10)) console.error(error);
	process.exitCode = 1;
}
