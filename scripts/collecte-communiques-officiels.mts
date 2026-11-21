/**
 * Collect official Nouvelle-Aquitaine statements from free institutional pages.
 *
 *   pnpm collecte:communiques                 # collect + store + measure
 *   pnpm collecte:communiques -- --dry-run    # parse only, no database write
 *
 * Every source is public, first-party and free. No victim personal data is
 * stored: the parsers reject titles naming or describing victims.
 */
import { collectStatements } from "../apps/api/src/communiques/collect.js";
import { closePools } from "../apps/api/src/db.js";
import { ensureSources, measureWeeks, storeStatements } from "../apps/api/src/communiques/store.js";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const days = Number(argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 7);
if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("--days must be between 1 and 30");

// One command must stay below 60 s even if several hosts hang.
const deadline = Date.now() + 45_000;
async function fetchText(url: string): Promise<string> {
  if (Date.now() >= deadline) throw new Error("collection deadline reached");
  const response = await fetch(url, {
    headers: { "User-Agent": "RadarNA/1.0 (public institutional sources)", Accept: "text/html,application/rss+xml,application/xml,text/xml" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

const report = await collectStatements(fetchText, new Date(), days);
let stored = { inserted: 0, duplicates: 0 };
if (!dryRun) {
  await ensureSources();
  stored = await storeStatements(report.statements);
}

const measurement = await measureWeeks(4);
console.log(JSON.stringify({
  collectedAt: new Date().toISOString(),
  windowDays: days,
  dryRun,
  sourcesScanned: report.scanned,
  admitted: report.admitted,
  bySource: report.bySource,
  rejected: report.rejected,
  stored,
  weekly: {
    currentWeek: measurement.currentWeek,
    currentWeekCount: measurement.currentWeekCount,
    total: measurement.total,
    weeks: measurement.weeks,
  },
}, null, 2));

await closePools();
