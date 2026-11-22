import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildCampaigns,
	buildForecastReport,
	mapSectorLabel,
	normalizeGroupName,
	type Claim,
	type DatasetCounts,
} from "../src/analyse/campaign-forecast.js";

const DATASET: DatasetCounts = {
	organizations: 1_673_151,
	sources: 312,
	events: 28_000,
	claims: 4,
	naClaims: 4,
};

function claim(group: string, publishedAt: string, claimSector: string | null = null): Claim {
	return { group, publishedAt, claimSector, orgSectorGroup: null };
}

test("group names are normalised before counting history", () => {
	assert.equal(normalizeGroupName("  The   Gentlemen "), "the gentlemen");
	assert.equal(normalizeGroupName("LÖckbit 3.0"), "lockbit 3 0");
});

test("leak-site sector labels map to the nine sector groups", () => {
	assert.equal(mapSectorLabel("Healthcare"), "sante");
	assert.equal(mapSectorLabel("Manufacturing"), "industrie");
	assert.equal(mapSectorLabel("Software"), "services");
	assert.equal(mapSectorLabel("Public sector"), "public");
	assert.equal(mapSectorLabel("unknown"), null);
	assert.equal(mapSectorLabel(null), null);
});

test("claims form bursts bounded by gap and total duration", () => {
	const campaigns = buildCampaigns([
		claim("alpha", "2026-01-01", "Healthcare"),
		claim("alpha", "2026-01-15", "Manufacturing"),
		claim("alpha", "2026-02-20", "Retail"),
		claim("alpha", "2026-03-10"),
	]);
	assert.equal(campaigns.length, 2);
	assert.deepEqual(campaigns.map((campaign) => campaign.start), ["2026-01-01", "2026-02-20"]);
	assert.deepEqual(campaigns.map((campaign) => campaign.end), ["2026-01-15", "2026-03-10"]);
	assert.deepEqual(campaigns.map((campaign) => campaign.sector), ["industrie", "commerce"]);
	assert.deepEqual(campaigns.map((campaign) => campaign.claims), [2, 2]);
});

test("the campaign sector falls back to the organisation sector group", () => {
	const campaigns = buildCampaigns([
		{ group: "alpha", publishedAt: "2026-01-01", claimSector: null, orgSectorGroup: "sante" },
		{ group: "alpha", publishedAt: "2026-01-05", claimSector: null, orgSectorGroup: "sante" },
		{ group: "alpha", publishedAt: "2026-02-10", claimSector: null, orgSectorGroup: null },
	]);
	assert.deepEqual(campaigns.map((campaign) => campaign.sector), ["sante", null]);
});

test("forecast uses the median gap and the most frequent past sector", () => {
	const report = buildForecastReport(
		[
			claim("alpha", "2026-01-01", "Software"),
			claim("alpha", "2026-01-31", "Software"),
			claim("alpha", "2026-03-02", "Healthcare"),
		],
		DATASET,
	);
	const forecast = report.groups[0];
	assert.equal(forecast?.group, "alpha");
	assert.equal(forecast?.sector, "services");
	assert.equal(forecast?.expectedGapDays, 30);
	assert.deepEqual(forecast?.period, { start: "2026-04-01", end: "2026-04-15" });
	assert.equal(forecast?.lastCampaignEnd, "2026-03-02");
});

test("each held-out campaign is scored for sector and period", () => {
	const report = buildForecastReport(
		[
			claim("alpha", "2026-01-01", "Software"),
			claim("alpha", "2026-02-01", "Software"),
			claim("alpha", "2026-03-03", "Software"),
			claim("alpha", "2026-07-01", "Healthcare"),
		],
		DATASET,
	);
	assert.equal(report.backtest.folds, 3);
	assert.equal(report.backtest.sectorHits, 2);
	assert.equal(report.backtest.periodHits, 2);
	assert.equal(report.backtest.medianErrorDays, 1);
	assert.deepEqual(report.backtest.byGroup[0], {
		group: "alpha", folds: 3, sectorHits: 2, periodHits: 2,
	});
});

test("a group needs three claims to be active and at most five are published", () => {
	const claims = ["a", "b", "c", "d", "e", "f"].flatMap((group) => [
		claim(group, "2026-01-01", "Software"),
		claim(group, "2026-02-01", "Software"),
		claim(group, "2026-03-01", "Software"),
	]);
	claims.push(claim("ghost", "2026-01-15", "Software"));
	claims.push(claim("ghost", "2026-02-15", "Software"));
	const report = buildForecastReport(claims, DATASET);
	assert.equal(report.activeGroups, 5);
	assert.deepEqual(report.groups.map((forecast) => forecast.group), ["a", "b", "c", "d", "e"]);
	assert.equal(report.dataset.naClaims, 4);
});
