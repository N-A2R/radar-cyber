/**
 * Annual cybercrime cost estimate — one behaviour per test.
 * Pure estimator only: no database, no network, no victim data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	awardedAmounts,
	bootstrapEstimate,
	checkBaseline,
	detectionSample,
	estimateIncidentCount,
	inWindow,
	isNADepartment,
	median,
	type CostNotice,
	type CoverageIncident,
} from "../src/cost/cybercrime-cost.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const rows = (...motifs: string[]): CoverageIncident[] =>
	motifs.map((motif, index) => ({ datePublique: "2026-04-10", motif: motif || `other-${index}` }));

const notice = (overrides: Partial<CostNotice> = {}): CostNotice => ({
	id: "test",
	date: "2026-04-10",
	departments: ["33"],
	amountEur: 1000,
	amountKind: "awarded",
	nature: "ATTRIBUTION",
	...overrides,
});

test("only the twelve Nouvelle-Aquitaine departments are in scope", () => {
	assert.equal(isNADepartment("16"), true);
	assert.equal(isNADepartment("87"), true);
	assert.equal(isNADepartment("75"), false);
	assert.equal(isNADepartment("92"), false);
});

test("the fixed twelve-month window includes both endpoints only", () => {
	assert.equal(inWindow("2025-10-31"), false);
	assert.equal(inWindow("2025-11-01"), true);
	assert.equal(inWindow("2026-10-31"), true);
	assert.equal(inWindow("2026-11-01"), false);
	assert.equal(inWindow("2026-11-22"), false);
});

test("radar recall is measured from matched corpus incidents", () => {
	assert.deepEqual(detectionSample(rows("vu", "vu", "pas_rattache")), {
		total: 3,
		seen: 2,
		rate: 2 / 3,
	});
	assert.throws(() => detectionSample([]), /empty/);
});

test("incident count is corrected for measured under-detection", () => {
	assert.ok(Math.abs(estimateIncidentCount({ total: 42, seen: 31 }) - 42 * 42 / 31) < 1e-9);
	assert.throws(() => estimateIncidentCount({ total: 42, seen: 0 }), /no matched/);
});

test("unit cost uses awarded contract amounts only", () => {
	const notices = [
		notice({ id: "awarded", amountEur: 60000, amountKind: "awarded" }),
		notice({ id: "estimate", amountEur: 900000, amountKind: "estimated" }),
		notice({ id: "outside", amountEur: 1000, amountKind: "awarded", departments: ["75"] }),
		notice({ id: "late", amountEur: 2000, amountKind: "awarded", date: "2026-11-17" }),
	];
	assert.deepEqual(awardedAmounts(notices), [60000]);
});

test("median resists an extreme contract amount", () => {
	assert.equal(median([100, 200, 10000]), 200);
	assert.equal(median([100, 200, 300, 400]), 250);
});

test("bootstrap interval is deterministic and brackets the point estimate", () => {
	const sample = rows(...Array.from({ length: 42 }, (_, i) => (i < 31 ? "vu" : "pas_rattache")));
	const costs = [43189.09, 60000, 62844, 123440].map((amountEur) => notice({ amountEur }));
	const first = bootstrapEstimate(sample, costs, 300, 42);
	const second = bootstrapEstimate(sample, costs, 300, 42);
	assert.deepEqual(first, second);
	assert.ok(first.ci95LowEur <= first.annualCostEur);
	assert.ok(first.annualCostEur <= first.ci95HighEur);
	assert.equal(first.seed, 42);
	assert.equal(first.iterations, 300);
});

test("baseline drift is reported explicitly", () => {
	const expected = {
		organizations: 1_673_151,
		sources: 312,
		events: 26_259,
		naOrganizations: 1_671_907,
	};
	assert.deepEqual(checkBaseline(expected), []);
	assert.match(checkBaseline({ ...expected, sources: 311 })[0], /sources/);
});

test("the versioned real inputs give 42 known incidents and 31 matches", () => {
	const coverage = JSON.parse(
		readFileSync(`${ROOT}bench/results/couverture-2026-11-21.json`, "utf8"),
	) as { incidents: CoverageIncident[] };
	const contracts = JSON.parse(
		readFileSync(`${ROOT}bench/fixtures/cyber-cost-anchors.json`, "utf8"),
	) as { notices: CostNotice[] };
	const sample = detectionSample(coverage.incidents.filter((row) => inWindow(row.datePublique)));
	assert.equal(sample.total, 42);
	assert.equal(sample.seen, 31);
	assert.deepEqual(awardedAmounts(contracts.notices), [43189.09, 123440, 62844, 60000]);
});
