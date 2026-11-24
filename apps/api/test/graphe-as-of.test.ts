/**
 * One test per observable behavior of as-of graph access.
 * Runs on the ephemeral test database: no production row, no victim data.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import graphAsOfRoute from "../src/routes/graph-as-of.js";
import type { GraphAsOfResult } from "../src/graph/as-of.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `ga${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EARLY = "2024-01-15T10:00:00.000Z";
const LATE = "2026-01-15T10:00:00.000Z";
const ORG_END = "2025-06-01T00:00:00.000Z";
const END = "2026-11-22T00:00:00.000Z";
const VICTIM = "Victim name must never be exposed";

let app: FastifyInstance;
let naOrgId: number;
let outsideOrgId: number;
let earlyEventId: number;
let lateEventId: number;

const get = async (url: string): Promise<GraphAsOfResult> => {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200, res.body);
  return res.json<GraphAsOfResult>();
};

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url) VALUES ($1, $2, 'ransomware', 'https://example.invalid/ga')`,
    [TAG, `As-of source ${TAG}`],
  );
  const na = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain, valid_from, valid_to)
     VALUES ($1, $2, 'entreprise', 'Gironde', $3, $4, $5) RETURNING id`,
    [`NA org ${TAG}`, `na-asof-${TAG}`, `na-${TAG}.test`, EARLY, ORG_END],
  );
  naOrgId = na.rows[0]!.id;
  const outside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain, valid_from)
     VALUES ($1, $2, 'entreprise', 'Paris', $3, $4) RETURNING id`,
    [`Outside org ${TAG}`, `outside-asof-${TAG}`, `outside-${TAG}.test`, EARLY],
  );
  outsideOrgId = outside.rows[0]!.id;

  for (const [key, when, group, orgId] of [
    ["early", EARLY, "lockbit3", naOrgId],
    ["late", LATE, "qilin", naOrgId],
    ["outside", LATE, "qilin", outsideOrgId],
  ] as const) {
    const inserted = await query<{ id: number }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, org_id,
                          source_url, evidence)
       VALUES ($1, 'ransomware', 'observation', $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        `${TAG}-${key}`,
        `Leak at ${VICTIM}`,
        when,
        TAG,
        orgId,
        `https://example.invalid/ga/${TAG}/${key}`,
        JSON.stringify({ group, vendor: "Apache", product: "Http Server", run_id: "1" }),
      ],
    );
    if (key === "early") earlyEventId = inserted.rows[0]!.id;
    if (key === "late") lateEventId = inserted.rows[0]!.id;
  }
  await query("SELECT refresh_temporal_graph_complete()");
  app = Fastify();
  await app.register(graphAsOfRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await supprimerEvenementsArchivees("dedup_key LIKE $1", [`${TAG}-%`]);
  await query("DELETE FROM org WHERE id IN ($1, $2)", [naOrgId, outsideOrgId]);
  await query("DELETE FROM source WHERE id = $1", [TAG]);
  await query("SELECT refresh_temporal_graph_complete()");
  await closePools();
});

test("returns only relations valid at the requested date", async () => {
  const result = await get(`/api/graph/as-of?at=${encodeURIComponent(EARLY)}&limit=1000`);
  const sources = result.relations.map((relation) => relation.source);
  assert.ok(sources.includes(`event:${earlyEventId}`));
  assert.ok(!sources.includes(`event:${lateEventId}`));
  assert.equal(result.window, null);
  assert.ok(result.summary.returnedRelations > 0);
});

test("a closed relation disappears after its measured end date", async () => {
  const before = await get(
    `/api/graph/as-of?at=2025-05-31T23:59:59Z&type=located_in&node=org%3A${naOrgId}`,
  );
  const afterEnd = await get(
    `/api/graph/as-of?at=2025-06-01T00:00:00Z&type=located_in&node=org%3A${naOrgId}`,
  );
  assert.ok(before.relations.some((relation) => relation.type === "located_in"));
  assert.equal(afterEnd.relations.length, 0);
});

test("a three-year window reports monthly openings and closures", async () => {
  const result = await get(
    `/api/graph/as-of?at=${encodeURIComponent(END)}&window=3y&limit=1`,
  );
  assert.equal(result.window?.years, 3);
  assert.equal(result.window?.from, "2023-11-22T00:00:00.000Z");
  assert.ok(result.summary.changes! > 0);
  assert.ok(result.summary.opened! > 0);
  const byMonth = new Map(result.summary.monthlyChanges.map((m) => [m.month, m]));
  assert.ok(byMonth.get("2024-01")!.opened > 0);
  assert.ok(byMonth.get("2025-06")!.closed > 0);
});

test("organizations outside Nouvelle-Aquitaine stay invisible", async () => {
  const result = await get(
    `/api/graph/as-of?at=${encodeURIComponent(END)}&node=org%3A${outsideOrgId}&limit=1000`,
  );
  assert.equal(result.relations.length, 0);
  const all = await get(`/api/graph/as-of?at=${encodeURIComponent(END)}&limit=1000`);
  assert.ok(!JSON.stringify(all.relations).includes(`org:${outsideOrgId}`));
});

test("victim names and event titles never leave the route", async () => {
  const result = await get(`/api/graph/as-of?at=${encodeURIComponent(EARLY)}&limit=1000`);
  const body = JSON.stringify(result);
  assert.ok(!body.includes(VICTIM));
  for (const relation of result.relations) {
    assert.deepEqual(Object.keys(relation).sort(), [
      "source", "target", "type", "validFrom", "validTo",
    ]);
  }
});

test("type and node filters narrow the result", async () => {
  const result = await get(
    `/api/graph/as-of?at=${encodeURIComponent(LATE)}&type=targeted_by&node=org%3A${naOrgId}&limit=1000`,
  );
  assert.ok(result.relations.length > 0);
  assert.ok(result.relations.every((relation) => relation.type === "targeted_by"));
  assert.ok(result.relations.every((relation) => relation.source === `org:${naOrgId}`));
});

test("malformed parameters are rejected", async () => {
  for (const url of [
    "/api/graph/as-of?at=not-a-date",
    `/api/graph/as-of?at=${encodeURIComponent(END)}&window=5y`,
    `/api/graph/as-of?at=${encodeURIComponent(END)}&limit=0`,
  ]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 400, url);
  }
});
