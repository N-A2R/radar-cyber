#!/usr/bin/env -S npx tsx
/**
 * Passive DNS sensor: observation and measurement of NA domain resolutions.
 *
 * Usage:
 *   tsx scripts/measure-dns-passive.mts                         # read the daily counts
 *   tsx scripts/measure-dns-passive.mts --apply --limit=200 --offset=0 --concurrency=15
 *
 * `--apply` queries a free DNS-over-HTTPS resolver for a bounded batch of the
 * NA perimeter, stores the answers observed on the current UTC day, and prints
 * the measured count. Batches stay under 60 s; repeat with another --offset
 * to cover the whole perimeter. No target service is crawled or scanned.
 */
import { writeFile } from "node:fs/promises";
import { closePools } from "../apps/api/src/db.js";
import { collectResolutions, createDohResolver } from "../apps/api/src/dns/passive/observe.js";
import { loadPassiveDomains } from "../apps/api/src/dns/passive/perimeter.js";
import { dailyCounts, passiveScope, saveDomains, saveResolutions } from "../apps/api/src/dns/passive/store.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const value = (name: string): number | undefined => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  if (!found) return undefined;
  const number = Number(found.slice(name.length + 3));
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

async function main(): Promise<void> {
  if (!apply) {
    const payload = { days: await dailyCounts(14), scope: await passiveScope() };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const perimeter = await loadPassiveDomains();
  const offset = value("offset") ?? 0;
  const limit = value("limit") ?? 150;
  const result = await collectResolutions(
    perimeter.map((entry) => entry.domain),
    createDohResolver(),
    { offset, limit, concurrency: value("concurrency") ?? 12 },
  );
  const batch = perimeter.slice(offset, offset + limit);
  await saveDomains(batch);
  const saved = await saveResolutions(result.resolutions);
  const payload = {
    observedOn: result.observedOn,
    perimeterDomains: perimeter.length,
    domainsQueried: result.domains,
    domainsResolved: new Set(result.resolutions.map((r) => r.domain)).size,
    resolutionsObserved: result.resolutions.length,
    resolutionsSaved: saved,
    queryErrors: result.errors.length,
    scope: await passiveScope(),
  };
  const file = `bench/results/passive-dns-${result.observedOn}-offset${offset}.json`;
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ ...payload, resultFile: file }, null, 2));
}

try {
  await main();
} finally {
  await closePools();
}
