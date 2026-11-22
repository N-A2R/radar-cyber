/**
 * Promotes verified Nouvelle-Aquitaine claims into public events for the
 * departments that still have no event. Idempotent and bounded: no network,
 * no personal data, no claim body read.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/fill-na-department-gaps.mts \
 *     --json=bench/results/na-departments-gaps-applied-2026-11-22.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { fillNaDepartmentGaps, measureNaDepartments } from "../apps/api/src/technical/na-departments.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const output = argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `${ROOT}bench/results/na-departments-gaps-applied-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const applied = await fillNaDepartmentGaps();
  const measurement = await measureNaDepartments();
  const report = {
    command: "tsx scripts/fill-na-department-gaps.mts",
    applied,
    scope: measurement.scope,
    departments: measurement.departments,
    zeroDepartments: measurement.zeroDepartments,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Gap claims scanned: ${applied.scanned} (inserted=${applied.inserted}, already=${applied.alreadyPresent}, refused=${applied.refused}); ` +
      `NA departments at zero: ${measurement.zeroDepartments.length} [${measurement.zeroDepartments.join(",")}] -> ${output}`,
  );
} finally {
  await closePools();
}
