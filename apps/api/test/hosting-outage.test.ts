/**
 * One behavior per test for the hosting-outage simulation. The inputs are
 * synthetic: no database, network or personal data is involved.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DnsProvider } from "../src/dns/historique.js";
import {
	HOSTING_CATALOGUE,
	MAX_OUTAGE_SIZE,
	simulateHostingOutage,
	type HostingObservation,
} from "../src/analyse/hosting-outage.js";

const CATALOGUE: readonly DnsProvider[] = [
	{ suffix: "host.test", name: "Host A", category: "dns", mode: "suffix" },
	{ suffix: "eu.host.test", name: "Host B", category: "dns", mode: "suffix" },
	{ suffix: "mail.test", name: "Mail A", category: "mail", mode: "suffix" },
];

function observation(
	domain: string,
	organizationIds: readonly number[],
	nameServers: readonly string[] = [],
	mailExchangers: readonly string[] = [],
): HostingObservation {
	return { domain, organizationIds, nameServers, mailExchangers };
}

test("attributes a name server to the longest matching public suffix", () => {
	const result = simulateHostingOutage(
		[observation("a.fr", [1], ["ns1.eu.host.test"])],
		5,
		CATALOGUE,
	);
	assert.deepEqual(result.providers, [{ name: "Host B", organizations: 1, domains: 1 }]);
	assert.equal(result.unknownHosts, 0);
});

test("attributes a mail exchanger through the mail category", () => {
	const result = simulateHostingOutage(
		[observation("b.fr", [1], [], ["mx.mail.test"])],
		5,
		CATALOGUE,
	);
	assert.deepEqual(result.providers, [{ name: "Mail A", organizations: 1, domains: 1 }]);
});

test("ignores a name server whose suffix belongs only to the mail category", () => {
	const result = simulateHostingOutage(
		[observation("c.fr", [1], ["mx.mail.test"])],
		5,
		CATALOGUE,
	);
	assert.deepEqual(result.providers, []);
	assert.equal(result.unknownHosts, 1);
});

test("counts one organization once for a provider with several domains", () => {
	const result = simulateHostingOutage(
		[
			observation("d1.fr", [1, 2], ["ns1.host.test"]),
			observation("d2.fr", [1, 2], ["ns2.host.test"]),
		],
		5,
		CATALOGUE,
	);
	assert.deepEqual(result.providers, [{ name: "Host A", organizations: 2, domains: 2 }]);
	assert.equal(result.organizationsAffected, 2);
});

test("ranks providers by distinct organizations with a name tie-break", () => {
	const result = simulateHostingOutage(
		[
			observation("e1.fr", [1, 2], ["ns1.host.test"]),
			observation("e2.fr", [3, 4], ["ns1.eu.host.test"]),
			observation("e3.fr", [5], [], ["mx.mail.test"]),
		],
		5,
		CATALOGUE,
	);
	assert.deepEqual(result.providers.map((provider) => provider.name), [
		"Host A", "Host B", "Mail A",
	]);
});

test("simulates a simultaneous outage with deduplicated organizations", () => {
	const providers = ["Host A", "Host B", "Mail A", "Host C", "Host D", "Host E"] as const;
	const catalogue: DnsProvider[] = providers.map((name, index) => ({
		suffix: `p${index}.test`,
		name,
		category: index === 2 ? "mail" : "dns",
		mode: "suffix",
	}));
	const groups = [[1, 2, 3], [2, 3, 4], [4, 5], [6], [7], [8]];
	const observations = groups.map((ids, index) =>
		observation(
			`f${index}.fr`,
			ids,
			index === 2 ? [] : [`ns.${catalogue[index]!.suffix}`],
			index === 2 ? [`mx.${catalogue[index]!.suffix}`] : [],
		),
	);
	const result = simulateHostingOutage(observations, 5, catalogue);
	assert.equal(result.organizationsAffected, 7);
	assert.equal(result.sumProviderOrganizations, 10);
	assert.equal(result.overlappingOrganizations, 3);
	assert.equal(result.providers.length, 5);
});

test("ignores domains with neither organization nor DNS record", () => {
	const result = simulateHostingOutage(
		[observation("empty.fr", [], ["ns1.host.test"]), observation("silent.fr", [1])],
		5,
		CATALOGUE,
	);
	assert.equal(result.domainsObserved, 0);
	assert.equal(result.organizationsObserved, 1);
	assert.equal(result.organizationsAffected, 0);
});

test("rejects an outage size outside the supported range", () => {
	assert.throws(() => simulateHostingOutage([], 0), RangeError);
	assert.throws(() => simulateHostingOutage([], MAX_OUTAGE_SIZE + 1), RangeError);
});

test("returns aggregates only, never organization names or domains", () => {
	const result = simulateHostingOutage(
		[observation("secret-domain.fr", [42], ["ns1.host.test"])],
	);
	const payload = JSON.stringify(result);
	assert.equal(payload.includes("secret-domain.fr"), false);
	assert.equal(payload.includes("42"), false);
	assert.ok(HOSTING_CATALOGUE.length > 0);
});
