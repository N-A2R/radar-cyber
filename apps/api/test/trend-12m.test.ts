/**
 * Twelve-month trend: one behaviour per test — zero-filled months, window
 * bounds, grouping, sustained breaks, noise guards, evidence and replay.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	analyseTrend,
	buildMonthlySeries,
	detectBreaks,
	trendWindow,
	type TrendEvent,
} from "../src/analyse/trend-12m.js";

const AS_OF = "2026-11-21T12:00:00Z";
const WINDOW = trendWindow(AS_OF);

function at(index: number): string {
	return `${WINDOW[index]!}-15T12:00:00Z`;
}

function events(counts: readonly number[]): TrendEvent[] {
	return counts.flatMap((count, month) =>
		Array.from({ length: count }, (_, i) => ({ id: `e-${month}-${i}`, at: at(month) })),
	);
}

test("builds twelve zero-filled months including empty ones", () => {
	const counts = Array.from({ length: 12 }, (_, i) => (i === 10 ? 2 : 0));
	const series = buildMonthlySeries(events(counts), { asOf: AS_OF });
	assert.equal(series.length, 1);
	const [global] = series;
	assert.equal(global?.axis, "all");
	assert.equal(global?.months.length, 12);
	assert.equal(global?.months[0]?.month, "2025-12");
	assert.equal(global?.months[11]?.month, "2026-11");
	assert.equal(global?.months[10]?.count, 2);
	assert.equal(global?.months[0]?.count, 0);
	assert.equal(global?.total, 2);
});

test("ignores events outside the window and after asOf", () => {
	const inside: TrendEvent = { id: "in", at: "2026-11-15T10:00:00Z" };
	const outside: TrendEvent[] = [
		{ id: "too-old", at: "2025-11-30T10:00:00Z" },
		{ id: "too-late", at: "2026-12-01T10:00:00Z" },
		{ id: "after-cut", at: "2026-11-25T10:00:00Z" },
		{ id: "invalid", at: "not-a-date" },
	];
	const series = buildMonthlySeries([inside, ...outside], { asOf: AS_OF });
	assert.equal(series[0]?.total, 1);
	assert.deepEqual(series[0]?.months.flatMap((m) => m.eventIds), ["in"]);
});

test("groups events by axis in a deterministic order", () => {
	const rows: TrendEvent[] = [
		{ id: "1", at: at(11), source: "zeta", sector: "sante", org: "42" },
		{ id: "2", at: at(11), source: "alpha", sector: "sante" },
	];
	const series = buildMonthlySeries(rows, { asOf: AS_OF });
	assert.deepEqual(series.map((s) => `${s.axis}:${s.group}`), [
		"all:all",
		"source:alpha",
		"source:zeta",
		"sector:sante",
		"org:42",
	]);
});

test("reports a sustained upward break with its supporting event ids", () => {
	const counts = [...Array.from({ length: 10 }, () => 0), 6, 56];
	const series = buildMonthlySeries(events(counts), { asOf: AS_OF });
	const breaks = detectBreaks(series);
	assert.equal(breaks.length, 1);
	const [breaking] = breaks;
	assert.equal(breaking?.month, "2026-10");
	assert.equal(breaking?.direction, "up");
	assert.equal(breaking?.baseline, 0);
	assert.equal(breaking?.level, 31);
	assert.equal(breaking?.eventIds.length, 10);
	assert.ok(breaking?.eventIds.every((id) => String(id).startsWith("e-10-") || String(id).startsWith("e-11-")));
});

test("does not call a one-month spike a break", () => {
	const counts = [...Array.from({ length: 11 }, () => 0), 60];
	const series = buildMonthlySeries(events(counts), { asOf: AS_OF });
	assert.deepEqual(detectBreaks(series), []);
});

test("detects a sustained downward break", () => {
	const counts = [...Array.from({ length: 6 }, () => 12), ...Array.from({ length: 6 }, () => 0)];
	const series = buildMonthlySeries(events(counts), { asOf: AS_OF });
	const breaks = detectBreaks(series);
	assert.equal(breaks.length, 1);
	assert.equal(breaks[0]?.month, "2026-06");
	assert.equal(breaks[0]?.direction, "down");
	assert.equal(breaks[0]?.baseline, 12);
	assert.equal(breaks[0]?.level, 0);
});

test("ignores a change below the minimum count", () => {
	const counts = [...Array.from({ length: 10 }, () => 0), 1, 1];
	const series = buildMonthlySeries(events(counts), { asOf: AS_OF });
	assert.deepEqual(detectBreaks(series), []);
});

test("does not break on a series shorter than its history", () => {
	const series = buildMonthlySeries(events([12, 12, 0]), { asOf: AS_OF, months: 3 });
	assert.deepEqual(detectBreaks(series), []);
});

test("caps the evidence attached to one break", () => {
	const counts = [...Array.from({ length: 10 }, () => 0), 6, 56];
	const series = buildMonthlySeries(events(counts), { asOf: AS_OF });
	const breaks = detectBreaks(series, { maxEvidence: 10 });
	assert.equal(breaks.length, 1);
	assert.equal(breaks[0]?.eventIds.length, 10);
});

test("replays the same analysis byte for byte", () => {
	const rows = events([...Array.from({ length: 10 }, () => 0), 6, 56]);
	assert.deepEqual(analyseTrend(rows, { asOf: AS_OF }), analyseTrend(rows, { asOf: AS_OF }));
});
