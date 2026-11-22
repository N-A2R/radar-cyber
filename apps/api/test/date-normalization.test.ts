/**
 * One test per observable date-normalization behavior.
 * Pure functions: no database, no network, no victim data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	classifyDate,
	claimDateOf,
	isNAEvent,
	normalizeIsoDate,
	planDateNormalization,
} from "../src/dates/normalize.js";

test("ISO date with offset is normalized to UTC", () => {
	assert.equal(normalizeIsoDate("2026-11-09T10:00:00+02:00"), "2026-11-09T08:00:00.000Z");
});


test("PostgreSQL timestamptz text is normalized to ISO", () => {
	assert.equal(normalizeIsoDate("2026-11-09 10:00:00.123+00"), "2026-11-09T10:00:00.123Z");
	assert.equal(normalizeIsoDate("2026-11-09 10:00:00+00"), "2026-11-09T10:00:00.000Z");
	assert.equal(normalizeIsoDate("2026-11-09 10:00:00.123456+02"), "2026-11-09T08:00:00.123Z");
});
test("French numeric date is read day-first, not US month-first", () => {
	assert.equal(normalizeIsoDate("09/11/2026"), "2026-11-09T00:00:00.000Z");
});

test("impossible and unreadable dates are rejected without invention", () => {
	for (const raw of ["31/02/2026", "2026-02-30", "", "   ", "not a date", 42, {}, null, undefined]) {
		assert.equal(normalizeIsoDate(raw), null, `unexpected date for ${JSON.stringify(raw)}`);
	}
});

test("raw claim dates are read from either evidence key", () => {
	const iso = "2024-05-07T01:10:32.160Z";
	assert.equal(claimDateOf({ claimDate: iso }), iso);
	assert.equal(claimDateOf({ claimed_at: iso }), iso);
	assert.equal(claimDateOf({ claimed_at: "07/05/2024" }), "2024-05-07T00:00:00.000Z");
	assert.equal(claimDateOf(null), null);
});

test("feed date with explicit provenance counts as normalized", () => {
	const status = classifyDate({ observedAt: "2026-11-09T00:00:00Z", dateSource: "feed" });
	assert.deepEqual(status, {
		kind: "source-dated",
		date: "2026-11-09T00:00:00.000Z",
		normalized: true,
		reason: "source-date-with-provenance",
	});
});

test("inferred date with explicit provenance counts as normalized", () => {
	const status = classifyDate({ observedAt: "9 novembre 2026", dateSource: "inferred" });
	assert.equal(status.normalized, true);
	assert.equal(status.date, "2026-11-09T00:00:00.000Z");
});

test("collection fallback never counts as a normalized date", () => {
	const status = classifyDate({
		observedAt: "2026-11-21T12:00:00Z",
		collectedAt: "2026-11-21T12:00:00Z",
		dateSource: "fetched",
	});
	assert.equal(status.normalized, false);
	assert.equal(status.kind, "collection-fallback");
});

test("an ISO date without provenance is not yet normalized", () => {
	const status = classifyDate({ observedAt: "2026-11-09T00:00:00Z", dateSource: null });
	assert.equal(status.normalized, false);
	assert.equal(status.reason, "date-without-provenance");
});

test("a claim date without provenance is not yet normalized", () => {
	const status = classifyDate({ observedAt: "2026-11-21T12:00:00Z", evidence: { claimed_at: "2024-05-07" } });
	assert.equal(status.normalized, false);
	assert.equal(status.kind, "unlabeled-claim");
});

test("a claim date with provenance counts without rewriting observed_at", () => {
	const status = classifyDate({
		observedAt: "2026-11-21T12:00:00Z",
		dateSource: "claim",
		evidence: { claimDate: "2024-05-07T01:10:32.160Z", claimed_at: "2024-05-07T01:10:32.160Z" },
	});
	assert.equal(status.normalized, true);
	assert.equal(status.date, "2024-05-07T01:10:32.160Z");
});

test("NA scope accepts the regional flag and all NA departments only", () => {
	assert.equal(isNAEvent({ regional: true }), true);
	assert.equal(isNAEvent({ orgDept: "33" }), true);
	assert.equal(isNAEvent({ orgDept: "87" }), true);
	assert.equal(isNAEvent({ orgDept: "75", regional: false }), false);
	assert.equal(isNAEvent({ orgDept: null }), false);
});

test("a non-NA event is never modified", () => {
	assert.deepEqual(
		planDateNormalization({ orgDept: "75", observedAt: "2026-11-09", dateSource: null }),
		{ action: "none", reason: "out-of-scope" },
	);
});

test("unlabeled NA date gets provenance only, never a new date", () => {
	const plan = planDateNormalization({ regional: true, observedAt: "2026-11-09", dateSource: null });
	assert.deepEqual(plan, { action: "source", reason: "date-without-provenance" });
});

test("unlabeled NA claim gets an ISO claimDate and its own provenance", () => {
	const plan = planDateNormalization({
		regional: true,
		observedAt: "2026-11-21T12:00:00Z",
		evidence: { claimed_at: "07/05/2024" },
	});
	assert.deepEqual(plan, { action: "claim", claimDate: "2024-05-07T00:00:00.000Z", reason: "claim-date-without-provenance" });
});

test("an already normalized claim is left untouched", () => {
	const claimDate = "2024-05-07T01:10:32.160Z";
	const plan = planDateNormalization({
		regional: true,
		dateSource: "claim",
		evidence: { claimDate, claimed_at: claimDate },
	});
	assert.deepEqual(plan, { action: "none", reason: "already-normalized-claim" });
});

test("a claim without any date produces no invented date", () => {
	const plan = planDateNormalization({ regional: true, dateSource: "claim", evidence: {} });
	assert.deepEqual(plan, { action: "none", reason: "claim-date-missing" });
});

test("collection fallback in NA is left as-is", () => {
	const plan = planDateNormalization({ regional: true, dateSource: "fetched", observedAt: "2026-11-21T12:00:00Z" });
	assert.deepEqual(plan, { action: "none", reason: "no-safe-normalization" });
});
