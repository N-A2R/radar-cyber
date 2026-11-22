/**
 * One behaviour per test for the group-agnostic sector-wave audit.
 * Fixtures are organisation-level only: no claim text or personal detail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	measureWaveSource,
	normaliseWaveKey,
	priorWaveSignals,
	summariseWaveCoverage,
	waveBonus,
	waveCountsAtCutoff,
	type WaveSubject,
} from "../src/prediction/sector-wave.js";

function subject(
	orgId: number,
	publishedAt: string,
	sectorGroup: string | null = "Commerce",
	sector: string | null = "commerce",
	dept = "33",
): WaveSubject {
	return { orgId, publishedAt, sectorGroup, sector, dept };
}

test("scope keys ignore case, whitespace and diacritics", () => {
	assert.equal(normaliseWaveKey(" AgroAlimentaire "), "agroalimentaire");
	assert.equal(normaliseWaveKey("ÉNERGIE"), "energie");
});

test("an empty scope key is not a signal", () => {
	assert.equal(normaliseWaveKey("   "), null);
	assert.deepEqual(priorWaveSignals(subject(1, "2026-07-01", "   "), [subject(2, "2026-06-01")], "secteur_groupe"), []);
});

test("a prior claim in the same sector group is a signal", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01"),
		[subject(2, "2026-06-01", "commerce")],
		"secteur_groupe",
	);
	assert.deepEqual(signals.map((signal) => `${signal.scope}:${signal.observedAt}`), [
		"secteur_groupe:2026-06-01",
	]);
});

test("a claim in another sector group is ignored", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01", "Commerce"),
		[subject(2, "2026-06-01", "Industrie")],
		"secteur_groupe",
	);
	assert.deepEqual(signals, []);
});

test("the secteur scope uses the detailed sector code", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01"),
		[subject(2, "2026-06-01", "Industrie", "commerce")],
		"secteur",
	);
	assert.deepEqual(signals.map((signal) => signal.scope), ["secteur"]);
});

test("the departement scope keeps its two-digit code", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01", "Commerce", "commerce", "17"),
		[subject(2, "2026-06-01", "Industrie", "industrie", "17")],
		"departement",
	);
	assert.deepEqual(signals.map((signal) => signal.observedAt), ["2026-06-01"]);
});

test("a claim by the victim organisation itself is not a precursor", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01"),
		[subject(1, "2026-06-01")],
		"secteur_groupe",
	);
	assert.deepEqual(signals, []);
});

test("a claim on the victim's own claim day is not a precursor", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01"),
		[subject(2, "2026-07-01")],
		"secteur_groupe",
	);
	assert.deepEqual(signals, []);
});

test("a claim after the victim's claim is not a precursor", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01"),
		[subject(2, "2026-08-01")],
		"secteur_groupe",
	);
	assert.deepEqual(signals, []);
});

test("a claim at the lookback boundary is included", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01"),
		[subject(2, "2026-06-01")],
		"secteur_groupe",
		30,
	);
	assert.equal(signals.length, 1);
});

test("a claim older than the lookback is excluded", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01"),
		[subject(2, "2026-05-31")],
		"secteur_groupe",
		30,
	);
	assert.deepEqual(signals, []);
});

test("two claims by one organisation on one day are collapsed", () => {
	const signals = priorWaveSignals(
		subject(1, "2026-07-01"),
		[subject(2, "2026-06-01"), subject(2, "2026-06-01T10:00:00Z")],
		"secteur_groupe",
	);
	assert.equal(signals.length, 1);
});

test("one victim with several prior claims is counted once", () => {
	const result = measureWaveSource(
		"secteur_groupe",
		[subject(1, "2026-07-01")],
		[subject(2, "2026-06-10"), subject(3, "2026-06-20")],
	);
	assert.equal(result.victimsWithPriorSignal, 1);
	assert.equal(result.priorSignals, 2);
});

test("coverage takes the union of victims across scopes", () => {
	const summary = summariseWaveCoverage([
		{ scope: "departement", victims: 2, pairs: 2, victimsWithPriorSignal: 1, priorSignals: 1, coveredOrgIds: [1] },
		{ scope: "secteur_groupe", victims: 2, pairs: 2, victimsWithPriorSignal: 1, priorSignals: 3, coveredOrgIds: [2] },
	]);
	assert.equal(summary.victimsWithAnyPriorSignal, 2);
	assert.equal(summary.priorSignalPairs, 2);
	assert.equal(summary.coverage, 1);
});

test("cutoff counts use only the lookback before the cutoff", () => {
	const counts = waveCountsAtCutoff(
		[subject(2, "2026-06-01"), subject(3, "2026-05-26"), subject(4, "2026-05-25"), subject(5, "2026-06-25")],
		"2026-06-25",
		"secteur_groupe",
		30,
	);
	assert.deepEqual([...counts.entries()], [["commerce", 2]]);
});

test("the ranking bonus is bounded and deterministic", () => {
	const groups = new Map<number, string | null>([[1, "Commerce"]]);
	const counts = new Map<string, number>([["commerce", 9]]);
	assert.equal(waveBonus(1, groups, counts), 90);
	assert.equal(waveBonus(2, groups, counts), 0);
	assert.equal(waveBonus(1, groups, counts, 10), 30);
});
