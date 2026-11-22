/**
 * Read-only verification of the declared objective against the published artifacts.
 *
 *   pnpm verifie:objectif-communiques
 *
 * Prints the OBJECTIF line and exits non-zero when the measurement or the
 * report no longer declares 13 official statements for ISO week 2026-W47.
 * No database, no network, no writes.
 */
import { readFileSync } from "node:fs";
import { checkObjective, checkReportDeclaration } from "../apps/api/src/communiques/objectif.js";
import type { WeeklyMeasurement } from "../apps/api/src/communiques/store.js";

const benchUrl = new URL("../bench/results/communiques-officiels-2026-11-21.json", import.meta.url);
const reportUrl = new URL("../docs/rapports/communiques-officiels-2026-11-21.md", import.meta.url);

const measurement = JSON.parse(readFileSync(benchUrl, "utf8")) as WeeklyMeasurement;
const check = checkObjective(measurement);
const declared = checkReportDeclaration(readFileSync(reportUrl, "utf8"), check.line);

console.log(check.line);
console.log(`report declaration : ${declared ? "ok" : "missing or stale"}`);
if (!check.reached || !declared) process.exitCode = 1;
