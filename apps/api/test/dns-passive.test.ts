/**
 * Passive DNS sensor: one test per behaviour.
 *
 * NA perimeter filtering, answer parsing, per-day deduplication, bounded
 * collection with isolated failures, idempotent storage and the public daily
 * counts endpoint. All resolvers are injected: no test touches the network.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import Fastify from "fastify";
import { ingestQuery } from "../src/db.js";
import { normalizeAnswer, observeDomain, collectResolutions, type DnsResolver } from "../src/dns/passive/observe.js";
import { fromCorpusRow, fromOrgRow } from "../src/dns/passive/perimeter.js";
import { dailyCounts, passiveScope, saveDomains, saveResolutions } from "../src/dns/passive/store.js";
import dnsPassiveRoute from "../src/routes/dns-passive.js";
import { installAccessControl } from "../src/security/rbac.js";

const TAG = `dp${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const DAY = "2026-11-22";
const NOW = new Date(`${DAY}T12:00:00.000Z`);
const DOMAINS = [0, 1, 2].map((i) => `${TAG}-${i}.fr`);

after(async () => {
  await ingestQuery("DELETE FROM dns_passive_domain WHERE domain LIKE $1", [`${TAG}-%`]);
});

test("only Nouvelle-Aquitaine rows enter the passive DNS perimeter", () => {
  assert.equal(fromOrgRow({ id: 1, dept: "33", domain: "https://www.Exemple.fr/x", website: null })?.domain, "exemple.fr");
  assert.equal(fromOrgRow({ id: 2, dept: "Paris", domain: "exemple.fr", website: null }), null);
  assert.equal(fromCorpusRow({ departement: "016", url: "https://etab.ac-poitiers.fr/x" })?.domain, "etab.ac-poitiers.fr");
  assert.equal(fromCorpusRow({ departement: "75", url: "https://exemple.fr" }), null);
});

test("DNS answers are normalised and unrelated records are discarded", () => {
  assert.equal(normalizeAnswer("A", "192.0.2.10"), "192.0.2.10");
  assert.equal(normalizeAnswer("A", "192.0.2.999"), null);
  assert.equal(normalizeAnswer("AAAA", "2001:DB8::10"), "2001:db8::10");
  assert.equal(normalizeAnswer("MX", "10 MX1.EXEMPLE.FR."), "mx1.exemple.fr");
  assert.equal(normalizeAnswer("NS", "ns1.ovh.net."), "ns1.ovh.net");
  assert.equal(normalizeAnswer("A", "alias.exemple.fr."), null);
});

test("duplicate answers collapse to one resolution and a failed type adds none", async () => {
  const resolver: DnsResolver = {
    async query(_domain, type) {
      if (type === "A") return { status: 0, answers: ["192.0.2.10", "192.0.2.10", "192.0.2.11"] };
      if (type === "MX") return { status: 0, answers: ["10 mx.exemple.fr."] };
      if (type === "NS") throw new Error("resolver down");
      return { status: 3, answers: [] };
    },
  };
  const observation = await observeDomain("exemple.fr", resolver, NOW);
  assert.equal(observation.resolutions.length, 3);
  assert.ok(observation.resolutions.every((r) => r.observedOn === DAY));
  assert.ok(observation.errors.some((e) => e.startsWith("NS:")));
});

test("bounded collection isolates one domain's failure from the others", async () => {
  const resolver: DnsResolver = {
    async query(domain, type) {
      if (domain === DOMAINS[1]) throw new Error("offline");
      return { status: 0, answers: type === "A" ? [`192.0.2.${domain === DOMAINS[2] ? 2 : 1}`] : [] };
    },
  };
  const result = await collectResolutions(DOMAINS, resolver, { now: NOW, offset: 1, limit: 2, concurrency: 2 });
  assert.equal(result.domains, 2);
  assert.ok(result.errors.some((e) => e.startsWith(`${DOMAINS[1]}:`)));
  assert.deepEqual([...new Set(result.resolutions.map((r) => r.domain))], [DOMAINS[2]]);
});

test("storage is idempotent per day and feeds the daily count", async () => {
  await saveDomains(DOMAINS.map((domain) => ({ domain, source: "institution-corpus", orgId: null })));
  const records = DOMAINS.map((domain, i) => ({
    domain, observedOn: DAY, recordType: "A" as const, value: `198.51.100.${i + 1}`,
  }));
  assert.equal(await saveResolutions(records), 3);
  assert.equal(await saveResolutions(records), 0, "same answer on the same day is one resolution");

  const day = (await dailyCounts()).find((entry) => entry.day === DAY);
  assert.equal(day?.resolutions, 3);
  assert.equal(day?.domains, 3);
  assert.ok((await passiveScope()).resolutions >= 3);
});

test("public endpoint exposes the daily resolution counts", async () => {
  const app = Fastify({ logger: false });
  installAccessControl(app);
  await app.register(dnsPassiveRoute, { prefix: "/api" });
  const response = await app.inject({ method: "GET", url: "/api/dns/passive?limit=3" });
  assert.equal(response.statusCode, 200);
  const body = response.json() as { days: { day: string; resolutions: number }[]; scope: { resolutions: number } };
  assert.ok(Array.isArray(body.days));
  assert.ok(body.days.some((entry) => entry.day === DAY && entry.resolutions >= 3));
  assert.equal(typeof body.scope.resolutions, "number");
  await app.close();
});
