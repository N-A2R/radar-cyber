/**
 * One behavior per test for the four remaining Nouvelle-Aquitaine department
 * gaps: admission scope, slice-specific audit fields, body-free events,
 * idempotent promotion, and an aggregate public measurement.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { query, closePools } from "../src/db.js";
import { isNaDepartment } from "../src/technical/catalog.js";
import {
  REMAINING_ADMISSION_RULE,
  REMAINING_DEDUP_PREFIX,
  REMAINING_GAP_DEPARTMENTS,
  buildGapEvent,
  fillRemainingNaGaps,
  measureNaDepartments,
  parseGapClaim,
  type GapClaim,
} from "../src/technical/na-departments.js";
import { registerApiRoutes } from "../src/routes/index.js";
import { installAccessControl } from "../src/security/rbac.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `rg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const FINGERPRINT = `${TAG}-claim`;
const ORG_SLUG = `${TAG}-org`;
const CLAIM: GapClaim = {
  id: 99000002,
  orgId: 99000002,
  department: "16",
  groupName: "spectre",
  publishedAt: "2026-02-01T00:00:00.000Z",
  evidenceUrl: "https://example.invalid/remaining-claim",
  source: "ransomwatch",
};

let app: FastifyInstance | undefined;
let fixtureOrgId: number | undefined;

after(async () => {
  if (app) await app.close();
  await supprimerEvenementsArchivees("dedup_key = $1", [`${REMAINING_DEDUP_PREFIX}${CLAIM.id}`]);
  await query("DELETE FROM leak_claim WHERE fingerprint = $1", [FINGERPRINT]);
  if (fixtureOrgId !== undefined) await query("DELETE FROM org WHERE id = $1", [fixtureOrgId]);
  await closePools();
});

test("the remaining gaps are Nouvelle-Aquitaine departments and are admitted", () => {
  assert.equal(REMAINING_GAP_DEPARTMENTS.length, 4);
  for (const department of REMAINING_GAP_DEPARTMENTS) {
    assert.equal(isNaDepartment(department), true);
    assert.ok(parseGapClaim({ ...CLAIM, department }));
  }
  assert.equal(parseGapClaim({ ...CLAIM, department: "75" }), null);
  assert.equal(parseGapClaim({ ...CLAIM, department: "33" }), null);
});

test("a remaining-gap event carries its own idempotency and audit keys", () => {
  const event = buildGapEvent(CLAIM, "onion:ccw:spectre", {
    dedupPrefix: REMAINING_DEDUP_PREFIX,
    admissionRule: REMAINING_ADMISSION_RULE,
    regionalMotif: "na_remaining_gap",
  });
  assert.equal(event.dedupKey, `${REMAINING_DEDUP_PREFIX}${CLAIM.id}`);
  assert.equal(event.admissionRule, REMAINING_ADMISSION_RULE);
  assert.equal(event.evidence.via, REMAINING_ADMISSION_RULE);
  assert.equal(event.regionalMotif, "na_remaining_gap");
});

test("a remaining-gap event exposes no victim name and no claim body", () => {
  const event = buildGapEvent(CLAIM, "onion:ccw:spectre", {
    dedupPrefix: REMAINING_DEDUP_PREFIX,
    admissionRule: REMAINING_ADMISSION_RULE,
    regionalMotif: "na_remaining_gap",
  });
  assert.equal(event.summary, null);
  assert.equal(event.title.includes("spectre"), false);
  assert.equal(Object.hasOwn(event.evidence, "victim"), false);
  assert.equal(Object.hasOwn(event.evidence, "description"), false);
});

test("remaining-gap claims become events and a second pass adds nothing", async () => {
  const created = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, status)
     VALUES ($1, $2, 'association', '16', 'confirme') RETURNING id`,
    [`Remaining Gap Fixture ${TAG}`, ORG_SLUG],
  );
  fixtureOrgId = Number(created.rows[0]!.id);
  await query(
    `INSERT INTO leak_claim
       (id, fingerprint, source, site_slug, group_name, victim, org_id, na, na_motif, evidence_url, published_at)
     VALUES ($1, $2, 'ransomwatch', $3, $4, $5, $6, true, 'verified NA department', $7, $8)`,
    [CLAIM.id, FINGERPRINT, `${TAG}-site`, CLAIM.groupName, `Remaining Gap Fixture ${TAG}`, fixtureOrgId,
      CLAIM.evidenceUrl, CLAIM.publishedAt],
  );

  const first = await fillRemainingNaGaps();
  assert.ok(first.inserted >= 1);

  const second = await fillRemainingNaGaps();
  assert.equal(second.inserted, 0);
  assert.equal(second.refused, 0);
});

test("the public route reports the aggregate without exposing a claim body", async () => {
  const measured = await measureNaDepartments();
  assert.equal(measured.departments.length, 12);

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
