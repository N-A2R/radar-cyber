/**
 * One behavior per test for domain-based leak attachment to NA organizations.
 *
 * Pure rules are exercised on fixtures; one database test and one HTTP test
 * check that the service and the reproducible measurement use the same rule.
 * No victim payload is ever inserted or read.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
  attachLeaksByDomain,
  countLeaksByDomain,
  isNaDepartment,
  type DomainOrganization,
  type LeakClaim,
} from "../src/leaks/by-domain.js";
import { measureLeaksByDomain } from "../src/leaks/measure.js";
import leaksByDomainRoute from "../src/routes/leaks-by-domain.js";
import { installAccessControl } from "../src/security/rbac.js";

const TAG = `ld${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ORG_DOMAIN = `${TAG}.example`;
const SLUG = `${TAG}-org`;
const HASH = `${TAG}-claim`;

function org(id: number, department: string | null, domain: string | null): DomainOrganization {
  return { id, department, domain, website: null };
}

function claim(id: string, domainHint: string | null, source = "ransomwatch", status = "reviewed"): LeakClaim {
  return { id, source, domainHint, status };
}

let app: FastifyInstance;
let fixtureOrgId: number;

before(async () => {
  const inserted = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain, status)
     VALUES ($1, $2, 'entreprise', '33', $3, 'confirme') RETURNING id`,
    [`Domain Leak Fixture ${TAG}`, SLUG, ORG_DOMAIN],
  );
  fixtureOrgId = Number(inserted.rows[0]!.id);
  await query(
    `INSERT INTO quarantine_raw (source, source_url, org_hint, content_hash, tlp, status, kind)
     VALUES ('ransomwatch', 'https://example.invalid/test', $1, $2, 'RED', 'reviewed', 'claim')`,
    [`www.${ORG_DOMAIN}`, HASH],
  );

  app = Fastify({ logger: false });
  installAccessControl(app);
  await app.register(leaksByDomainRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM quarantine_raw WHERE content_hash = $1", [HASH]);
  await query("DELETE FROM org WHERE id = $1", [fixtureOrgId]);
  await closePools();
});

test("an exact domain root attaches a claim to an NA organization", () => {
  const result = attachLeaksByDomain([claim("1", "fol-23.fr")], [org(7, "23", "fol-23.fr")]);
  assert.deepEqual(result, [{ claimId: "1", orgId: 7, domain: "fol-23.fr", source: "ransomwatch" }]);
});

test("a URL or www hint is normalized to the registrable root", () => {
  const result = attachLeaksByDomain(
    [claim("2", "https://www.sefiso-atlantique.fr/page")],
    [org(9, "Gironde", null)],
  );
  const withWebsite = attachLeaksByDomain(
    [claim("2", "https://www.sefiso-atlantique.fr/page")],
    [{ ...org(9, "Gironde", null), website: "https://sefiso-atlantique.fr" }],
  );
  assert.deepEqual(result, []);
  assert.equal(withWebsite.length, 1);
  assert.equal(withWebsite[0]!.domain, "sefiso-atlantique.fr");
});

test("an organization outside Nouvelle-Aquitaine is never attached", () => {
  const result = attachLeaksByDomain([claim("3", ORG_DOMAIN)], [org(11, "75", ORG_DOMAIN)]);
  assert.deepEqual(result, []);
});

test("non-domain hints and generic tokens never attach", () => {
  const organizations = [org(12, "33", ORG_DOMAIN)];
  const hints = ["AKTO", "com", "sefiso", null, ""];
  assert.equal(countLeaksByDomain(hints.map((hint, i) => claim(String(i), hint)), organizations), 0);
});

test("department codes and names are both recognized", () => {
  assert.equal(isNaDepartment("33"), true);
  assert.equal(isNaDepartment("Gironde"), true);
  assert.equal(isNaDepartment("Deux-Sèvres"), true);
  assert.equal(isNaDepartment("75"), false);
  assert.equal(isNaDepartment(null), false);
});

test("gray sources stay eligible without any paid source", () => {
  const result = attachLeaksByDomain(
    [claim("4", ORG_DOMAIN, "ransomwatch"), claim("5", ORG_DOMAIN, "ransomware.live")],
    [org(13, "33", ORG_DOMAIN)],
  );
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((a) => a.source), ["ransomwatch", "ransomware.live"]);
});

test("a rejected claim is not counted as a leak", () => {
  const result = attachLeaksByDomain([claim("6", ORG_DOMAIN, "ransomwatch", "rejected")], [org(14, "33", ORG_DOMAIN)]);
  assert.deepEqual(result, []);
});

test("a domain shared by two NA organizations is not attached", () => {
  const result = attachLeaksByDomain(
    [claim("7", ORG_DOMAIN)],
    [org(15, "33", ORG_DOMAIN), org(16, "17", `https://${ORG_DOMAIN}`)],
  );
  assert.deepEqual(result, []);
});

test("one claim is counted once even when repeated", () => {
  const claims = [claim("8", ORG_DOMAIN), claim("8", ORG_DOMAIN), claim("9", ORG_DOMAIN)];
  assert.equal(countLeaksByDomain(claims, [org(17, "33", ORG_DOMAIN)]), 2);
});

test("attachment results carry identifiers only, never victim data", () => {
  const [result] = attachLeaksByDomain([claim("10", ORG_DOMAIN)], [org(18, "33", ORG_DOMAIN)]);
  assert.deepEqual(Object.keys(result!).sort(), ["claimId", "domain", "orgId", "source"]);
  assert.doesNotMatch(JSON.stringify(result), /raw|victim|email|password|body/i);
});

test("the measurement reads the stored tables through the same rule", async () => {
  const measurement = await measureLeaksByDomain();
  assert.equal(measurement.scope, "nouvelle-aquitaine");
  assert.equal(typeof measurement.baseline.organizations, "number");
  assert.equal(typeof measurement.baseline.sources, "number");
  assert.equal(typeof measurement.baseline.events, "number");
  assert.ok(measurement.attachments.some((a) => a.orgId === fixtureOrgId && a.domain === ORG_DOMAIN));
  assert.ok(measurement.count >= 1);
});

test("GET /api/leaks/by-domain publishes the English contract and no victim data", async () => {
  const response = await app.inject({ method: "GET", url: "/api/leaks/by-domain" });
  assert.equal(response.statusCode, 200);
  const body = response.json<Record<string, unknown>>();
  assert.deepEqual(Object.keys(body).sort(), [
    "basis", "claimsRead", "count", "matchedOrganizations", "measuredAt", "scope",
  ]);
  assert.equal(body.scope, "nouvelle-aquitaine");
  assert.equal(body.basis, "domain");
  assert.equal(typeof body.count, "number");
  assert.doesNotMatch(response.body, /raw|victim|email|password/i);
});
