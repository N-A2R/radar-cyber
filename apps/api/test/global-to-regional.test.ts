/**
 * One test per observable behaviour of global-to-regional early warning.
 * All tests are pure: no database, no network, no victim data.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	computePropagation,
	selectPastCampaigns,
	summarizePropagations,
	type CampaignIncident,
	type CampaignPropagation,
	type CampaignTimeline,
} from "../src/early-warning/global-to-regional.js";

function incident(id: number, observedAt: string, isRegional = false): CampaignIncident {
	return { id, observedAt, sourceId: "public-feed", isRegional };
}

function timeline(incidents: CampaignIncident[], key = "cmp:1"): CampaignTimeline {
	return { key, label: "group", incidents };
}

function propagation(key: string, detectionAt: string, regionalFirstAt: string, hours: number): CampaignPropagation {
	return {
		key,
		label: key,
		globalFirstAt: detectionAt,
		detectionAt,
		regionalFirstAt,
		incidentCount: 2,
		regionalIncidentCount: 1,
		propagationHours: hours,
		warningLeadHours: hours,
	};
}

test("computes the delay from the first worldwide observation to the first NA observation", () => {
	const result = computePropagation(
		timeline([
			incident(1, "2026-11-10T10:00:00.000Z"),
			incident(2, "2026-11-13T10:00:00.000Z"),
			incident(3, "2026-11-17T16:00:00.000Z", true),
		]),
	);
	assert.equal(result?.propagationHours, 174);
	assert.equal(result?.globalFirstAt, "2026-11-10T10:00:00.000Z");
	assert.equal(result?.regionalFirstAt, "2026-11-17T16:00:00.000Z");
});

test("ignores non-NA incidents when locating the regional arrival", () => {
	const result = computePropagation(
		timeline([
			incident(1, "2026-11-10T10:00:00.000Z"),
			incident(2, "2026-11-20T10:00:00.000Z"),
			incident(3, "2026-11-21T10:00:00.000Z", true),
			incident(4, "2026-11-22T10:00:00.000Z", true),
		]),
	);
	assert.equal(result?.regionalFirstAt, "2026-11-21T10:00:00.000Z");
	assert.equal(result?.regionalIncidentCount, 2);
});

test("ignores incidents with an invalid observation time", () => {
	const result = computePropagation(
		timeline([
			incident(1, "not-a-date"),
			incident(2, "2026-11-10T10:00:00.000Z"),
			incident(3, "2026-11-13T10:00:00.000Z"),
			incident(4, "2026-11-15T10:00:00.000Z", true),
		]),
	);
	assert.equal(result?.globalFirstAt, "2026-11-10T10:00:00.000Z");
	assert.equal(result?.incidentCount, 3);
});

test("returns no propagation when the campaign never reached NA", () => {
	const result = computePropagation(
		timeline([
			incident(1, "2026-11-10T10:00:00.000Z"),
			incident(2, "2026-11-13T10:00:00.000Z"),
		]),
	);
	assert.equal(result, null);
});

test("returns no propagation for a single observation", () => {
	const result = computePropagation(timeline([incident(1, "2026-11-10T10:00:00.000Z", true)]));
	assert.equal(result, null);
});

test("measures the warning lead from the second incident, when the campaign becomes identifiable", () => {
	const result = computePropagation(
		timeline([
			incident(1, "2026-11-10T10:00:00.000Z"),
			incident(2, "2026-11-11T10:00:00.000Z"),
			incident(3, "2026-11-17T10:00:00.000Z", true),
		]),
	);
	assert.equal(result?.detectionAt, "2026-11-11T10:00:00.000Z");
	assert.equal(result?.warningLeadHours, 144);
});

test("reports no warning lead when the NA arrival precedes detection", () => {
	const result = computePropagation(
		timeline([
			incident(1, "2026-11-10T10:00:00.000Z", true),
			incident(2, "2026-11-13T10:00:00.000Z"),
			incident(3, "2026-11-15T10:00:00.000Z", true),
		]),
	);
	assert.equal(result?.propagationHours, 0);
	assert.equal(result?.warningLeadHours, 0);
});

test("selects only the most recent campaigns whose NA arrival is already past", () => {
	const selected = selectPastCampaigns(
		[
			propagation("old", "2026-11-01T00:00:00.000Z", "2026-11-05T00:00:00.000Z", 96),
			propagation("recent", "2026-11-10T00:00:00.000Z", "2026-11-12T00:00:00.000Z", 48),
			propagation("future", "2026-11-20T00:00:00.000Z", "2026-11-30T00:00:00.000Z", 240),
		],
		2,
		new Date("2026-11-22T00:00:00.000Z"),
	);
	assert.deepEqual(
		selected.map((item) => item.key),
		["recent", "old"],
	);
});

test("summarizes median propagation and warning lead over an even number of campaigns", () => {
	const summary = summarizePropagations([
		propagation("a", "2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z", 24),
		propagation("b", "2026-11-01T00:00:00.000Z", "2026-11-03T00:00:00.000Z", 48),
		propagation("c", "2026-11-01T00:00:00.000Z", "2026-11-05T00:00:00.000Z", 96),
		propagation("d", "2026-11-01T00:00:00.000Z", "2026-11-09T00:00:00.000Z", 192),
	]);
	assert.equal(summary.campaigns, 4);
	assert.equal(summary.medianPropagationHours, 72);
	assert.equal(summary.medianWarningLeadHours, 72);
	assert.equal(summary.minPropagationHours, 24);
	assert.equal(summary.maxPropagationHours, 192);
});

test("returns an empty summary when no campaign qualifies", () => {
	assert.deepEqual(summarizePropagations([]), {
		campaigns: 0,
		medianPropagationHours: 0,
		medianWarningLeadHours: 0,
		minPropagationHours: 0,
		maxPropagationHours: 0,
	});
});
