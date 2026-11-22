/**
 * Reproducible measurement of the crisis-scenario generator.
 *
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/measure-crisis-scenarios.mts
 *   ... --json=bench/results/crisis-scenarios-2026-11-22.json
 *
 * Read-only: no network call, no paid service, no write to the database.
 * The published JSON contains codes, hashes and fixed English playbook text;
 * no victim name, title, summary or source URL is ever copied into it.
 */
import { writeFileSync } from "node:fs";
import { closePools } from "../apps/api/src/db.js";
import { loadBaseline, loadKnownSourceIds, loadRawSignals } from "../apps/api/src/scenarios/load.js";
import { containsPersonalData, generateScenarios, NA_DEPARTMENTS } from "../apps/api/src/scenarios/model.js";
import { assessObjective, type ObjectiveInputs } from "../apps/api/src/scenarios/objective.js";

const DEFAULT_OUTPUT = "bench/results/crisis-scenarios-2026-11-22.json";

async function main(): Promise<void> {
	const output = process.argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? DEFAULT_OUTPUT;
	const baseline = await loadBaseline();
	const raw = await loadRawSignals();
	const knownSources = await loadKnownSourceIds();
	const { scenarios, screening } = generateScenarios(raw);

	const rawText = raw.flatMap((signal) => [signal.title, signal.summary])
		.filter((text): text is string => typeof text === "string" && text.length > 20);

	// Independent audit of the published scenarios, not a restatement of the model flag.
	const outsideNaCount = scenarios.filter((scenario) =>
		!(NA_DEPARTMENTS as readonly string[]).includes(scenario.department)).length;
	const personalDataCount = scenarios.filter((scenario) => {
		const json = JSON.stringify(scenario);
		return containsPersonalData(json) || rawText.some((text) => json.includes(text));
	}).length;
	const paidServiceCount = scenarios.filter((scenario) => {
		const json = JSON.stringify(scenario);
		return scenario.sources.some((source) => !knownSources.has(source.id))
			|| /https?:\/\/|"api[_-]?key"|"subscription"|"paid"|"token"/i.test(json);
	}).length;
	const unsourcedCount = scenarios.filter((scenario) => scenario.sources.length === 0).length;

	const objectiveInputs: ObjectiveInputs = {
		baseline,
		scenarioCount: scenarios.length,
		outsideNaCount,
		personalDataCount,
		paidServiceCount,
		unsourcedCount,
	};
	const objective = assessObjective(objectiveInputs);

	console.log("Crisis scenario generator - measurement on live data");
	console.log(`Baseline: organizations=${baseline.organizations} sources=${baseline.sources} events=${baseline.events}`);
	console.log(`Signals: raw=${screening.raw} outsideRegion=${screening.outsideRegion} `
		+ `personalData=${screening.personalData} unknownTheme=${screening.unknownTheme} usable=${screening.usable}`);
	console.log(`Scenarios produced: ${scenarios.length}`);
	for (const scenario of scenarios) {
		console.log(`  ${scenario.id} | signals=${scenario.signalCount} sources=${scenario.sourceCount} `
			+ `first=${scenario.firstObserved} last=${scenario.lastObserved}`);
	}
	console.log(`Audit: outsideNA=${outsideNaCount} personalData=${personalDataCount} `
		+ `paidServices=${paidServiceCount} unsourced=${unsourcedCount}`);
	console.log(`Objective: ${objective.met ? "MET" : "NOT MET"} (${objective.checks.filter((c) => c.passed).length}/${objective.checks.length} checks)`);
	for (const check of objective.checks) {
		console.log(`  ${check.passed ? "PASS" : "FAIL"} ${check.label}: ${check.observed} (expected ${check.expected})`);
	}

	writeFileSync(output, `${JSON.stringify({
		baseline,
		screening,
		objectiveInputs,
		objective,
		scenarios,
	}, null, 2)}\n`, "utf8");
	console.log(`Published: ${output}`);
	await closePools();
	if (!objective.met) process.exitCode = 1;
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
