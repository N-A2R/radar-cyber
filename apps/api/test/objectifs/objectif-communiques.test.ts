/**
 * One test per behaviour of the objective declaration.
 * Pure functions only: no network, no database, no filesystem.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkObjective, checkReportDeclaration, OBJECTIF_COMMUNIQUES } from "../../src/communiques/objectif.js";
import type { WeeklyMeasurement } from "../../src/communiques/store.js";

function measurement(count: number | null): Pick<WeeklyMeasurement, "weeks"> {
  return {
    weeks: [
      { week: "2026-W46", weekStart: "2026-11-09", count: 1, byDepartment: { "86": 1 } },
      ...(count === null
        ? []
        : [{ week: OBJECTIF_COMMUNIQUES.week, weekStart: "2026-11-16", count, byDepartment: { "23": 1 } }]),
    ],
  };
}

test("the published measurement declares 13 out of 13 for 2026-W47", () => {
  const check = checkObjective(measurement(13));
  assert.equal(check.reached, true);
  assert.equal(check.value, 13);
  assert.equal(check.target, 13);
  assert.equal(check.week, "2026-W47");
  assert.equal(
    check.line,
    "OBJECTIF : atteint — 13 / 13 communiqués officiels collectés pour la semaine 2026-W47",
  );
});

test("a shrunken target week turns the declaration into partiel", () => {
  const check = checkObjective(measurement(12));
  assert.equal(check.reached, false);
  assert.equal(check.value, 12);
  assert.equal(check.line.startsWith("OBJECTIF : partiel — 12 / 13"), true);
});

test("a missing target week counts as zero and does not borrow the current week", () => {
  const check = checkObjective(measurement(null));
  assert.equal(check.reached, false);
  assert.equal(check.value, 0);
  assert.equal(check.line.startsWith("OBJECTIF : partiel — 0 / 13"), true);
});

test("the report declaration must match the measured line exactly", () => {
  const line = checkObjective(measurement(13)).line;
  assert.equal(checkReportDeclaration(`intro\n\n${line}\n\nend`, line), true);
  assert.equal(checkReportDeclaration("intro\nOBJECTIF : atteint — 12 / 13\nend", line), false);
  assert.equal(checkReportDeclaration("intro\nend", line), false);
});
