/** End-to-end behaviour of GET /api/search/ask on an isolated test database. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import askRoute from "../src/routes/ask.js";

const TAG = `ask${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const STAR = "quelles attaques ont touché les hôpitaux de Gironde en 2026";
let app: FastifyInstance;
let insideOrgId: number;
let outsideOrgId: number;
let insideEventId: number;
let outsideEventId: number;

before(async () => {
  await query(
    "INSERT INTO source (id, name, family, url, retain_raw) VALUES ($1, $2, 'ransomware', 'https://example.test/s', false)",
    [SOURCE, `Source ${TAG}`],
  );
  const inside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, status)
     VALUES ($1, $2, 'sante', 'sante', 'Angoulême', '16', 'confirme') RETURNING id`,
    [`Centre Hospitalier ${TAG}`, `${TAG}-inside`],
  );
  const outside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, status)
     VALUES ($1, $2, 'sante', 'sante', 'Rennes', '35', 'confirme') RETURNING id`,
    [`Hôpital ${TAG}`, `${TAG}-outside`],
  );
  insideOrgId = Number(inside.rows[0].id);
  outsideOrgId = Number(outside.rows[0].id);
  for (const [key, title, orgId] of [
    [`${TAG}-inside`, `Ransomware : Centre Hospitalier ${TAG}`, insideOrgId],
    [`${TAG}-outside`, `Ransomware : Hôpital ${TAG}`, outsideOrgId],
  ] as const) {
    const inserted = await query<{ id: number }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, org_id)
       VALUES ($1, 'ransomware', 'confirmed_incident', $2, '2026-05-05T00:00:00Z', $3, $4)
       RETURNING id`,
      [key, title, SOURCE, orgId],
    );
    if (key === `${TAG}-inside`) insideEventId = Number(inserted.rows[0].id);
    else outsideEventId = Number(inserted.rows[0].id);
  }
  app = Fastify();
  await app.register(askRoute);
  await app.ready();
});

after(async () => {
  await app.close();
  await query("DELETE FROM event WHERE source_id = $1", [SOURCE]);
  await query("DELETE FROM org WHERE id IN ($1, $2)", [insideOrgId, outsideOrgId]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE]);
  await closePools();
});

async function ask(question: string): Promise<{ statusCode: number; json: () => Record<string, any> }> {
  return app.inject({ method: "GET", url: `/search/ask?q=${encodeURIComponent(question)}` });
}

test("the star question returns the four source-backed Gironde incidents", async () => {
  const res = await ask(STAR);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.filters, {
    departments: ["33"], years: [2026], intent: "attacks", sector: "health", regionOnly: true,
  });
  assert.deepEqual(body.hits.map((hit: { id: string }) => hit.id), [
    "corpus:gir-couv-014", "corpus:gir-couv-013", "corpus:gir-couv-004", "corpus:gir-couv-012",
  ]);
  assert.match(body.answer, /4 healthcare cyberattacks in 2026/);
});

test("a live Nouvelle-Aquitaine event is found by its sector and department", async () => {
  const res = await ask("attaques contre les hôpitaux de Charente en 2026");
  const body = res.json();
  assert.ok(
    body.hits.some((hit: { id: string }) => hit.id === `event:${insideEventId}`),
    `expected event:${insideEventId}, got ${JSON.stringify(body.hits.map((hit: { id: string }) => hit.id))} (answer: ${body.answer})`,
  );
});

test("an event outside Nouvelle-Aquitaine is never returned", async () => {
  const res = await ask("attaques contre les hôpitaux en 2026");
  const body = res.json();
  assert.ok(!body.hits.some((hit: { id: string }) => hit.id === `event:${outsideEventId}`));
});

test("a question too short to parse is rejected", async () => {
  const res = await ask("a");
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, "INVALID_QUESTION");
});

test("the response is English and contains no victim personal-data field", async () => {
  const res = await ask(STAR);
  const body = res.json();
  assert.match(body.answer, /Nouvelle-Aquitaine corpus/);
  const forbidden = ["extrait", "resume", "evidence", "victimes", "summary", "confiance"];
  for (const key of forbidden) {
    assert.equal(JSON.stringify(body).includes(`"${key}"`), false, `field ${key} leaked`);
  }
  const allowed = ["id", "source", "date", "title", "organisation", "department", "family", "publisher", "url"];
  for (const hit of body.hits) {
    assert.deepEqual(Object.keys(hit).sort(), [...allowed].sort());
  }
});
