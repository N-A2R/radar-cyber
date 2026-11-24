/** Une affirmation rendue = un identifiant d'événement réel + une source + un run. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";
import { answerAnchored } from "../src/search/anchored-answer.js";
import askFrRoute from "../src/routes/ask-fr.js";

const TAG = `ancre${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const URL = `https://example.invalid/${TAG}/piece`;
let insideOrgId: number;
let outsideOrgId: number;
let insideEventId: number;
let outsideEventId: number;
let app: FastifyInstance;

before(async () => {
  await query(
    "INSERT INTO source (id, name, family, url, retain_raw) VALUES ($1, $2, 'cert', 'https://example.invalid', false)",
    [SOURCE, `Source ${TAG}`],
  );
  const inside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, status)
     VALUES ($1, $2, 'sante', 'sante', 'Angoulême', '16', 'confirme') RETURNING id`,
    [`Hôpital ${TAG}`, `${TAG}-inside`],
  );
  const outside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, status)
     VALUES ($1, $2, 'sante', 'sante', 'Rennes', '35', 'confirme') RETURNING id`,
    [`Hôpital ${TAG} extérieur`, `${TAG}-outside`],
  );
  insideOrgId = Number(inside.rows[0].id);
  outsideOrgId = Number(outside.rows[0].id);
  for (const [key, orgId] of [
    [`${TAG}-inside`, insideOrgId],
    [`${TAG}-outside`, outsideOrgId],
  ] as const) {
    const inserted = await query<{ id: number }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, org_id, source_url, evidence)
       VALUES ($1, 'cert', 'confirmed_incident', $2, '2026-05-05T00:00:00Z', $3, $4, $5, '{"run_id":"1"}'::jsonb)
       RETURNING id`,
      [key, `Avis de sécurité ${TAG}`, SOURCE, orgId, URL],
    );
    if (key === `${TAG}-inside`) insideEventId = Number(inserted.rows[0].id);
    else outsideEventId = Number(inserted.rows[0].id);
  }
  app = Fastify();
  await app.register(askFrRoute);
  await app.ready();
});

after(async () => {
  await app.close();
  await supprimerEvenementsArchivees("source_id = $1", [SOURCE]);
  await query("DELETE FROM org WHERE id IN ($1, $2)", [insideOrgId, outsideOrgId]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE]);
  await closePools();
});

const QUESTION = `quels événements concernent Hôpital ${TAG} en Charente en 2026 ?`;

test("la réponse française cite l'identifiant de l'événement et sa preuve", async () => {
  const answer = await answerAnchored(QUESTION);
  assert.equal(answer.status, "source-backed");
  assert.equal(answer.filters.departments[0], "16");
  assert.deepEqual(answer.filters.years, [2026]);
  assert.ok(
    answer.citedEventIds.includes(insideEventId),
    `événement attendu ${insideEventId}, obtenu ${JSON.stringify(answer.citedEventIds)}`,
  );
  const assertion = answer.assertions.find((item) => item.source.eventId === insideEventId);
  assert.ok(assertion);
  assert.equal(assertion.id, `event:${insideEventId}`);
  assert.match(assertion.phrase, /Le 05\/05\/2026/);
  assert.match(assertion.phrase, new RegExp(`\\[event:${insideEventId}\\]`));
  assert.match(assertion.phrase, new RegExp(URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(assertion.source.runId, "1");
  assert.equal(assertion.source.url, URL);
});

test("chaque identifiant cité existe dans event au rejeu", async () => {
  const answer = await answerAnchored(QUESTION);
  assert.ok(answer.citedEventIds.length > 0);
  const found = await query<{ id: number }>("SELECT id FROM event WHERE id = ANY($1::bigint[])", [answer.citedEventIds]);
  const existing = new Set(found.rows.map((row) => Number(row.id)));
  for (const id of answer.citedEventIds) {
    assert.equal(existing.has(id), true, `identifiant cité introuvable : ${id}`);
  }
});

test("aucune affirmation n'est rendue sans source ni run de collecte", async () => {
  const answer = await answerAnchored(QUESTION);
  assert.ok(answer.assertions.length > 0);
  for (const assertion of answer.assertions) {
    assert.match(assertion.phrase, /^Le .*Preuve : \[event:\d+\] — source .+, run de collecte \d+\.$/);
    assert.ok(assertion.source.url.startsWith("https://"));
    assert.ok(assertion.source.sourceId.length > 0);
    assert.ok(assertion.source.runId.length > 0);
  }
});

test("un événement hors Nouvelle-Aquitaine n'est jamais cité", async () => {
  const answer = await answerAnchored(QUESTION);
  assert.equal(answer.citedEventIds.includes(outsideEventId), false);
});

test("aucune réponse ne contient de champ de donnée personnelle", async () => {
  const answer = await answerAnchored(QUESTION);
  const raw = JSON.stringify(answer);
  for (const field of ["summary", "evidence", "extrait", "resume", "confiance", "victimes"]) {
    assert.equal(raw.includes(`"${field}"`), false, `champ Interdit : ${field}`);
  }
});

test("une question sans événement ne cite rien et ne formule aucune affirmation", async () => {
  const answer = await answerAnchored(`quels événements concernent la commune introuvable ${TAG}xyzzz en Gironde en 2019 ?`);
  assert.equal(answer.status, "no-event");
  assert.equal(answer.answer, "");
  assert.deepEqual(answer.assertions, []);
  assert.deepEqual(answer.citedEventIds, []);
});

test("la route répond en français et rejette une question trop courte", async () => {
  const ok = await app.inject({ method: "GET", url: `/search/ask-fr?q=${encodeURIComponent(QUESTION)}` });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().status, "source-backed");
  const bad = await app.inject({ method: "GET", url: "/search/ask-fr?q=a" });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error.code, "QUESTION_INVALIDE");
  assert.match(bad.json().error.message, /caractères/);
});
