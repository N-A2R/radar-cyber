/**
 * Verifies the measurable objective of the crisis-scenario chantier from the
 * published measurement, without touching the database or the network.
 *
 *   apps/api/node_modules/.bin/tsx scripts/verify-crisis-scenarios-objective.mts
 */
import { readFileSync } from "node:fs";
import { assessObjective, type ObjectiveInputs } from "../apps/api/src/scenarios/objective.js";

const file = process.argv.find((a) => a.startsWith("--json="))?.split("=")[1]
	?? "bench/results/crisis-scenarios-2026-11-22.json";
const report = JSON.parse(readFileSync(file, "utf8")) as { objectiveInputs: ObjectiveInputs };
const verdict = assessObjective(report.objectiveInputs);

console.log(`Objective: ${verdict.met ? "MET" : "NOT MET"}`);
for (const check of verdict.checks) {
	console.log(`  ${check.passed ? "PASS" : "FAIL"} ${check.label}: ${check.observed} (expected ${check.expected})`);
}
if (!verdict.met) process.exitCode = 1;
