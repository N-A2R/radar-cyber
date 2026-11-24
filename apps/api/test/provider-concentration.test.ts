/**
 * One test per behavior of the digital provider map: regional scope, provider
 * de-duplication, failed DNS types, shared-provider concentration, privacy and
 * unknown-host evidence. All inputs are synthetic; nothing touches the network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  attributeObservation,
  buildProviderConcentration,
  type OrganizationRef,
  type ProviderObservation,
} from "../src/analyse/provider-concentration.js";
import type { DnsProvider } from "../src/dns/historique.js";

const CATALOGUE: DnsProvider[] = [
  { suffix: "ovh.net", name: "OVHcloud", category: "dns", mode: "suffix" },
  { suffix: "cloudflare.com", name: "Cloudflare", category: "dns", mode: "suffix" },
  { suffix: "google.com", name: "Google Workspace", category: "mail", mode: "suffix" },
];

function org(id: number, dept: string): OrganizationRef {
  return { id, dept, lat: 45.8, lon: 0.6 };
}

function observation(overrides: Partial<ProviderObservation> = {}): ProviderObservation {
  return {
    domain: "example.fr",
    orgIds: [1],
    ns: ["ns1.ovh.net"],
    mx: ["mx.google.com"],
    errors: [],
    ...overrides,
  };
}

function build(observations: ProviderObservation[], organizations: OrganizationRef[]) {
  return buildProviderConcentration({
    observations,
    organizations,
    catalogue: CATALOGUE,
    totalOrganizations: 1673151,
    generatedAt: "2026-11-22T00:00:00.000Z",
  });
}

test("keeps only Nouvelle-Aquitaine organizations in scope", () => {
  const report = build([observation({ orgIds: [1, 2], mx: [] })], [org(1, "33"), org(2, "75")]);
  assert.equal(report.totals.organizationsWithDomain, 1);
  assert.equal(report.totals.organizationsAttributed, 1);
  assert.deepEqual(report.organizationPoints.map((point) => point.orgId), [1]);
  const gironde = report.departments.find((dept) => dept.dept === "33");
  assert.equal(gironde?.organizationsAttributed, 1);
  assert.equal(gironde?.topProvider?.name, "OVHcloud");
  assert.ok(report.departments.every((dept) => String(dept.dept) !== "75"));
});

test("counts an organization once per provider across NS and MX", () => {
  const matches = attributeObservation(
    observation({ ns: ["ns1.ovh.net.", "ns2.ovh.net."], mx: ["mx.google.com"] }),
    CATALOGUE,
  );
  assert.deepEqual(matches.map((match) => match.name), ["Google Workspace", "OVHcloud"]);
  const report = build([observation({ ns: ["ns1.ovh.net.", "ns2.ovh.net."] })], [org(1, "33")]);
  assert.equal(report.totals.domainsAttributed, 1);
  assert.equal(report.concentration.organizationsUsingMultipleProviders, 1);
  assert.equal(report.concentration.organizationsUsingSingleProvider, 0);
  const ovh = report.providers.find((provider) => provider.name === "OVHcloud");
  assert.equal(ovh?.organizations, 1);
  assert.equal(ovh?.domains, 1);
});

test("ignores a record type whose lookup failed", () => {
  const failed = observation({ errors: ["doh:NS: timeout"] });
  assert.deepEqual(attributeObservation(failed, CATALOGUE).map((m) => m.name), ["Google Workspace"]);
  const report = build([failed], [org(1, "33")]);
  assert.deepEqual(report.providers.map((provider) => provider.name), ["Google Workspace"]);
  assert.deepEqual(report.unknownHosts, []);
});

test("counts organizations sharing the same provider", () => {
  const report = build(
    [
      observation({ domain: "a.fr", orgIds: [1], mx: [] }),
      observation({ domain: "b.fr", orgIds: [2], mx: [] }),
      observation({ domain: "c.fr", orgIds: [3], mx: [] }),
      observation({ domain: "d.fr", orgIds: [4], mx: [], ns: ["ns1.cloudflare.com"] }),
    ],
    [org(1, "33"), org(2, "24"), org(3, "86"), org(4, "79")],
  );
  assert.equal(report.concentration.topProvider?.name, "OVHcloud");
  assert.equal(report.concentration.topProvider?.organizations, 3);
  assert.equal(report.concentration.topProvider?.share, 0.75);
  assert.equal(report.concentration.top5Coverage, 1);
  assert.equal(report.concentration.organizationsUsingSingleProvider, 4);
});

test("publishes map points without organization names", () => {
  const report = build([observation()], [org(1, "33")]);
  const point = report.organizationPoints[0];
  assert.deepEqual(Object.keys(point).sort(), ["dept", "lat", "lon", "orgId", "providers"]);
  assert.deepEqual(point.providers, ["Google Workspace", "OVHcloud"]);
  assert.ok(!JSON.stringify(report).includes("name:"));
  assert.ok(!("name" in point));
});

test("lists unrecognised hosts as evidence for the catalogue", () => {
  const report = build(
    [observation({ ns: ["ns1.unknown-host.example"], mx: ["mx.google.com"] })],
    [org(1, "33")],
  );
  assert.deepEqual(report.unknownHosts, [
    { host: "ns1.unknown-host.example", domains: 1, records: ["NS"] },
  ]);
});
