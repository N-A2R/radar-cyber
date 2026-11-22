/**
 * Promotes verified Nouvelle-Aquitaine claims into public events for the four
 * departments still at zero on 2026-11-22. Idempotent and bounded: no network,
 * no personal data, no claim body read.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/fill-na-remaining-gaps.mts \
 *     --json=bench/results/na-remaining-gaps-applied-2026-11-22.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import {
  fillRemainingNaGaps,
  measureNaDepartments,
} from "../apps/api/src/technical/na-departments.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const output = argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `${ROOT}bench/results/na-remaining-gaps-applied-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const applied = await fillRemainingNaGaps();
  const measurement = await measureNaDepartments();
  const report = {
    command: "tsx scripts/fill-na-remaining-gaps.mts",
    applied,
    scope: measurement.scope,
    departments: measurement.departments,
    zeroDepartments: measurement.zeroDepartments,
    eventCount: measurement.eventCount,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Remaining gap claims scanned: ${applied.scanned} (inserted=${applied.inserted}, ` +
      `already=${applied.alreadyPresent}, refused=${applied.refused}); ` +
      `NA departments at zero: ${measurement.zeroDepartments.length} [${measurement.zeroDepartments.join(",")}] -> ${output}`,
  );
} finally {
  await closePools();
}
