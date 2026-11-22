/**
 * Pure behavior of the single-point-of-failure aggregation.
 *
 * One test per behavior: domain vs organization counting, strict threshold,
 * regional allowlist, NS/MX deduplication, record categories, ranking and
 * anonymity. No database and no network are involved.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeProviderSpof, type ProviderObservation } from "../src/analyse/provider-spof.js";
import type { DnsProvider } from "../src/dns/historique.js";

const CATALOGUE: DnsProvider[] = [
	{ suffix: "ovh.net", name: "OVHcloud", category: "dns", mode: "suffix" },
	{ suffix: "ovh.net", name: "OVHcloud", category: "mail", mode: "suffix" },
	{ suffix: "outlook.com", name: "Microsoft 365", category: "mail", mode: "suffix" },
	{ suffix: "gandi.net", name: "Gandi", category: "dns", mode: "suffix" },
];

function observation(domain: string, orgIds: number[], ns: string[] = [], mx: string[] = []): ProviderObservation {
	return { domain, orgIds, ns, mx };
}

test("counts distinct organizations instead of domains", () => {
	const analysis = analyzeProviderSpof([
		observation("a.fr", [1, 2], ["ns1.ovh.net"]),
		observation("b.fr", [2, 3], ["ns2.ovh.net"]),
		observation("c.fr", [3], ["ns3.ovh.net"]),
	], CATALOGUE, { threshold: 1 });
	assert.deepEqual(analysis.providers.map((p) => [p.name, p.organizations, p.domains]), [
		["OVHcloud", 3, 3],
	]);
	assert.equal(analysis.organizationsObserved, 3);
});

test("applies a strict greater-than threshold", () => {
	const analysis = analyzeProviderSpof([
		observation("a.fr", Array.from({ length: 101 }, (_, i) => i + 1), ["ns1.ovh.net"]),
		observation("b.fr", Array.from({ length: 100 }, (_, i) => i + 1000), [], ["mx.outlook.com"]),
	], CATALOGUE, { threshold: 100 });
	assert.deepEqual(analysis.providers.map((p) => p.name), ["OVHcloud"]);
});

test("drops organizations outside the optional allowlist", () => {
	const analysis = analyzeProviderSpof(
		[observation("a.fr", [1, 2, 3], ["ns1.ovh.net"])],
		CATALOGUE,
		{ threshold: 1, allowedOrgIds: new Set([1, 3]) },
	);
	assert.equal(analysis.providers[0]?.organizations, 2);
	assert.equal(analysis.organizationsObserved, 2);
});

test("counts an organization once when NS and MX use the same provider", () => {
	const analysis = analyzeProviderSpof(
		[observation("a.fr", [1], ["ns1.ovh.net"], ["mx1.ovh.net"])],
		CATALOGUE,
		{ threshold: 0 },
	);
	assert.deepEqual(analysis.providers, [{
		name: "OVHcloud",
		categories: ["dns", "mail"],
		organizations: 1,
		domains: 1,
	}]);
});

test("ignores hosts outside NS and MX provider categories", () => {
	const analysis = analyzeProviderSpof(
		[observation("a.fr", [1], ["mail.outlook.com"], ["ns.gandi.net"])],
		CATALOGUE,
		{ threshold: 0 },
	);
	assert.deepEqual(analysis.providers, []);
	assert.equal(analysis.unknownHosts, 2);
	assert.equal(analysis.organizationsAttributed, 0);
});

test("ranks providers by impact then name", () => {
	const analysis = analyzeProviderSpof([
		observation("a.fr", [1, 2, 3, 4, 5], ["ns1.ovh.net"]),
		observation("b.fr", [10, 11, 12, 13, 14], [], ["mx.outlook.com"]),
		observation("c.fr", [20, 21, 22], ["ns.gandi.net"]),
	], CATALOGUE, { threshold: 2 });
	assert.deepEqual(analysis.providers.map((p) => p.name), ["Microsoft 365", "OVHcloud", "Gandi"]);
});

test("never exposes organization identities or domain names", () => {
	const analysis = analyzeProviderSpof(
		[observation("secret-victim.example", [42], ["ns1.ovh.net"])],
		CATALOGUE,
		{ threshold: 0 },
	);
	assert.deepEqual(Object.keys(analysis.providers[0]!).sort(), [
		"categories", "domains", "name", "organizations",
	]);
	assert.equal(JSON.stringify(analysis).includes("secret-victim.example"), false);
	assert.equal(JSON.stringify(analysis).includes("42"), false);
});
