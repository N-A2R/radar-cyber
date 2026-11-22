import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPollDelayMs, summarizeReplay } from "../src/analyse/claim-latency.js";

/** One behaviour per test: the replay must mirror the bounded feed collector. */

test("a claim published on a poll tick has no waiting time", () => {
  assert.equal(nextPollDelayMs(301_000, { intervalSec: 300, anchorMs: 1_000 }), 0);
});

test("a claim published just after a tick waits almost one interval", () => {
  assert.equal(nextPollDelayMs(301_001, { intervalSec: 300, anchorMs: 1_000 }), 299_999);
});

test("changing the poll phase never makes the wait exceed one interval", () => {
  const published = Date.parse("2026-11-20T08:13:37.000Z");
  for (let shift = 0; shift < 600_000; shift += 1_000) {
    const delay = nextPollDelayMs(published, { intervalSec: 300, anchorMs: shift });
    assert.ok(delay >= 0 && delay < 300_000);
  }
});

test("replay is independent of the order of the publications", () => {
  const options = { intervalSec: 300, anchorMs: 1_000 };
  const first = summarizeReplay([10_001, 40_000, 70_000], options);
  const second = summarizeReplay([70_000, 10_001, 40_000], options);
  assert.deepEqual(second, first);
});

test("replay summarises p50, p90 and max in minutes", () => {
  const summary = summarizeReplay([0, 60_000, 120_000, 240_000], { intervalSec: 300, anchorMs: 0 });
  assert.equal(summary.p50Minutes, 1);
  assert.equal(summary.p90Minutes, 3);
  assert.equal(summary.maxMinutes, 4);
});

test("a five-minute collector keeps every claim under the one-hour target", () => {
  const summary = summarizeReplay([0, 1, 299_999, 600_001], { intervalSec: 300, anchorMs: 0 });
  assert.equal(summary.count, 4);
  assert.equal(summary.withinTarget, 4);
  assert.equal(summary.withinTargetPct, 100);
});

test("unusable timestamps are excluded instead of poisoning the percentiles", () => {
  const summary = summarizeReplay([0, Number.NaN, 60_000], { intervalSec: 300, anchorMs: 0 });
  assert.equal(summary.count, 2);
  assert.equal(summary.maxMinutes, 4);
});
