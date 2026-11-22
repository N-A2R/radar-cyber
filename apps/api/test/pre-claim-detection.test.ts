import { test } from "node:test";
import assert from "node:assert/strict";
import {
	detectPreClaim,
	leadDays,
	normaliseKey,
	objectiveStatement,
	summariseDetections,
	type Claim,
	type EarlySignal,
} from "../src/analyse/pre-claim-detection.js";

const CLAIM_AT = "2026-11-20T12:00:00.000Z";

function claim(overrides: Partial<Claim> = {}): Claim {
	return {
		id: 1,
		orgId: 100,
		sourceId: "ransomlook",
		victim: "Hôpital de Niort",
		group: "LockBit 3.0",
		publishedAt: CLAIM_AT,
		regional: true,
		department: "79",
		...overrides,
	};
}

function signal(overrides: Partial<EarlySignal> = {}): EarlySignal {
	return {
		id: 500,
		origin: "quarantine",
		sourceId: "ransomwatch",
		victim: "Hopital de Niort",
		group: "",
		publishedAt: "2026-11-18T12:00:00.000Z",
		gray: true,
		...overrides,
	};
}

/**
 * One behaviour per test. The detector is a pure function of dated inputs; no
 * database, clock or network participates in these checks.
 */

test("normalisation ignores accents, case and punctuation", () => {
	assert.equal(normaliseKey("  Hôpital de Niort ! "), "hopitaldeniort");
});

test("normalisation rejects missing or unusable values", () => {
	assert.equal(normaliseKey(null), "");
	assert.equal(normaliseKey("--"), "");
});

test("lead days are fractional and rounded to two decimals", () => {
	assert.equal(leadDays("2026-11-19T12:00:00.000Z", CLAIM_AT), 1);
	assert.equal(leadDays("2026-11-19T18:00:00.000Z", CLAIM_AT), 0.75);
});

test("a claim outside Nouvelle-Aquitaine is never detected", () => {
	const result = detectPreClaim([claim({ department: "75" })], [signal()]);
	assert.equal(result.length, 0);
});

test("an unknown department is never detected", () => {
	const result = detectPreClaim([claim({ department: null })], [signal()]);
	assert.equal(result.length, 0);
});

test("an undated claim is never detected", () => {
	const result = detectPreClaim([claim({ publishedAt: "" })], [signal()]);
	assert.equal(result.length, 0);
});

test("a signal later than the claim does not count", () => {
	const late = signal({ publishedAt: "2026-11-21T12:00:00.000Z" });
	assert.equal(detectPreClaim([claim()], [late]).length, 0);
});

test("a signal at the same instant as the claim does not count", () => {
	assert.equal(detectPreClaim([claim()], [signal({ publishedAt: CLAIM_AT })]).length, 0);
});

test("a signal older than the lead window does not count", () => {
	const old = signal({ publishedAt: "2026-10-01T12:00:00.000Z" });
	assert.equal(detectPreClaim([claim()], [old], 30).length, 0);
});

test("a gray raw listing detects the same entity", () => {
	const result = detectPreClaim([claim()], [signal()]);
	assert.equal(result.length, 1);
	assert.deepEqual(
		{ kind: result[0]?.kind, lead: result[0]?.leadDays, source: result[0]?.sourceId },
		{ kind: "entity", lead: 2, source: "ransomwatch" },
	);
});

test("a short entity key cannot identify a victim", () => {
	assert.equal(detectPreClaim([claim({ victim: "AB" })], [signal({ victim: "AB" })]).length, 0);
});

test("a prior claim by the same group detects an incident", () => {
	const prior = signal({ origin: "claim", id: 9, victim: "Autre victime", group: "LockBit 3.0" });
	const result = detectPreClaim([claim()], [prior]);
	assert.equal(result.length, 1);
	assert.equal(result[0]?.kind, "group");
});

test("the claim itself is not its own early signal", () => {
	const same = signal({ origin: "claim", id: 1, victim: "Hôpital de Niort", group: "LockBit 3.0" });
	assert.equal(detectPreClaim([claim()], [same]).length, 0);
});

test("a different group does not detect the incident", () => {
	const other = signal({ origin: "claim", id: 9, victim: "Autre victime", group: "BlackCat" });
	assert.equal(detectPreClaim([claim()], [other]).length, 0);
});

test("the earliest admissible signal wins", () => {
	const older = signal({ publishedAt: "2026-11-15T12:00:00.000Z", group: "LockBit 3.0" });
	const newer = signal({ publishedAt: "2026-11-19T12:00:00.000Z" });
	const result = detectPreClaim([claim()], [newer, older]);
	assert.equal(result.length, 1);
	assert.equal(result[0]?.detectedAt, older.publishedAt);
	assert.equal(result[0]?.leadDays, 5);
});

test("detections carry no victim name or free text", () => {
	const result = detectPreClaim([claim()], [signal()]);
	assert.deepEqual(Object.keys(result[0] ?? {}).sort(), [
		"claimAt",
		"claimId",
		"department",
		"detectedAt",
		"entityDetectedAt",
		"groupDetectedAt",
		"kind",
		"leadDays",
		"orgId",
		"sourceId",
	]);
});

test("entity and group signals are counted even when they overlap", () => {
	const groupSignal = signal({ origin: "claim", id: 9, victim: "Autre victime", group: "LockBit 3.0", publishedAt: "2026-11-15T12:00:00.000Z" });
	const result = detectPreClaim([claim()], [signal(), groupSignal]);
	const summary = summariseDetections(result);
	assert.equal(summary.detected, 1);
	assert.equal(summary.entitySignals, 1);
	assert.equal(summary.groupSignals, 1);
});

test("the summary reports counts and median lead", () => {
	const detections = detectPreClaim(
		[claim({ id: 1, group: "Cactus" }), claim({ id: 2, victim: "Autre victime", group: "LockBit 3.0" })],
		[
			signal({ id: 10, victim: "Hôpital de Niort", group: "", publishedAt: "2026-11-19T12:00:00.000Z" }),
			signal({ id: 11, origin: "claim", victim: "X", group: "LockBit 3.0", publishedAt: "2026-11-17T12:00:00.000Z" }),
		],
	);
	const summary = summariseDetections(detections);
	assert.equal(summary.detected, 2);
	assert.equal(summary.medianLeadDays, 2);
	assert.equal(summary.totalLeadDays, 4);
});

test("an empty detection set has a zeroed summary", () => {
	const summary = summariseDetections([]);
	assert.equal(summary.detected, 0);
	assert.equal(summary.medianLeadDays, 0);
	assert.equal(summary.totalLeadDays, 0);
});

test("the lead window must be positive", () => {
	assert.throws(() => detectPreClaim([claim()], [signal()], 0), RangeError);
});
test("an attained objective is declared with its measured count", () => {
	assert.equal(objectiveStatement(71, 10), "OBJECTIF : atteint — 71 / 10");
});

test("a partial objective declares what remains", () => {
	assert.equal(objectiveStatement(7, 10), "OBJECTIF : partiel — 7 / 10, manque 3");
});
