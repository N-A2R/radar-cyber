/**
 * BGP prefix hijack detection: one test per behaviour.
 *
 * The historical fixture is versioned and offline. Its announcements were
 * observed on RIPEstat; the single replay event is a documented attack pattern
 * injected into that baseline for validation, not an observed incident.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	detectPrefixHijacks,
	parsePrefix,
	prefixContains,
	personalDataFindings,
	type BgpAnnouncement,
	type BgpOperator,
} from "../src/bgp/hijack.js";

const OPERATORS: BgpOperator[] = [
	{
		asn: 198551,
		name: "REZOCEAN SAS",
		region: "NA",
		prefixes: ["185.218.32.0/22"],
	},
	{
		asn: 208458,
		name: "Region Nouvelle-Aquitaine",
		region: "NA",
		prefixes: ["149.232.243.0/24"],
	},
];

function announcement(
	prefix: string,
	originAs: number | null,
	overrides: Partial<BgpAnnouncement> = {},
): BgpAnnouncement {
	return {
		timestamp: "2026-11-21T10:30:00Z",
		prefix,
		originAs,
		type: "A",
		peer: "24-200.40.162.202",
		...overrides,
	};
}

test("parsePrefix accepts IPv4 and IPv6 CIDR and rejects malformed prefixes", () => {
	const v4 = parsePrefix("185.218.32.0/22");
	const v6 = parsePrefix("2a00:dfc0::/29");
	assert.ok(v4);
	assert.ok(v6);
	assert.equal(v4.version, 4);
	assert.equal(v4.bits, 22);
	assert.equal(v6.version, 6);
	assert.equal(v6.bits, 29);
	assert.equal(parsePrefix("185.218.32.0/33"), null);
	assert.equal(parsePrefix("185.218.32.0"), null);
	assert.equal(parsePrefix("2001:db8::1::/48"), null);
	assert.equal(parsePrefix("300.1.1.0/24"), null);
});

test("prefixContains compares prefixes of the same address family only", () => {
	const parent = parsePrefix("185.218.32.0/22");
	const child = parsePrefix("185.218.33.0/24");
	const sibling = parsePrefix("185.218.36.0/24");
	assert.ok(parent && child && sibling);
	assert.equal(prefixContains(parent, child), true);
	assert.equal(prefixContains(parent, sibling), false);
	assert.equal(prefixContains(child, parent), false);
	const v6 = parsePrefix("2a00:dfc0::/29");
	assert.ok(v6);
	assert.equal(prefixContains(parent, v6), false);
});

test("a legitimate announcement raises no alert", () => {
	const alerts = detectPrefixHijacks(
		[announcement("185.218.32.0/22", 198551)],
		OPERATORS,
	);
	assert.deepEqual(alerts, []);
});

test("an unexpected origin for the exact prefix raises an origin-change alert", () => {
	const alerts = detectPrefixHijacks(
		[announcement("149.232.243.0/24", 64496, { peer: "15-187.16.216.209" })],
		OPERATORS,
	);
	assert.equal(alerts.length, 1);
	assert.deepEqual(
		{
			kind: alerts[0].kind,
			operator: alerts[0].operator,
			expectedAs: alerts[0].expectedAs,
			observedAs: alerts[0].observedAs,
			parentPrefix: alerts[0].parentPrefix,
		},
		{
			kind: "origin-change",
			operator: "Region Nouvelle-Aquitaine",
			expectedAs: 208458,
			observedAs: 64496,
			parentPrefix: "149.232.243.0/24",
		},
	);
});

test("an unexpected origin for a more-specific prefix raises a more-specific alert", () => {
	const alerts = detectPrefixHijacks(
		[announcement("185.218.33.0/24", 64496)],
		OPERATORS,
	);
	assert.equal(alerts.length, 1);
	assert.equal(alerts[0].kind, "more-specific");
	assert.equal(alerts[0].parentPrefix, "185.218.32.0/22");
	assert.equal(alerts[0].operator, "REZOCEAN SAS");
});

test("a more-specific announced by the legitimate operator raises no alert", () => {
	const alerts = detectPrefixHijacks(
		[announcement("185.218.33.0/24", 198551)],
		OPERATORS,
	);
	assert.deepEqual(alerts, []);
});

test("prefixes outside Nouvelle-Aquitaine are out of scope", () => {
	const outside: BgpOperator[] = [
		{ asn: 65001, name: "Outside Operator", region: "OK", prefixes: ["203.0.113.0/24"] },
	];
	const seen = [announcement("203.0.113.0/24", 65002)];
	assert.deepEqual(detectPrefixHijacks(seen, outside), []);
	assert.equal(detectPrefixHijacks(seen, outside, { region: "OK" }).length, 1);
});

test("withdrawals are ignored", () => {
	const alerts = detectPrefixHijacks(
		[announcement("185.218.32.0/22", 64496, { type: "W" })],
		OPERATORS,
	);
	assert.deepEqual(alerts, []);
});

test("duplicate announcements collapse into a single alert", () => {
	const alerts = detectPrefixHijacks(
		[
			announcement("185.218.33.0/24", 64496, { timestamp: "2026-11-21T10:30:00Z" }),
			announcement("185.218.33.0/24", 64496, { timestamp: "2026-11-21T10:31:00Z" }),
		],
		OPERATORS,
	);
	assert.equal(alerts.length, 1);
	assert.equal(alerts[0].timestamp, "2026-11-21T10:30:00Z");
});

test("explicitly allowed origins are ignored", () => {
	const alerts = detectPrefixHijacks(
		[announcement("185.218.33.0/24", 64496)],
		OPERATORS,
		{ allowedOrigins: [64496] },
	);
	assert.deepEqual(alerts, []);
});

type HistoricalFixture = {
	operators: BgpOperator[];
	announcements: BgpAnnouncement[];
	replay: BgpAnnouncement[];
};

test("historical replay detects the injected hijack with no false positive", () => {
	const path = fileURLToPath(
		new URL("../../../bench/fixtures/bgp-na-historical.json", import.meta.url),
	);
	const fixture = JSON.parse(readFileSync(path, "utf8")) as HistoricalFixture;
	const alerts = detectPrefixHijacks(
		[...fixture.announcements, ...fixture.replay],
		fixture.operators,
	);
	assert.equal(fixture.announcements.length, 346);
	const replayAlerts = alerts.filter((alert) => alert.source === "documented-replay");
	const falsePositives = alerts.filter((alert) => alert.source !== "documented-replay");
	assert.equal(replayAlerts.length, 1);
	assert.deepEqual(falsePositives, []);
	assert.equal(replayAlerts[0].prefix, "185.218.32.0/23");
	assert.equal(replayAlerts[0].parentPrefix, "185.218.32.0/22");
	assert.equal(replayAlerts[0].operator, "REZOCEAN SAS");
});

test("alert payloads contain no personal data", () => {
	const alerts = detectPrefixHijacks(
		[announcement("185.218.33.0/24", 64496, { peer: "contact@example.test" })],
		OPERATORS,
	);
	assert.deepEqual(personalDataFindings(alerts), ["email"]);
	assert.deepEqual(
		personalDataFindings(detectPrefixHijacks([announcement("185.218.33.0/24", 64496)], OPERATORS)),
		[],
	);
});
