/**
 * Regime-change detector: one behaviour per test — sustained up/down shifts,
 * isolated-spike rejection, zero-filled days, and the stored SQL criterion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addDays, detectRegimeChanges } from "../src/analyse/changepoint.js";
import {
	CHANGEPOINT_MAX_DELAY_DAYS,
	runChangepointBacktest,
	type ChangepointFixture,
} from "../src/analyse/changepoint-backtest.js";
import { query } from "../src/db.js";

const START = "2026-01-01";

function points(counts: readonly number[]) {
	return counts.map((count, offset) => ({ day: addDays(START, offset), count }));
}

function baseline(days: number, level: number): number[] {
	return Array.from({ length: days }, (_, day) => level + (day % 4));
}

test("detects an upward step within seven days", () => {
	const counts = baseline(120, 20);
	for (let day = 70; day < counts.length; day++) counts[day] = 42 + (day % 4);
	const result = detectRegimeChanges(points(counts));
	assert.equal(result.changes.length, 1);
	const [change] = result.changes;
	assert.equal(change?.direction, "up");
	const delay = Math.round((Date.parse(`${change!.day}T00:00:00Z`) - Date.parse(`${addDays(START, 70)}T00:00:00Z`)) / 86_400_000);
	assert.ok(delay >= 0 && delay <= CHANGEPOINT_MAX_DELAY_DAYS, `delay ${delay}`);
});

test("detects a downward step within seven days", () => {
	const counts = baseline(120, 60);
	for (let day = 70; day < counts.length; day++) counts[day] = 18 + (day % 3);
	const result = detectRegimeChanges(points(counts));
	assert.equal(result.changes.length, 1);
	assert.equal(result.changes[0]?.direction, "down");
});

test("rejects a single-day spike", () => {
	const counts = baseline(120, 20);
	counts[70] = 220;
	const result = detectRegimeChanges(points(counts));
	assert.deepEqual(result.changes, []);
});

test("rejects a two-day burst that retracts", () => {
	const counts = baseline(120, 20);
	counts[70] = 90;
	counts[71] = 90;
	const result = detectRegimeChanges(points(counts));
	assert.deepEqual(result.changes, []);
});

test("zero-fills missing days between observations", () => {
	const counts = baseline(120, 25);
	const sparse = points(counts).filter((_, index) => index % 2 === 0);
	const result = detectRegimeChanges(sparse);
	assert.equal(result.changes.length, 0);
	assert.ok(result.evaluatedDays > 0);
});

test("fixture replay matches the stored evaluation and criterion", async () => {
	const fixture = JSON.parse(
		readFileSync(fileURLToPath(new URL("../../../bench/changepoints/serie-460j.json", import.meta.url)), "utf8"),
	) as ChangepointFixture;
	const replay = runChangepointBacktest(fixture);
	assert.equal(replay.metrics.annotated, 30);
	assert.ok(replay.metrics.detectionRate >= 0.8, `taux rejoué ${replay.metrics.detectionRate}`);
	assert.ok(replay.metrics.falsePositivesPerYear <= 2, `faux positifs ${replay.metrics.falsePositivesPerYear}/an`);

	const stored = await query<{ total: string; detected: string; rate: number }>(
		`SELECT count(*)::text AS total,
		        count(*) FILTER (WHERE detected AND delay_days <= ${CHANGEPOINT_MAX_DELAY_DAYS})::text AS detected,
		        count(*) FILTER (WHERE detected AND delay_days <= ${CHANGEPOINT_MAX_DELAY_DAYS})::float / count(*) AS rate
		   FROM changepoint_eval`,
	);
	const row = stored.rows[0];
	assert.equal(Number(row?.total), 30);
	assert.equal(Number(row?.detected), replay.metrics.detectedWithin7);
	assert.ok(Number(row?.rate) >= 0.8, `critère SQL ${row?.rate} < 0,80`);

	const metric = await query<{ false_positives_per_year: number; evaluated_days: number }>(
		"SELECT false_positives_per_year, evaluated_days FROM changepoint_metric WHERE model = 'weekly-z@1'",
	);
	assert.ok(Number(metric.rows[0]?.false_positives_per_year) <= 2);
	assert.equal(Number(metric.rows[0]?.evaluated_days), replay.metrics.evaluatedDays);

	const detections = await query<{ total: string; fp: string }>(
		`SELECT count(*)::text AS total,
		        count(*) FILTER (WHERE false_positive)::text AS fp
		   FROM changepoint_detection
		  WHERE model = 'weekly-z@1'`,
	);
	assert.equal(Number(detections.rows[0]?.total), replay.detections.length);
	assert.equal(Number(detections.rows[0]?.fp), replay.metrics.falsePositives);
});
