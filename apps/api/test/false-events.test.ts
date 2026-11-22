/**
 * Tests for false-event detection (src/detect/false-events.ts).
 *
 * Each test creates disposable rows tagged with a unique prefix and removes
 * them in `finally`. Production data is never modified.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import { loadRules, evaluateEvent } from "../src/detect/engine.js";
import {
  FALSE_REASON,
  detectFalseEvent,
  recordFalseEvent,
  sweepUnrecordedFalseEvents,
} from "../src/detect/false-events.js";

const TAG = `fe${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
let seq = 0;
const next = (): string => `${TAG}-${++seq}`;

after(async () => {
  await closePools();
});

async function sourceId(): Promise<string> {
  const r = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
  return r.rows[0].id;
}

async function insertEvent(title: string, family = "testfalse", orgId: number | null = null): Promise<number> {
  const r = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, summary, severity, confidence, source_id, org_id, evidence)
     VALUES ($1,$2,'ambient_signal',$3,'Culture agenda',3,'C3',$4,$5,'{}') RETURNING id`,
    [next(), family, title, await sourceId(), orgId]
  );
  return r.rows[0].id;
}

async function insertRule(id: string): Promise<void> {
  await query(
    `INSERT INTO detection_rule (id, name, description, severity, enabled, match, action)
     VALUES ($1,$2,NULL,4,true,$3,'alert')`,
    [id, id, JSON.stringify({ family: "testfalse" })]
  );
  await loadRules(true);
}

async function cleanup(ids: { events: number[]; rules: string[] }): Promise<void> {
  if (ids.events.length > 0) {
    await query("DELETE FROM alert WHERE event_id = ANY($1::bigint[])", [ids.events]);
    // false_event rows are removed by the ON DELETE CASCADE foreign key.
    await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [ids.events]);
  }
  if (ids.rules.length > 0) {
    await query("DELETE FROM detection_rule WHERE id = ANY($1::text[])", [ids.rules]);
  }
  await loadRules(true);
}

test("detects an item with no cyber signal and no Nouvelle-Aquitaine anchor", () => {
  const verdict = detectFalseEvent({
    title: "Concert at the town hall",
    summary: "Culture agenda",
    org_id: null,
    regional: false,
  });
  assert.equal(verdict.isFalse, true);
  assert.equal(verdict.reason, FALSE_REASON);
  assert.equal(verdict.score, 0);
});

test("keeps an item carrying a cyber signal", () => {
  const verdict = detectFalseEvent({
    title: "Ransomware hits a hospital in Bordeaux",
    summary: "An incident was confirmed",
    org_id: null,
    regional: false,
  });
  assert.equal(verdict.isFalse, false);
  assert.equal(verdict.reason, null);
  assert.ok(verdict.score > 0);
});

test("keeps an item anchored to a Nouvelle-Aquitaine organisation", async () => {
  const r = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise','33') RETURNING id",
    [`Org ${TAG}`, next()]
  );
  const orgId = r.rows[0].id;
  try {
    const attached = detectFalseEvent({ title: "Concert at the town hall", org_id: orgId, regional: false });
    const regional = detectFalseEvent({ title: "Concert at the town hall", org_id: null, regional: true });
    assert.equal(attached.isFalse, false);
    assert.equal(regional.isFalse, false);
  } finally {
    await query("DELETE FROM org WHERE id=$1", [orgId]);
  }
});

test("evaluateEvent discards a false event and stores the decision", async () => {
  const ids = { events: [] as number[], rules: [] as string[] };
  const ruleId = `rule-${next()}`;
  ids.rules.push(ruleId);
  try {
    await insertRule(ruleId);
    const eventId = await insertEvent("Concert at the town hall");
    ids.events.push(eventId);
    await query(
      `INSERT INTO alert (rule_id, title, severity, event_id, status, evidence)
       VALUES ($1,'Old alert on a false event',4,$2,'open','{}'::jsonb)`,
      [ruleId, eventId]
    );

    assert.equal(await evaluateEvent(eventId), 0);
    const rows = await query<{ reason: string; relevance_score: number }>(
      "SELECT reason, relevance_score FROM false_event WHERE event_id=$1",
      [eventId]
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].reason, FALSE_REASON);
    assert.equal(rows.rows[0].relevance_score, 0);
    const alerts = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM alert WHERE event_id=$1",
      [eventId]
    );
    assert.equal(Number(alerts.rows[0].n), 1);
    const retired = await query<{ status: string; evidence: { false_event?: { reason?: string } } }>(
      "SELECT status, evidence FROM alert WHERE event_id=$1",
      [eventId]
    );
    assert.equal(retired.rows[0].status, "resolved");
    assert.equal(retired.rows[0].evidence.false_event?.reason, FALSE_REASON);

  } finally {
    await cleanup(ids);
  }
});

test("evaluateEvent honours a human-promoted false event", async () => {
  const ids = { events: [] as number[], rules: [] as string[] };
  const ruleId = `rule-${next()}`;
  ids.rules.push(ruleId);
  try {
    await insertRule(ruleId);
    const eventId = await insertEvent("Concert at the town hall");
    ids.events.push(eventId);

    assert.equal(await evaluateEvent(eventId, { force: true }), 1);
    const alerts = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM alert WHERE event_id=$1",
      [eventId]
    );
    assert.equal(Number(alerts.rows[0].n), 1);
    const discarded = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM false_event WHERE event_id=$1",
      [eventId]
    );
    assert.equal(Number(discarded.rows[0].n), 0);
  } finally {
    await cleanup(ids);
  }
});

test("recording the same decision twice keeps one row", async () => {
  const eventId = await insertEvent("Harvest festival programme");
  try {
    const verdict = detectFalseEvent({ title: "Harvest festival programme" });
    assert.equal(verdict.isFalse, true);
    assert.equal(await recordFalseEvent(eventId, verdict), true);
    assert.equal(await recordFalseEvent(eventId, verdict), false);
    const rows = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM false_event WHERE event_id=$1",
      [eventId]
    );
    assert.equal(Number(rows.rows[0].n), 1);
  } finally {
    await cleanup({ events: [eventId], rules: [] });
  }
});

test("sweep records a false event that never reached the engine", async () => {
  const eventId = await insertEvent("Village fete programme");
  try {
    const result = await sweepUnrecordedFalseEvents({ after: eventId - 1, limit: 10 });
    assert.ok(result.recorded >= 1);
    const rows = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM false_event WHERE event_id=$1",
      [eventId]
    );
    assert.equal(Number(rows.rows[0].n), 1);
  } finally {
    await cleanup({ events: [eventId], rules: [] });
  }
});

test("sweep keeps an event carrying a cyber signal", async () => {
  const eventId = await insertEvent("Ransomware hits a hospital in Bordeaux");
  try {
    await sweepUnrecordedFalseEvents({ after: eventId - 1, limit: 10 });
    const rows = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM false_event WHERE event_id=$1",
      [eventId]
    );
    assert.equal(Number(rows.rows[0].n), 0);
  } finally {
    await cleanup({ events: [eventId], rules: [] });
  }
});

test("sweep retires an open alert on the newly false event", async () => {
  const ids = { events: [] as number[], rules: [] as string[] };
  const ruleId = `rule-${next()}`;
  ids.rules.push(ruleId);
  try {
    await insertRule(ruleId);
    const eventId = await insertEvent("Town band concert");
    ids.events.push(eventId);
    await query(
      `INSERT INTO alert (rule_id, title, severity, event_id, status, evidence)
       VALUES ($1,'Alert on an unanchored event',4,$2,'open','{}'::jsonb)`,
      [ruleId, eventId]
    );
    const result = await sweepUnrecordedFalseEvents({ after: eventId - 1, limit: 10 });
    assert.ok(result.alertsClosed >= 1);
    const rows = await query<{ status: string; evidence: { false_event?: { reason?: string } } }>(
      "SELECT status, evidence FROM alert WHERE event_id=$1",
      [eventId]
    );
    assert.equal(rows.rows[0].status, "resolved");
    assert.equal(rows.rows[0].evidence.false_event?.reason, FALSE_REASON);
  } finally {
    await cleanup(ids);
  }
});

test("repeating the sweep keeps a single decision row", async () => {
  const eventId = await insertEvent("Harvest fair programme");
  try {
    await sweepUnrecordedFalseEvents({ after: eventId - 1, limit: 10 });
    await sweepUnrecordedFalseEvents({ after: eventId - 1, limit: 10 });
    const rows = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM false_event WHERE event_id=$1",
      [eventId]
    );
    assert.equal(Number(rows.rows[0].n), 1);
  } finally {
    await cleanup({ events: [eventId], rules: [] });
  }
});
