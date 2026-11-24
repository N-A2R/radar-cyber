/**
 * One behaviour per test for the as-of NAF2 pressure audit.
 * Fixtures are organisation ids, NAF codes and dates only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	nafKey,
	nafKeysByOrg,
	nafPressureAtCutoff,
	nafPressureBonus,
	nafPressureForOrg,
	type NafClaim,
	type NafOrg,
} from "../src/prediction/naf-precursors.js";

const ORGS: readonly NafOrg[] = [
	{ orgId: 1, naf: "6201Z" },
	{ orgId: 2, naf: "62.02A" },
	{ orgId: 3, naf: "4711F" },
	{ orgId: 4, naf: null },
];
const KEYS = nafKeysByOrg(ORGS);

test("NAF keys use the exact normalised two-character prefix", () => {
	assert.equal(nafKey(" 62.01z "), "62");
	assert.equal(nafKey("a1b2"), "A1");
	assert.equal(nafKey(null), null);
	assert.equal(nafKey("?"), null);
});

test("a claim published on the cutoff day is never a precursor", () => {
	const pressure = nafPressureAtCutoff(
		[{ orgId: 2, publishedAt: "2026-07-01" }],
		KEYS,
		"2026-07-01",
		30,
	);
	assert.equal(pressure.size, 0);
});

test("a claim outside the lookback is not counted", () => {
	const pressure = nafPressureAtCutoff(
		[{ orgId: 2, publishedAt: "2026-05-01" }],
		KEYS,
		"2026-07-01",
		30,
	);
	assert.equal(pressure.size, 0);
});

test("repeated rows for one organisation and day count once", () => {
	const pressure = nafPressureAtCutoff(
		[
			{ orgId: 2, publishedAt: "2026-06-10" },
			{ orgId: 2, publishedAt: "2026-06-10" },
		],
		KEYS,
		"2026-07-01",
		30,
	);
	assert.equal(pressure.get("62")?.claims, 1);
});

test("the bonus counts only other organisations with the same NAF2 key", () => {
	const claims: readonly NafClaim[] = [
		{ orgId: 1, publishedAt: "2026-06-10" },
		{ orgId: 2, publishedAt: "2026-06-11" },
		{ orgId: 3, publishedAt: "2026-06-12" },
		{ orgId: 99, publishedAt: "2026-06-13" },
	];
	const pressure = nafPressureAtCutoff(claims, KEYS, "2026-07-01", 30);
	assert.equal(pressure.get("62")?.claims, 2);
	assert.equal(nafPressureForOrg(1, KEYS, pressure), 1);
	assert.equal(nafPressureBonus(1, KEYS, pressure), 30);
	assert.equal(nafPressureForOrg(3, KEYS, pressure), 0);
});

test("the bonus is capped at three prior claims", () => {
	const claims: readonly NafClaim[] = [2, 5, 6, 7, 8].map((orgId) => ({
		orgId,
		publishedAt: "2026-06-10",
	}));
	const keys = nafKeysByOrg([
		...ORGS,
		{ orgId: 5, naf: "6203Z" },
		{ orgId: 6, naf: "6204Z" },
		{ orgId: 7, naf: "6205Z" },
		{ orgId: 8, naf: "6206Z" },
	]);
	const pressure = nafPressureAtCutoff(claims, keys, "2026-07-01", 30);
	assert.equal(nafPressureForOrg(1, keys, pressure), 5);
	assert.equal(nafPressureBonus(1, keys, pressure), 90);
});

test("an organisation without a NAF code gets no bonus", () => {
	const pressure = nafPressureAtCutoff(
		[{ orgId: 2, publishedAt: "2026-06-10" }],
		KEYS,
		"2026-07-01",
		30,
	);
	assert.equal(nafPressureForOrg(4, KEYS, pressure), 0);
	assert.equal(nafPressureBonus(4, KEYS, pressure), 0);
});
