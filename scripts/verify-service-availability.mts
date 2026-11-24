/**
 * Reproducible status of the seven-day availability objective. Offline only:
 * the figure comes from the committed replay result, never from new probing.
 *
 *   pnpm services:verify -- --anchor=2026-11-23
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AvailabilitySummary } from "../apps/api/src/serviceAvailability/measure.js";
import { evaluateCoverage, probeGaps } from "../apps/api/src/serviceAvailability/objective.js";

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const anchor = option("anchor", "2026-11-23");
const resultPath = resolve(option("result", `bench/results/service-availability-na-${anchor}.json`));
const summary = JSON.parse(readFileSync(resultPath, "utf8")) as AvailabilitySummary;
const status = evaluateCoverage(summary);
const missing = status.missingDays.length === 0
	? "none"
	: `${status.missingDays.length} (${status.missingDays.join(",")})`;
console.log(
	`OBJECTIF : ${status.label} — ${status.daysObserved} / ${status.targetDays} jours ` +
	`(${status.observedServiceDays} / ${status.targetServiceDays} service-jours), ` +
	`manque ${missing}, ${status.missingServiceDays} service-jours`
);
const gaps = probeGaps(summary);
const missingProbes = gaps.reduce((total, gap) => total + gap.missing, 0);
console.log(
	`SONDES : manquantes=${missingProbes} ` +
	`details=${gaps.length === 0 ? "none" : gaps.map((gap) => `${gap.day}:${gap.missing}`).join(",")}`
);
