/** Pure rules of the daily new-exposed-service detector. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isNaDepartmentValue } from "../src/geo/na-departments.js";
import { detectionLatencyHours, summarizeDetectionLatency } from "../src/exposition/new-services.js";

test("NA scope accepts codes, department names and the region label", () => {
	for (const value of ["33", " 64 ", "Gironde", "Pyrénées-Atlantiques", "Nouvelle-Aquitaine"]) {
		assert.equal(isNaDepartmentValue(value), true, value);
	}
	for (const value of [null, undefined, "", "75", "Paris", "972", "Occitanie"]) {
		assert.equal(isNaDepartmentValue(value), false, String(value));
	}
});

test("latency is the number of hours between first observation and detection", () => {
	assert.equal(
		detectionLatencyHours({
			firstSeenAt: "2026-11-20T00:00:00.000Z",
			detectedAt: "2026-11-20T13:30:00.000Z",
		}),
		13.5,
	);
	assert.equal(
		detectionLatencyHours({
			firstSeenAt: "2026-11-20T09:00:00.000Z",
			detectedAt: "2026-11-20T08:00:00.000Z",
		}),
		0,
	);
});

test("a batch summary reports p50, p95, max and the share under 24 hours", () => {
	const samples = [1, 2, 12, 18, 23, 24, 30].map((hours) => ({
		firstSeenAt: "2026-11-20T00:00:00.000Z",
		detectedAt: new Date(Date.parse("2026-11-20T00:00:00.000Z") + hours * 3_600_000).toISOString(),
	}));
	const summary = summarizeDetectionLatency(samples);
	assert.equal(summary.count, 7);
	assert.equal(summary.p50Hours, 18);
	assert.equal(summary.p95Hours, 28.2);
	assert.equal(summary.maxHours, 30);
	assert.equal(summary.withinTarget, 5);
	assert.equal(summary.withinTargetPct, 71.43);
});

test("an empty batch yields zeroed latency instead of a fabricated number", () => {
	assert.deepEqual(summarizeDetectionLatency([]), {
		targetHours: 24,
		count: 0,
		p50Hours: 0,
		p95Hours: 0,
		maxHours: 0,
		withinTarget: 0,
		withinTargetPct: 0,
	});
});
