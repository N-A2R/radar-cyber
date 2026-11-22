/**
 * One test per freshness behavior: fresh bursts stay, backfilled bursts go,
 * and the guard never invents timing or hides a signal it cannot judge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessFreshness,
  collectionLagDays,
  DEFAULT_MAX_LAG_DAYS,
  filterFreshAlerts,
  type EvidenceTiming,
} from "../src/analyse/evidence-freshness.js";

const OBSERVED = "2026-11-20T12:00:00Z";

function evidenceWithLag(days: number, index = 0): EvidenceTiming {
  return {
    observedAt: OBSERVED,
    collectedAt: new Date(Date.parse(OBSERVED) + (days + index / 1000) * 86_400_000).toISOString(),
  };
}

test("fresh burst is kept with its timing reported", () => {
  const verdict = assessFreshness([0.2, 0.5, 1, 2].map((d) => evidenceWithLag(d)));
  assert.equal(verdict.keep, true);
  assert.equal(verdict.fresh, 4);
  assert.equal(verdict.total, 4);
  assert.ok(verdict.maxLagDays !== null && verdict.maxLagDays <= DEFAULT_MAX_LAG_DAYS);
  assert.match(verdict.reason, /collected within/);
});

test("backfilled burst is rejected as a historical import", () => {
  const verdict = assessFreshness([25, 80, 180, 215].map((d) => evidenceWithLag(d)));
  assert.equal(verdict.keep, false);
  assert.equal(verdict.fresh, 0);
  assert.equal(verdict.total, 4);
  assert.equal(verdict.maxLagDays, 215);
  assert.match(verdict.reason, /historical import/);
});

test("burst with too few fresh records is rejected", () => {
  const verdict = assessFreshness([
    evidenceWithLag(0.5),
    ...[30, 40, 50, 60].map((d) => evidenceWithLag(d)),
  ]);
  assert.equal(verdict.keep, false);
  assert.equal(verdict.fresh, 1);
  assert.equal(verdict.total, 5);
});

test("lag exactly at the limit is fresh, just above it is not", () => {
  const atLimit = assessFreshness([evidenceWithLag(DEFAULT_MAX_LAG_DAYS)]);
  assert.equal(atLimit.keep, true);
  const aboveLimit = assessFreshness([evidenceWithLag(DEFAULT_MAX_LAG_DAYS + 0.01)]);
  assert.equal(aboveLimit.keep, false);
});

test("unusable timing is ignored and never suppresses the only signal", () => {
  const unknown = assessFreshness([{ observedAt: "not a date", collectedAt: "not a date" }]);
  assert.equal(unknown.keep, true);
  assert.equal(unknown.total, 0);
  assert.equal(unknown.maxLagDays, null);
  const mixed = assessFreshness([{ observedAt: "not a date", collectedAt: OBSERVED }, evidenceWithLag(200)]);
  assert.equal(mixed.keep, false);
  assert.equal(mixed.total, 1);
  assert.equal(collectionLagDays({ observedAt: OBSERVED, collectedAt: "also invalid" }), null);
});

test("invalid guard settings are refused before evaluation", () => {
  assert.throws(() => assessFreshness([], { maxLagDays: -1 }), RangeError);
  assert.throws(() => assessFreshness([], { minFreshShare: 0 }), RangeError);
  assert.throws(() => assessFreshness([], { minFreshShare: 1.1 }), RangeError);
});

test("alert filtering drops backfilled alerts and keeps fresh ones in order", () => {
  const timings = new Map<string, EvidenceTiming>();
  timings.set("old-1", evidenceWithLag(120));
  timings.set("old-2", evidenceWithLag(90));
  timings.set("fresh-1", evidenceWithLag(0.5));
  timings.set("fresh-2", evidenceWithLag(1));
  const result = filterFreshAlerts([
    { cle: "source:feed:2026-04-13", faits: ["old-1", "old-2"] },
    { cle: "source:poc:2026-11-20", faits: ["fresh-1", "fresh-2"] },
  ], timings);
  assert.deepEqual(result.alerts.map((a) => a.cle), ["source:poc:2026-11-20"]);
  assert.deepEqual(result.rejected.map((r) => r.cle), ["source:feed:2026-04-13"]);
  assert.equal(result.rejected[0]?.verdict.keep, false);
});
