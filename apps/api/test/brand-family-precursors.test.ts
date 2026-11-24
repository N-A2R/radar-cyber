/**
 * One behaviour per test for brand-family precursor attachment.
 * Fixtures are organisation-level only: no claim description or personal detail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	brandFamilyBonus,
	brandKeyFromClaim,
	attachBrandFamilyClaims,
	measureBrandFamilySource,
	type BrandClaim,
	type BrandOrganization,
} from "../src/prediction/brand-family-precursors.js";
import type { SignalRecord } from "../src/prediction/precursor-coverage.js";

function claim(victim: string, orgId: number | null = null, publishedAt = "2026-05-04"): BrandClaim {
	return { claimId: 1, orgId, victim, publishedAt };
}

function org(orgId: number, name: string, aliases: readonly string[] = []): BrandOrganization {
	return { orgId, name, aliases };
}

test("a longer claim name yields its two-token brand key", () => {
	assert.equal(brandKeyFromClaim("Johnson & Johnson Innovative Medicine"), "johnson johnson");
});

test("a brand with a short token is not a usable key", () => {
	assert.equal(brandKeyFromClaim("Be Media Group France"), null);
});

test("a two-token claim name cannot create a brand signal", () => {
	assert.equal(brandKeyFromClaim("Johnson & Johnson"), null);
});

test("a claim attaches to the single organisation sharing the brand", () => {
	const result = attachBrandFamilyClaims(
		[claim("Johnson & Johnson Innovative Medicine")],
		[org(688670, "JOHNSON  & JOHNSON")],
	);
	assert.deepEqual(result.attachments, [{ orgId: 688670, observedAt: "2026-05-04" }]);
});

test("a brand shared by two organisations is skipped", () => {
	const result = attachBrandFamilyClaims(
		[claim("Great Lakes International Trading")],
		[org(1, "GREAT LAKES"), org(2, "Great Lakes Conseil")],
	);
	assert.equal(result.attachments.length, 0);
	assert.equal(result.ambiguous, 1);
});

test("a claim on the organisation itself is not a precursor", () => {
	const result = attachBrandFamilyClaims(
		[claim("Johnson & Johnson Innovative Medicine", 688670)],
		[org(688670, "JOHNSON  & JOHNSON")],
	);
	assert.equal(result.attachments.length, 0);
	assert.equal(result.unmatched, 1);
});

test("a signal on the claim day is not counted as prior", () => {
	const signals: SignalRecord[] = [
		{ orgId: 688670, observedAt: "2026-08-11" },
		{ orgId: 688670, observedAt: "2026-08-12" },
	];
	const coverage = measureBrandFamilySource(
		[{ orgId: 688670, claimedAt: "2026-08-12" }],
		signals,
	);
	assert.equal(coverage.priorSignals, 1);
});

test("the injected bonus is capped at two prior claims", () => {
	const signals: SignalRecord[] = [
		{ orgId: 688670, observedAt: "2026-05-04" },
		{ orgId: 688670, observedAt: "2026-06-04" },
		{ orgId: 688670, observedAt: "2026-07-04" },
	];
	assert.equal(brandFamilyBonus(688670, signals), 200);
});
