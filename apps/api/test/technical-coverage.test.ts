/**
 * One behavior per test for the technical-coverage slice: corpus validation
 * refuses non-NA or personal fields, the measurement counts only NA-attached
 * claims, and the public route exposes aggregates without victim data.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
  matchesNaOrganization,
  parseNaClaim,
  parseTechnicalSite,
} from "../src/technical/catalog.js";
import {
  CLAIM_SOURCE,
  SOURCE_ID_PREFIX,
  measureTechnicalCoverage,
  type TechnicalMeasurement,
} from "../src/technical/measure.js";
import { registerApiRoutes } from "../src/routes/index.js";
import { installAccessControl } from "../src/security/rbac.js";

const TAG = `tc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE_ID = `${SOURCE_ID_PREFIX}test-${TAG}`;
const CLAIM_FINGERPRINT = `${TAG}-claim`;
const ORG_SLUG = `${TAG}-org`;
const SITE = {
  id: SOURCE_ID,
  kind: "github",
  name: "GitHub NA query",
  url: "https://api.github.com/search/repositories?q=Bordeaux",
  department: "33",
  naAnchor: "Bordeaux, Gironde",
  format: "json",
};

let app: FastifyInstance | undefined;
let fixtureOrgId: number | undefined;
let baseline: TechnicalMeasurement | undefined;

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM leak_claim WHERE fingerprint = $1", [CLAIM_FINGERPRINT]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE_ID]);
  if (fixtureOrgId !== undefined) await query("DELETE FROM org WHERE id = $1", [fixtureOrgId]);
  await closePools();
});

test("a technical endpoint outside Nouvelle-Aquitaine is refused", () => {
  assert.equal(parseTechnicalSite({ ...SITE, department: "75" }), null);
  assert.equal(parseTechnicalSite({ ...SITE, victim: "someone" }), null);
  assert.ok(parseTechnicalSite(SITE));
});

test("a claim with a personal field or an outside department is refused", () => {
  const claim = {
    id: `${TAG}-claim`, orgId: 1, orgName: "Example Association", department: "33",
    groupName: "Lockbit 3.0", publishedAt: "2026-01-01",
    evidenceUrl: "https://example.invalid/claim", source: CLAIM_SOURCE,
    naMotif: "referential name and NA department verified",
  };
  assert.equal(parseNaClaim({ ...claim, department: "75" }), null);
  assert.equal(parseNaClaim({ ...claim, victimEmail: "someone@example.invalid" }), null);
  assert.ok(parseNaClaim(claim));
});

test("an attachment needs the exact referential name and an NA department", () => {
  const claim = { orgName: "Ville de Poitiers", department: "86" };
  assert.equal(matchesNaOrganization(claim, { id: 7, name: "VILLE DE POITIERS", department: "86" }), true);
  assert.equal(matchesNaOrganization(claim, { id: 7, name: "Ville de Lyon", department: "69" }), false);
  assert.equal(matchesNaOrganization(claim, { id: 7, name: "Ville de Poitiers", department: "86" }), true);
  assert.equal(matchesNaOrganization(claim, { id: 7, name: "Ville de Poitiers", department: null }), false);
});

test("measurement and route count the NA-attached claim and source only", async () => {
  baseline = await measureTechnicalCoverage();
  const created = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, status)
     VALUES ($1, $2, 'association', '33', 'confirme') RETURNING id`,
    [`Technical Coverage Fixture ${TAG}`, ORG_SLUG],
  );
  fixtureOrgId = Number(created.rows[0]!.id);
  await query(
    `INSERT INTO source
       (id, name, family, url, kind, format, parser, region, department)
     VALUES ($1, $2, 'vuln', $3, 'indicator', 'json', $4, 'nouvelle-aquitaine', '33')`,
    [SITE.id, SITE.name, SITE.url, JSON.stringify({ kind: SITE.kind })],
  );
  await query(
    `INSERT INTO leak_claim
       (fingerprint, source, site_slug, group_name, victim, org_id, na, na_motif)
     VALUES ($1, $2, $3, 'Lockbit 3.0', $4, $5, true, 'referential name and NA department verified')`,
    [CLAIM_FINGERPRINT, CLAIM_SOURCE, `${TAG}-site`, `Technical Coverage Fixture ${TAG}`, fixtureOrgId],
  );

  const measured = await measureTechnicalCoverage();
  assert.equal(measured.sourceCount, baseline.sourceCount + 1);
  assert.equal(measured.sourcesByKind.github, baseline.sourcesByKind.github + 1);
  assert.equal(measured.claimsAttachedToNaOrg, baseline.claimsAttachedToNaOrg + 1);
  assert.equal(measured.claimsFromThisCorpus, baseline.claimsFromThisCorpus + 1);

  app = Fastify({ logger: false });
  installAccessControl(app);
  await registerApiRoutes(app);
  await app.ready();
  const response = await app.inject({ method: "GET", url: "/api/technical/coverage" });
  assert.equal(response.statusCode, 200);
  const body = response.json() as Record<string, unknown>;
  assert.equal(body.sourceCount, measured.sourceCount);
  assert.equal(body.claimsAttachedToNaOrg, measured.claimsAttachedToNaOrg);
  assert.equal("victim" in body, false);
  assert.equal("orgName" in body, false);
});
