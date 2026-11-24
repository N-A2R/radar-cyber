import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import flowsRoute from "../src/routes/flows.js";

let app: FastifyInstance;
const prefix = `flows-${randomBytes(6).toString("hex")}`;
const ids: number[] = [];

before(async () => {
  app = Fastify({ logger: false });
  await app.register(flowsRoute, { prefix: "/api" });
  await app.ready();

  const rows = [
    { name: `${prefix}-loin-a`, slug: `${prefix}-loin-a`, lat: 44.9, lon: -0.7 },
    { name: `${prefix}-loin-b`, slug: `${prefix}-loin-b`, lat: 44.7, lon: -0.4 },
    { name: `${prefix}-centre`, slug: `${prefix}-centre`, lat: 44.84, lon: -0.58 },
    { name: `${prefix}-hors-region`, slug: `${prefix}-hors-region`, lat: 48.85, lon: 2.35 },
  ];
  for (const [index, row] of rows.entries()) {
    const result = await query<{ id: number }>(
      `INSERT INTO org (name, slug, kind, dept, lat, lon)
       VALUES ($1, $2, 'entreprise', $3, $4, $5) RETURNING id`,
      [row.name, row.slug, index === 3 ? "75" : "33", row.lat, row.lon],
    );
    ids.push(Number(result.rows[0]!.id));
  }
});

after(async () => {
  if (app) await app.close();
  if (ids.length > 0) await query("DELETE FROM org WHERE id = ANY($1::int[])", [ids]);
  await closePools();
});

test("organisation flows are filtered, counted and limited in SQL", async () => {
  const limited = await app.inject({ method: "GET", url: "/api/flows?mode=orgs&limit=1" });
  assert.equal(limited.statusCode, 200, limited.body);
  const one = limited.json();
  assert.equal(one.arcs.length, 1);
  assert.equal(one.total, 2);
  assert.equal(one.truncated, true);
  assert.equal(one.arcs[0].id, `org-${ids[0]}`);

  const complete = await app.inject({ method: "GET", url: "/api/flows?mode=orgs&limit=10" });
  assert.equal(complete.statusCode, 200, complete.body);
  const all = complete.json();
  assert.deepEqual(all.arcs.map((arc: { id: string }) => arc.id), [`org-${ids[0]}`, `org-${ids[1]}`]);
  assert.equal(all.total, 2);
  assert.equal(all.truncated, false);
});
