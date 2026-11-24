/**
 * Reproducible audit of the seven-day windows attainable from the committed
 * observations. Offline and deterministic: it never probes or invents a day.
 *
 *   apps/api/node_modules/.bin/tsx scripts/audit-service-availability-windows.mts --from=2026-11-24 --as-of=2026-11-24
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { attainableBy, auditWindows, candidateAnchors, earliestAttainableAnchor, maxObservedInRange } from "../apps/api/src/serviceAvailability/audit.js";
import { dayKeys, parseObservations } from "../apps/api/src/serviceAvailability/observations.js";
import { readCorpusPerimeter } from "../apps/api/src/serviceAvailability/perimeter.js";

const from = process.argv.find((arg) => arg.startsWith("--from="))?.slice(7)
	?? new Date().toISOString().slice(0, 10);
const asOf = process.argv.find((arg) => arg.startsWith("--as-of="))?.slice(8) ?? from;
const scanFrom = process.argv.find((arg) => arg.startsWith("--scan-from="))?.slice(12);
const scanTo = process.argv.find((arg) => arg.startsWith("--scan-to="))?.slice(10);

const observationsPath = resolve("bench/results/service-availability-observations.jsonl");
const services = readCorpusPerimeter(resolve("bench/corpus/institutions-complet.jsonl"));
const observations = existsSync(observationsPath)
	? parseObservations(readFileSync(observationsPath, "utf8"))
	: [];
const audits = auditWindows(observations, services);
const feasible = audits.filter((window) => window.status === "atteint");
const maxObserved = audits.reduce((max, window) => Math.max(max, window.observedServiceDays), 0);
const target = audits[0]?.targetServiceDays ?? services.length * 7;
const earliest = earliestAttainableAnchor(observations, services, from);
const realCollectionsRequired = earliest === null
	? 0
	: dayKeys(earliest).filter((day) => day > asOf).length;

console.log(
	`windows=${audits.length} max_observed_service_days=${maxObserved}/${target} ` +
	`feasible_windows=${feasible.length} from=${from} as_of=${asOf} ` +
	`attainable_as_of=${attainableBy(observations, services, from, asOf)} ` +
	`real_collections_required=${realCollectionsRequired} ` +
	`earliest_attainable_anchor=${earliest ?? "none"}`
);
if (feasible.length > 0) console.log(`feasible=${feasible.map((window) => window.anchor).join(",")}`);

if (scanFrom !== undefined && scanTo !== undefined) {
	const scan = maxObservedInRange(observations, services, scanFrom, scanTo);
	console.log(
		`scan=${scanFrom}..${scanTo} scanned_anchors=${scan.scannedAnchors} ` +
		`max_observed_service_days=${scan.maxObservedServiceDays}/${scan.targetServiceDays} ` +
		`full_windows=${scan.fullWindows}`
	);
}
