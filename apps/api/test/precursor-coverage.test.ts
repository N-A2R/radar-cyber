/**
 * One behaviour per test for the pre-claim signal audit.
 * Fixtures are organisation-level only: no names or personal details.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	countPriorSignals,
	measureSource,
	summariseCoverage,
	type SignalRecord,
	type SourceCoverage,
	type VictimRecord,
} from "../src/prediction/precursor-coverage.js";

function signal(orgId: number, observedAt: string): SignalRecord {
	return { orgId, observedAt };
}

function victim(orgId: number, claimedAt: string): VictimRecord {
	return { orgId, claimedAt };
}

function source(name: string, coveredOrgIds: number[], victims = 2): SourceCoverage {
	return {
		source: name,
		victims,
		pairs: victims,
		victimsWithPriorSignal: coveredOrgIds.length,
		priorSignals: coveredOrgIds.length,
		coveredOrgIds,
	};
}

test("a signal on the claim day is not a precursor", () => {
	const signals = [signal(1, "2026-06-01"), signal(1, "2026-05-31")];
	assert.equal(countPriorSignals(1, "2026-06-01", signals), 1);
});

test("signals belonging to another organisation are ignored", () => {
	const signals = [signal(2, "2026-05-01"), signal(2, "2026-05-02")];
	assert.equal(countPriorSignals(1, "2026-06-01", signals), 0);
});

test("repeated signals count one victim once per source", () => {
	const victims = [victim(1, "2026-06-01")];
	const signals = [signal(1, "2026-05-01"), signal(1, "2026-05-02"), signal(1, "2026-05-03")];
	const result = measureSource("event", victims, signals);
	assert.equal(result.victimsWithPriorSignal, 1);
	assert.equal(result.priorSignals, 3);
	assert.deepEqual(result.coveredOrgIds, [1]);
});

test("a repeated victim row is audited only once", () => {
	const victims = [victim(1, "2026-06-01"), victim(1, "2026-06-01")];
	const result = measureSource("alert", victims, [signal(1, "2026-05-01")]);
	assert.equal(result.pairs, 1);
	assert.equal(result.victimsWithPriorSignal, 1);
});

test("coverage unions victims across sources and micro-averages pairs", () => {
	const result = summariseCoverage([source("event", [1]), source("alert", [2])]);
	assert.equal(result.victims, 2);
	assert.equal(result.pairs, 4);
	assert.equal(result.priorSignalPairs, 2);
	assert.equal(result.victimsWithAnyPriorSignal, 2);
	assert.equal(result.coverage, 1);
});

test("sources are reported in deterministic order without internal ids", () => {
	const result = summariseCoverage([source("z", []), source("a", [])]);
	assert.deepEqual(
		result.perSource.map((row) => row.source),
		["a", "z"],
	);
	assert.equal("coveredOrgIds" in result.perSource[0]!, false);
});

test("an empty audit reports zero coverage instead of NaN", () => {
	const result = summariseCoverage([]);
	assert.equal(result.pairs, 0);
	assert.equal(result.coverage, 0);
});
