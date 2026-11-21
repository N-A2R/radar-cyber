/** One test per observable behaviour of the silent-source detector. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";
import {
	DAY_MS,
	HOUR_MS,
	SILENCE_ALERT_HOURS,
	SILENT_SOURCE_RULE,
	SILENT_SOURCE_SCOPE,
	detectSilentSources,
	detectSilentSource,
	summarizeSilenceDelays,
} from "../src/detect/silent-source.js";
import { runSilentSourceCheck } from "../src/detect/silent-source-monitor.js";
import { replaySilentSourceEpisodes } from "../src/detect/silent-source-replay.js";

const NOW = Date.parse("2026-11-21T12:00:00Z");

function hoursAgo(...hours: number[]): number[] {
	return hours.map((h) => NOW - h * HOUR_MS);
}

function daysAgo(...days: number[]): number[] {
	return days.map((d) => NOW - d * DAY_MS);
}

test("a source without any production is unknown, not silent", () => {
	assert.equal(detectSilentSource({ sourceId: "empty", productionTimes: [] }, NOW), null);
});

test("invalid and future timestamps cannot create or hide an alert", () => {
	const past = daysAgo(4, 5, 6, 7);
	const noisy = [Number.NaN, Number.POSITIVE_INFINITY, NOW + HOUR_MS, ...past];
	assert.deepEqual(
		detectSilentSource({ sourceId: "bad-clock", productionTimes: noisy }, NOW),
		detectSilentSource({ sourceId: "bad-clock", productionTimes: past }, NOW),
	);
	assert.equal(detectSilentSource({ sourceId: "bad-clock", productionTimes: [Number.NaN, Number.POSITIVE_INFINITY] }, NOW), null);
});

test("a pause shorter than the threshold produces no alert", () => {
	const signal = { sourceId: "recent", productionTimes: hoursAgo(1, SILENCE_ALERT_HOURS - 1, 30, 54, 78) };
	assert.equal(detectSilentSource(signal, NOW), null);
});

test("a pause at the threshold produces an alert with its evidence", () => {
	const last = NOW - SILENCE_ALERT_HOURS * HOUR_MS;
	const alert = detectSilentSource({ sourceId: "silent", productionTimes: [last, ...daysAgo(2, 3, 4)] }, NOW);
	assert.ok(alert);
	assert.equal(alert.ruleId, SILENT_SOURCE_RULE);
	assert.equal(alert.lastProductionAt, last);
	assert.equal(alert.silenceHours, SILENCE_ALERT_HOURS);
	assert.equal(alert.cadenceDays, 3);
});

test("fewer than three active days is not a cadence", () => {
	const signal = { sourceId: "irregular", productionTimes: [NOW - 20 * HOUR_MS, NOW - 2 * DAY_MS, NOW - 3 * DAY_MS] };
	assert.equal(detectSilentSource(signal, NOW), null);
});

test("several items on the same UTC day count as one cadence day", () => {
	const sameDay = [3, 3, 4, 5].map((d) => NOW - d * DAY_MS + HOUR_MS);
	const signal = { sourceId: "bursty", productionTimes: [...sameDay, NOW - 20 * HOUR_MS] };
	assert.equal(detectSilentSource(signal, NOW)?.cadenceDays, 3);
});

test("production older than the cadence window does not count", () => {
	const signal = { sourceId: "stale-history", productionTimes: [NOW - 20 * HOUR_MS, ...daysAgo(20, 21, 22, 23)] };
	assert.equal(detectSilentSource(signal, NOW), null);
});

test("sources are evaluated independently and keep input order", () => {
	const recent = { sourceId: "recent", productionTimes: [NOW - HOUR_MS] };
	const silent = { sourceId: "silent", productionTimes: [NOW - 20 * HOUR_MS, ...daysAgo(2, 3, 4)] };
	const silentAgain = { sourceId: "silent-again", productionTimes: [NOW - 30 * HOUR_MS, ...daysAgo(3, 4, 5)] };
	assert.deepEqual(
		detectSilentSources([recent, silent, silentAgain], NOW).map((a) => a.sourceId),
		["silent", "silent-again"],
	);
});

test("delay summary reports the measured median, p90, max and 24 h count", () => {
	const summary = summarizeSilenceDelays([10, 12, 13, 14, 26, Number.NaN, -1]);
	assert.deepEqual(summary, { count: 5, p50Hours: 13, p90Hours: 21.2, maxHours: 26, under24h: 4 });
});

test("hourly monitor writes one review alert per silent source and deduplicates it", async () => {
	const sourceId = "public-title:na-quotidien-017";
	const timestamps = hoursAgo(20, 44, 68, 92).map((t) => new Date(t).toISOString());
	await query(
		`INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new)
		 SELECT $1, t - interval '1 minute', t, 'ok', 1, 1
		   FROM unnest($2::timestamptz[]) AS t`,
		[sourceId, timestamps],
	);
	try {
		const first = await runSilentSourceCheck({ now: NOW, force: true, sourceIds: [sourceId] });
		assert.equal(first.ran, true);
		assert.equal(first.alerts, 1);
		assert.equal(first.created, 1);

		const second = await runSilentSourceCheck({ now: NOW, force: true, sourceIds: [sourceId] });
		assert.equal(second.alerts, 1);
		assert.equal(second.created, 0, "a second check must not duplicate the alert");
	} finally {
		await query(`DELETE FROM alert WHERE rule_id=$1 AND scope=$2 AND evidence->>'sourceId'=$3`, [
			SILENT_SOURCE_RULE, SILENT_SOURCE_SCOPE, sourceId,
		]);
		await query(`DELETE FROM collector_run WHERE source_id=$1 AND finished_at = ANY($2::timestamptz[])`, [sourceId, timestamps]);
	}
});

test("hourly monitor skips a check inside the interval", async () => {
	const result = await runSilentSourceCheck({ now: NOW + HOUR_MS - 1 });
	assert.equal(result.ran, false);
	assert.equal(result.sources, 0);
});

test("replay keeps only pauses confirmed silent for at least 24 hours", () => {
	const row = (sourceId: string, hoursBefore: number) => ({
		source_id: sourceId,
		produced_at: new Date(NOW - hoursBefore * HOUR_MS).toISOString(),
	});
	const cadence = (sourceId: string, lastHoursAgo: number) =>
		[1, 2, 3].map((d) => row(sourceId, lastHoursAgo + d * 24));

	const episodes = replaySilentSourceEpisodes(
		[
			...cadence("confirmed", 48), row("confirmed", 48), row("confirmed", 6),
			...cadence("brief", 20), row("brief", 20), row("brief", 8),
			...cadence("ongoing", 48), row("ongoing", 48),
		],
		NOW - 30 * DAY_MS,
		NOW,
	);
	assert.deepEqual(episodes.map((e) => e.sourceId), ["confirmed", "ongoing"]);
	assert.equal(episodes[0]?.delayHours, 12);
});
