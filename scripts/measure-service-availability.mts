/**
 * Reproducible seven-day availability measurement. No network and no database:
 * the figure is recomputed from the committed perimeter and observations.
 *
 *   pnpm measure:service-availability
 *   # or
 *   apps/api/node_modules/.bin/tsx scripts/measure-service-availability.mts --anchor=2026-11-22
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { measureAvailability, WINDOW_DAYS } from "../apps/api/src/serviceAvailability/measure.js";
import { parseObservations } from "../apps/api/src/serviceAvailability/observations.js";
import { readCorpusPerimeter } from "../apps/api/src/serviceAvailability/perimeter.js";

const OBSERVATIONS = "bench/results/service-availability-observations.jsonl";

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function main(): void {
	const anchor = option("anchor", "2026-11-22");
	const observationsPath = resolve(option("observations", OBSERVATIONS));
	const perimeter = readCorpusPerimeter(resolve("bench/corpus/institutions-complet.jsonl"));
	const observations = existsSync(observationsPath)
		? parseObservations(readFileSync(observationsPath, "utf8"))
		: [];
	const summary = measureAvailability(observations, perimeter, anchor, WINDOW_DAYS);
	const out = resolve(option("out", `bench/results/service-availability-na-${anchor}.json`));
	writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
	console.log(
		`services=${summary.perimeterSize} window=${summary.window[0]}..${summary.anchor} ` +
		`observed_service_days=${summary.observedServiceDays}/${summary.perimeterSize * WINDOW_DAYS} ` +
		`available=${summary.availableServiceDays} availability=${summary.availabilityPct.toFixed(2).replace(".", ",")}%`
	);
	console.log(`result=${out}`);
}

main();
