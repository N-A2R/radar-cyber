/**
 * Reproducible measurement of the offline PWA behaviours.
 *
 *   pnpm measure:offline-pwa
 *
 * No network and no PostgreSQL are needed: the real-database baseline is a
 * versioned snapshot, and the behaviours are executed from the shared checker.
 * Result: bench/results/offline-pwa-2026-11-22.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { runOfflineChecks } from "../apps/web/test/offline-pwa-checks.js";

const baselinePath = "bench/fixtures/offline-baseline-na.json";
const outputPath = "bench/results/offline-pwa-2026-11-22.json";
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Record<string, unknown>;
const { results, passed, total } = runOfflineChecks();

const report = {
	generatedAt: new Date().toISOString(),
	baseline: { path: baselinePath, ...baseline },
	command: "pnpm measure:offline-pwa",
	behaviours: { passed, total },
	checks: results.map(({ name, ok }) => ({ name, ok })),
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
	`Real state (${String(baseline.scope)}, ${String(baseline.capturedAt)}): ` +
	`${String(baseline.organisations)} organisations, ${String(baseline.sources)} sources, ` +
	`${String(baseline.events)} events`,
);
console.log(`OFFLINE_PWA_BEHAVIOURS ${passed}/${total}`);
console.log(`Result written to ${outputPath}`);
if (passed !== total) process.exitCode = 1;
