/**
 * One behavior per test for the last NA department coverage gaps: strict
 * claim validation, a body-free event, idempotent promotion, and an aggregate
 * public measurement.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
  GAP_DEDUP_PREFIX,
  buildGapEvent,
  fillNaDepartmentGaps,
  measureNaDepartments,
  parseGapClaim,
  type GapClaim,
} from "../src/technical/na-departments.js";
import { registerApiRoutes } from "../src/routes/index.js";
import { installAccessControl } from "../src/security/rbac.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `ng${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const FINGERPRINT = `${TAG}-claim`;
const ORG_SLUG = `${TAG}-org`;
const CLAIM: GapClaim = {
  id: 99000001,
  orgId: 99000001,
  department: "19",
  groupName: "spook",
  publishedAt: "2026-01-01T00:00:00.000Z",
  evidenceUrl: "https://example.invalid/claim",
  source: "ransomwatch",
};

let app: FastifyInstance | undefined;
let fixtureOrgId: number | undefined;

after(async () => {
  if (app) await app.close();
  await supprimerEvenementsArchivees("dedup_key = $1", [`${GAP_DEDUP_PREFIX}${CLAIM.id}`]);
  await query("DELETE FROM leak_claim WHERE fingerprint = $1", [FINGERPRINT]);
  if (fixtureOrgId !== undefined) await query("DELETE FROM org WHERE id = $1", [fixtureOrgId]);
  await closePools();
});

test("a claim outside the gap departments is refused", () => {
  assert.equal(parseGapClaim({ ...CLAIM, department: "75" }), null);
  assert.equal(parseGapClaim({ ...CLAIM, department: "33" }), null);
  assert.ok(parseGapClaim(CLAIM));
});

test("a claim without a public HTTPS proof is refused", () => {
  assert.equal(parseGapClaim({ ...CLAIM, evidenceUrl: "http://example.invalid/claim" }), null);
  assert.equal(parseGapClaim({ ...CLAIM, evidenceUrl: "https://user:pass@example.invalid/claim" }), null);
});

test("a claim with a victim-level field is refused", () => {
  assert.equal(parseGapClaim({ ...CLAIM, victim: "someone" }), null);
  assert.equal(parseGapClaim({ ...CLAIM, description: "leaked body" }), null);
});

test("a built event carries no victim name and no claim body", () => {
  const event = buildGapEvent(CLAIM, "onion:ccw:spook");
  assert.equal(event.summary, null);
  assert.equal(event.title.includes("spook"), false);
  assert.equal(Object.hasOwn(event.evidence, "victim"), false);
  assert.equal(Object.hasOwn(event.evidence, "description"), false);
  assert.equal(event.regional, true);
});

test("gap claims become events and a second pass adds nothing", async () => {
  const created = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, status)
     VALUES ($1, $2, 'association', '19', 'confirme') RETURNING id`,
    [`Coverage Gap Fixture ${TAG}`, ORG_SLUG],
  );
  fixtureOrgId = Number(created.rows[0]!.id);
  await query(
    `INSERT INTO leak_claim
       (id, fingerprint, source, site_slug, group_name, victim, org_id, na, na_motif, evidence_url, published_at)
     VALUES ($1, $2, 'ransomwatch', $3, $4, $5, $6, true, 'verified NA department', $7, $8)`,
    [CLAIM.id, FINGERPRINT, `${TAG}-site`, CLAIM.groupName, `Coverage Gap Fixture ${TAG}`, fixtureOrgId,
      CLAIM.evidenceUrl, CLAIM.publishedAt],
  );

  const first = await fillNaDepartmentGaps();
  assert.ok(first.inserted >= 1);

  const second = await fillNaDepartmentGaps();
  assert.equal(second.inserted, 0);
  assert.equal(second.refused, 0);
});

test("the public route reports departments without exposing a claim body", async () => {
  const measured = await measureNaDepartments();
  assert.equal(measured.departments.length, 12);
  assert.equal(measured.zeroDepartments.includes("19"), false);

  app = Fastify({ logger: false });
  installAccessControl(app);
  await registerApiRoutes(app);
  await app.ready();
  const response = await app.inject({ method: "GET", url: "/api/coverage/na-departments" });
  assert.equal(response.statusCode, 200);
  const body = response.json() as Record<string, unknown>;
  assert.deepEqual(body.zeroDepartments, measured.zeroDepartments);
  assert.equal(body.eventCount, measured.eventCount);
  assert.equal("victim" in body, false);
  assert.equal("description" in body, false);
});
