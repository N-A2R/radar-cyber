/**
 * One behaviour per test for composite prior-wave counts.
 * Fixtures hold organisation-level keys and dates only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compositeWaveCounts,
  compositeWaveKey,
  type WaveSubject,
} from "../src/prediction/sector-wave.js";

function subject(orgId: number, publishedAt: string): WaveSubject {
  return {
    orgId,
    publishedAt,
    sectorGroup: " Services ",
    sector: "Immobilier",
    dept: "33",
  };
}

test("a composite key normalises each component", () => {
  assert.equal(compositeWaveKey(subject(1, "2026-06-01"), "grp_dept"), "services|33");
  assert.equal(
    compositeWaveKey(subject(1, "2026-06-01"), "grp_secteur_dept"),
    "services|immobilier|33",
  );
});

test("a blank component invalidates the composite key", () => {
  const row = { ...subject(1, "2026-06-01"), sector: "   " };
  assert.equal(compositeWaveKey(row, "secteur_dept"), null);
  assert.equal(compositeWaveKey(row, "grp_dept"), "services|33");
});

test("composite counts exclude claims on or after the cutoff", () => {
  const counts = compositeWaveCounts(
    [subject(2, "2026-06-24"), subject(3, "2026-06-25"), subject(4, "2026-07-01")],
    "2026-06-25",
    "grp_dept",
    365,
  );
  assert.deepEqual([...counts.entries()], [["services|33", 1]]);
});

test("composite counts exclude claims older than the lookback", () => {
  const counts = compositeWaveCounts(
    [subject(2, "2025-06-24"), subject(3, "2025-06-25")],
    "2026-06-25",
    "grp_dept",
    365,
  );
  assert.deepEqual([...counts.entries()], [["services|33", 1]]);
});

test("composite counts aggregate scopes without using the claim group", () => {
  const other = { ...subject(3, "2026-06-20"), sector: "Commerce" };
  const counts = compositeWaveCounts(
    [subject(2, "2026-06-10"), other],
    "2026-06-25",
    "grp_dept",
    365,
  );
  assert.deepEqual([...counts.entries()], [["services|33", 2]]);
});
