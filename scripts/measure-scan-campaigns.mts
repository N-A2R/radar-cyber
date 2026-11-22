/**
 * Reproducible measurement of mass-scan campaigns targeting Nouvelle-Aquitaine IPs.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:scan-campaigns
 *   DATABASE_URL=... pnpm measure:scan-campaigns --json=bench/results/scan-na.json
 *
 * Read-only: no event, source or organisation is modified. Every published
 * counter comes from measureScanCampaigns(). The JSON carries identifiers,
 * source names, target addresses and timestamps only: no title, victim name,
 * e-mail or phone number.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import { SCAN_SIGNAL_PATTERN } from "../apps/api/src/scan/detect.js";
import { SQL, measureScanCampaigns } from "../apps/api/src/scan/measure.js";

const argv = process.argv.slice(2);
const output =
  argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/scan-campaigns-na-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureScanCampaigns();
  const result = {
    command: "pnpm measure:scan-campaigns",
    scope: measurement.scope,
    basis: measurement.basis,
    count: measurement.count,
    campaigns: measurement.campaigns,
    signals: measurement.signals,
    signalsScanned: measurement.signalsScanned,
    perimeterIps: measurement.perimeterIps,
    expositionIps: measurement.expositionIps,
    passiveDnsIps: measurement.passiveDnsIps,
    sources: measurement.sources,
    baseline: measurement.baseline,
    pattern: SCAN_SIGNAL_PATTERN,
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA mass-scan campaigns from public sources: ${measurement.count} ` +
      `(signals=${measurement.signalsScanned}, attributed=${measurement.signals.length}, ` +
      `NA IPs=${measurement.perimeterIps}, orgs=${measurement.baseline.organizations}, ` +
      `sources=${measurement.baseline.sources}, events=${measurement.baseline.events}) -> ${output}`,
  );
} finally {
  await closePools();
}
