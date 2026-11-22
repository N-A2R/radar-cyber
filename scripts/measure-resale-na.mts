/**
 * Reproducible measurement of resale listings in Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     pnpm measure:resale-na
 *   DATABASE_URL=... pnpm measure:resale-na --json=bench/results/resale-na.json
 *
 * Every published counter comes from measureResaleListings(); the SQL is
 * exported next to the result. No victim data is read or written: the JSON
 * contains aggregate counters, listing identifiers and the scope basis only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import { SQL, measureResaleListings } from "../apps/api/src/resale/measure.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/resale-na-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureResaleListings();
  const result = {
    command: "pnpm measure:resale-na",
    scope: measurement.scope,
    basis: measurement.basis,
    count: measurement.count,
    candidatesScanned: measurement.candidatesScanned,
    saleOffersAll: measurement.saleOffersAll,
    naDomains: measurement.naDomains,
    baseline: measurement.baseline,
    listings: measurement.listings,
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA resale listings detected: ${measurement.count} ` +
      `(candidates=${measurement.candidatesScanned}, all offers=${measurement.saleOffersAll}, ` +
      `orgs=${measurement.baseline.organizations}, sources=${measurement.baseline.sources}, ` +
      `events=${measurement.baseline.events}) -> ${output}`,
  );
} finally {
  await closePools();
}
