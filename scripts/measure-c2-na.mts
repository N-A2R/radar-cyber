/**
 * Reproducible measurement of presumed C2 servers hosted in Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     pnpm measure:c2-na
 *   DATABASE_URL=... pnpm measure:c2-na --json=bench/results/c2-na.json
 *
 * Every published counter comes from measureC2Servers(); the SQL and patterns
 * are exported next to the result. No victim data is read or written: the JSON
 * contains aggregate counters, detection identifiers, source names and the NA
 * location matched by the rule.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import { C2_PATTERN } from "../apps/api/src/c2/detect.js";
import { C2_SOURCE_PATTERN, SQL, measureC2Servers } from "../apps/api/src/c2/measure.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/c2-na-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureC2Servers();
  const result = {
    command: "pnpm measure:c2-na",
    scope: measurement.scope,
    basis: measurement.basis,
    count: measurement.count,
    detections: measurement.detections,
    signalsScanned: measurement.signalsScanned,
    signals: measurement.signals,
    c2Sources: measurement.c2Sources,
    baseline: measurement.baseline,
    patterns: { c2: C2_PATTERN, c2Sources: C2_SOURCE_PATTERN },
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA presumed C2 servers hosted in region: ${measurement.count} ` +
      `(signals=${measurement.signalsScanned}, c2 sources=${measurement.c2Sources.length}, ` +
      `orgs=${measurement.baseline.organizations}, sources=${measurement.baseline.sources}, ` +
      `events=${measurement.baseline.events}) -> ${output}`,
  );
} finally {
  await closePools();
}
