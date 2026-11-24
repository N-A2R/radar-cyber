import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../src/db.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const orgIds: number[] = [];
const eventIds: number[] = [];

async function createOrg(dept: string, kind = "entreprise"): Promise<number> {
  const r = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, city, status)
     VALUES ($1, $2, $3, $4, 'Bordeaux', 'confirme') RETURNING id`,
    [`Victim test org ${randomUUID()}`, `victim-test-${randomUUID()}`, kind, dept],
  );
  const id = r.rows[0]?.id;
  assert.ok(id, "test organisation was not created");
  orgIds.push(id);
  return id;
}

async function createEvent(
  orgId: number,
  overrides: { family?: string; assertion?: string; tlp?: string; title?: string } = {},
): Promise<number> {
  const r = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, collected_at,
                        severity, source_id, source_url, org_id, tlp, evidence)
     VALUES ($1, $2, $3, $4, '2026-11-21T10:00:00Z', now(), 5, 'ransomlook',
             'https://example.invalid/ransomlook/claim', $5, $6, $7::jsonb)
     RETURNING id`,
    [
      `victim-test:${randomUUID()}`,
      overrides.family ?? "ransomware",
      overrides.assertion ?? "third_party_claim",
      overrides.title ?? "Victim claim replay",
      orgId,
      overrides.tlp ?? "CLEAR",
      JSON.stringify({ run_id: "1" }),
    ],
  );
  const id = r.rows[0]?.id;
  assert.ok(id, "test event was not created");
  eventIds.push(id);
  return id;
}

function evidenceOf(alert: Record<string, unknown> | undefined): Record<string, unknown> {
  assert.ok(alert);
  assert.ok(alert.evidence && typeof alert.evidence === "object", "alert has no evidence object");
  // pg returns jsonb as an already-parsed object; the generic row type loses it.
  const evidence = alert.evidence as Record<string, unknown>;
  return evidence;
}

async function alertsFor(eventId: number): Promise<Array<Record<string, unknown>>> {
  const r = await query<Record<string, unknown>>(
    `SELECT rule_id, title, scope, evidence, created_at FROM alert WHERE event_id = $1 ORDER BY id`,
    [eventId],
  );
  return r.rows;
}

after(async () => {
  if (eventIds.length > 0) await query("DELETE FROM alert WHERE event_id = ANY($1)", [eventIds]);
  if (eventIds.length > 0) await supprimerEvenementsArchivees("id = ANY($1)", [eventIds]);
  if (orgIds.length > 0) await query("DELETE FROM org WHERE id = ANY($1)", [orgIds]);
});

test("a New-Aquitanian victim claim creates an alert in the event transaction", async () => {
  const orgId = await createOrg("33");
  const eventId = await createEvent(orgId);
  const [alert] = await alertsFor(eventId);
  assert.ok(alert, "no victim alert was created");
  assert.equal(alert.rule_id, "victim-na");
  assert.equal(alert.title, "Victim claim in Nouvelle-Aquitaine");
  assert.equal(alert.scope, "organization_incident");
  assert.equal(evidenceOf(alert).dept, "33");
});

test("a claim outside Nouvelle-Aquitaine creates no victim alert", async () => {
  const orgId = await createOrg("75");
  const eventId = await createEvent(orgId);
  assert.deepEqual(await alertsFor(eventId), []);
});

test("a grey-source claim is accepted without a source allowlist", async () => {
  const orgId = await createOrg("64");
  const eventId = await createEvent(orgId, { tlp: "GREY" });
  assert.equal((await alertsFor(eventId))[0]?.rule_id, "victim-na");
});

test("an ambient signal about ransomware does not create a victim alert", async () => {
  const orgId = await createOrg("33");
  const eventId = await createEvent(orgId, { assertion: "ambient_signal" });
  assert.deepEqual(await alertsFor(eventId), []);
});

test("alert evidence carries no victim title, e-mail or personal field", async () => {
  const orgId = await createOrg("17");
  const eventId = await createEvent(orgId, {
    title: "jean.dupont@example.test — patient record",
  });
  const [alert] = await alertsFor(eventId);
  const evidence = evidenceOf(alert);
  assert.ok(!JSON.stringify(evidence).includes("jean.dupont"));
  assert.ok(!JSON.stringify(evidence).includes("example.test"));
  assert.ok(!JSON.stringify(evidence).includes("patient"));
  assert.deepEqual(Object.keys(evidence).sort(), [
    "dept", "event_id", "ingested_at", "mode", "org_id", "published_at", "source_id",
  ]);
});

test("re-emitting the same claim does not duplicate its victim alert", async () => {
  const orgId = await createOrg("87");
  const eventId = await createEvent(orgId);
  await query("SELECT emit_victim_alert($1, 'backfill')", [eventId]);
  await query("SELECT emit_victim_alert($1, 'backfill')", [eventId]);
  assert.equal((await alertsFor(eventId)).length, 1);
});

test("backfill alerts an existing claim that became a victim claim later", async () => {
  const orgId = await createOrg("40");
  const eventId = await createEvent(orgId, { assertion: "ambient_signal" });
  assert.deepEqual(await alertsFor(eventId), []);
  await query("UPDATE event SET assertion_type = 'third_party_claim' WHERE id = $1", [eventId]);
  const r = await query<{ emitted: boolean }>(
    "SELECT emit_victim_alert($1, 'backfill') AS emitted",
    [eventId],
  );
  assert.equal(r.rows[0]?.emitted, true);
  const [alert] = await alertsFor(eventId);
  assert.ok(alert);
  assert.equal(evidenceOf(alert).mode, "backfill");
});
