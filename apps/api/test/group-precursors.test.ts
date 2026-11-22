/**
 * One behaviour per test for collective group precursors.
 * Fixtures are organisation-level only: no claim text or personal detail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	measureGroupSource,
	normaliseGroup,
	priorGroupSignals,
	summariseGroupCoverage,
	type ClaimRecord,
} from "../src/prediction/group-precursors.js";

function claim(
	orgId: number,
	publishedAt: string,
	group: string | null = "Qilin",
	sector: string | null = "commerce",
	dept = "33",
): ClaimRecord {
	return { orgId, publishedAt, group, sector, dept };
}

test("a prior claim by the same group in the same sector is a signal", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[claim(2, "2026-06-01", "Qilin", "commerce", "17")],
	);
	assert.deepEqual(signals.map((signal) => `${signal.scope}:${signal.observedAt}`), [
		"secteur:2026-06-01",
	]);
});

test("a prior claim by the same group in the same department is a signal", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[claim(2, "2026-06-01", "Qilin", "industrie", "33")],
	);
	assert.deepEqual(signals.map((signal) => signal.scope), ["departement"]);
});

test("one prior claim matching both scopes yields two signals", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[claim(2, "2026-06-01", "Qilin", "commerce", "33")],
	);
	assert.deepEqual(signals.map((signal) => signal.scope), ["departement", "secteur"]);
});

test("a claim by another group is ignored", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[claim(2, "2026-06-01", "Lockbit", "commerce", "33")],
	);
	assert.deepEqual(signals, []);
});

test("a claim in another sector and department is ignored", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[claim(2, "2026-06-01", "Qilin", "industrie", "17")],
	);
	assert.deepEqual(signals, []);
});

test("a claim on the victim's own claim day is not a precursor", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[claim(2, "2026-07-01", "Qilin", "commerce", "33")],
	);
	assert.deepEqual(signals, []);
});

test("a later claim is not a precursor", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[claim(2, "2026-08-01", "Qilin", "commerce", "33")],
	);
	assert.deepEqual(signals, []);
});

test("the victim's own earlier claim does not count as a collective signal", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[claim(1, "2026-06-01", "Qilin", "commerce", "33")],
	);
	assert.deepEqual(signals, []);
});

test("group labels are normalised without substring matching", () => {
	assert.equal(normaliseGroup("  QÍLIN  "), "qilin");
	assert.equal(normaliseGroup("   "), null);
	assert.equal(normaliseGroup(null), null);
	const signals = priorGroupSignals(
		claim(1, "2026-07-01", "qilin"),
		[claim(2, "2026-06-01", "Qilin U.K.", "commerce", "33")],
	);
	assert.deepEqual(signals, []);
});

test("repeated prior claims from one organisation and day are collapsed", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01"),
		[
			claim(2, "2026-06-01", "Qilin", "commerce", "33"),
			claim(2, "2026-06-01", "QILIN", "commerce", "33"),
		],
	);
	assert.equal(signals.length, 2);
});

test("a victim without a group label yields no signal", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01", null),
		[claim(2, "2026-06-01", "Qilin", "commerce", "33")],
	);
	assert.deepEqual(signals, []);
});

test("an empty sector never creates a sector signal", () => {
	const signals = priorGroupSignals(
		claim(1, "2026-07-01", "Qilin", null, "33"),
		[claim(2, "2026-06-01", "Qilin", null, "17")],
	);
	assert.deepEqual(signals, []);
});

test("a victim is counted once per scope even with several prior claims", () => {
	const victim = claim(1, "2026-07-01");
	const result = measureGroupSource("secteur", [victim], [
		claim(2, "2026-06-01"),
		claim(3, "2026-06-10"),
	]);
	assert.equal(result.victimsWithPriorSignal, 1);
	assert.equal(result.priorSignals, 2);
	assert.deepEqual(result.coveredOrgIds, [1]);
});

test("coverage summarises pairs and the union of covered victims", () => {
	const victim = claim(1, "2026-07-01");
	const summary = summariseGroupCoverage([
		measureGroupSource("secteur", [victim], [claim(2, "2026-06-01")]),
		measureGroupSource("departement", [victim], []),
	]);
	assert.equal(summary.pairs, 2);
	assert.equal(summary.priorSignalPairs, 1);
	assert.equal(summary.victimsWithAnyPriorSignal, 1);
	assert.equal(summary.coverage, 1);
});
