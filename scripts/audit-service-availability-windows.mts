/**
 * Reproducible audit of the seven-day windows attainable from the committed
 * observations. Offline and deterministic: it never probes or invents a day.
 *
 *   apps/api/node_modules/.bin/tsx scripts/audit-service-availability-windows.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditWindows, candidateAnchors } from "../apps/api/src/serviceAvailability/audit.js";
import { parseObservations } from "../apps/api/src/serviceAvailability/observations.js";
import { readCorpusPerimeter } from "../apps/api/src/serviceAvailability/perimeter.js";

const observationsPath = resolve("bench/results/service-availability-observations.jsonl");
const services = readCorpusPerimeter(resolve("bench/corpus/institutions-complet.jsonl"));
const observations = existsSync(observationsPath)
	? parseObservations(readFileSync(observationsPath, "utf8"))
	: [];
const audits = auditWindows(observations, services);
const feasible = audits.filter((window) => window.status === "atteint");
const maxObserved = audits.reduce((max, window) => Math.max(max, window.observedServiceDays), 0);
const target = audits[0]?.targetServiceDays ?? services.length * 7;

console.log(
	`windows=${audits.length} max_observed_service_days=${maxObserved}/${target} ` +
	`feasible_windows=${feasible.length}`
);
if (feasible.length > 0) console.log(`feasible=${feasible.map((window) => window.anchor).join(",")}`);
