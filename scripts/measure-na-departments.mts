/**
 * Reproducible measurement of Nouvelle-Aquitaine department coverage.
 * Every counter comes from measureNaDepartments() on the live database; the
 * artifact carries the SQL used and aggregate rows only.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-na-departments.mts \
 *     --json=bench/results/na-departments-2026-11-22.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { measureNaDepartments } from "../apps/api/src/technical/na-departments.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const output = argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `${ROOT}bench/results/na-departments-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureNaDepartments();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(
    `Departments with an event: ${measurement.departments.length - measurement.zeroDepartments.length}/12; ` +
      `at zero: ${measurement.zeroDepartments.length} [${measurement.zeroDepartments.join(",")}]; ` +
      `events: ${measurement.eventCount}; gap claims pending: ${measurement.gapClaimsPending} -> ${output}`,
  );
} finally {
  await closePools();
}
