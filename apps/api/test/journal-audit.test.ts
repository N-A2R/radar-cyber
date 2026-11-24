/**
 * Audit journal JSON route: every decision kind, the same filters as the CSV
 * export, stable cursor pagination and explicit validation errors.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import journalRoute from "../src/routes/journal.js";

const TAG = `audit${randomBytes(6).toString("hex")}`;
const EMAIL = `${TAG}@journal.test`;
const TOKEN = `tok-${TAG}`;
let app: FastifyInstance;
let reference: { instant: Date; jour: string };

type Reponse = {
  rows: Array<{
    id: number; kind: string; sujet: string; acteur: string; horodatage: string;
    decision: string | null; indice: string | null; raison: string | null;
    resume: string | null; preuve: Record<string, unknown>;
  }>;
  limite: number;
  offset: number;
  total: number;
  avant: number | null;
};

async function get(url: string): Promise<{ statusCode: number; json: Reponse }> {
  const res = await app.inject({
    method: "GET", url, headers: { authorization: `Bearer ${TOKEN}` },
  });
  return { statusCode: res.statusCode, json: res.json<Reponse>() };
}

async function ecrire(kind: string, sujet: string, acteur: string, payload: unknown, recordedAt: Date): Promise<void> {
  await query(
    `INSERT INTO journal (kind, subject, summary, actor, payload, recorded_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::timestamptz)`,
    [kind, sujet, `summary ${TAG}`, acteur, JSON.stringify(payload), recordedAt],
  );
}

before(async () => {
  reference = (await query<{ instant: Date; jour: string }>(
    `SELECT now() AS instant, (now() AT TIME ZONE 'UTC')::date::text AS jour`,
  )).rows[0]!;
  await query(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur')",
    [EMAIL],
  );
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,(SELECT id FROM app_user WHERE email=$2), now() + interval '1 hour')",
    [hashSessionToken(TOKEN), EMAIL],
  );
  await ecrire("review.decided", `quarantine:${TAG}-1`, `humain:${EMAIL}`, {
    decision: "accepter", reason: `${TAG}-accept`, orgId: 10,
  }, reference.instant);
  await ecrire("review.decided", `quarantine:${TAG}-2`, `moteur:${TAG}`, {
    action: "reject", reason: `${TAG}-reject`,
  }, reference.instant);
  await ecrire("org.created", `org:${TAG}`, `moteur:${TAG}`, {
    preuve: `${TAG}-proof`, orgId: 11,
  }, reference.instant);
  await ecrire("org.changed", `org:${TAG}`, `moteur:${TAG}`, {
    changements: { name: `${TAG}-rename` },
  }, reference.instant);
  await ecrire("alert.changed", `alert:${TAG}`, `moteur:${TAG}`, {
    agent: TAG, score: 0.9,
  }, reference.instant);
  app = Fastify();
  await app.register(journalRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
  await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
  // The journal is append-only; the runner drops the disposable database.
  await closePools();
});

test("route audit: authentification requise", async () => {
  const res = await app.inject({ method: "GET", url: "/api/journal/review" });
  assert.equal(res.statusCode, 401);
});

test("route audit: all kinds by default, with kind and payload exposed", async () => {
  const { statusCode, json } = await get(
    `/api/journal/review?acteur=${encodeURIComponent(TAG)}&limite=500`,
  );
  assert.equal(statusCode, 200);
  const kinds = new Set(json.rows.map((row) => row.kind));
  for (const kind of ["review.decided", "org.created", "org.changed", "alert.changed"]) {
    assert.ok(kinds.has(kind), `kind ${kind} missing from ${[...kinds].join(", ")}`);
  }
  const review = json.rows.find((row) => row.kind === "review.decided" && row.decision === "accepter");
  assert.ok(review);
  assert.equal(review.resume, `summary ${TAG}`);
  assert.equal(review.preuve.orgId, 10);
  assert.equal(json.avant, null);
});

test("route audit: categories mirror the export filters", async () => {
  const acteur = `acteur=${encodeURIComponent(TAG)}`;
  const review = await get(`/api/journal/review?${acteur}&kind=review&limite=500`);
  assert.ok(review.json.rows.every((row) => row.kind === "review.decided"));
  assert.ok(review.json.rows.some((row) => row.decision === "refuser"));

  const publication = await get(`/api/journal/review?${acteur}&kind=publication&limite=500`);
  assert.ok(publication.json.rows.every((row) =>
    ["org.created", "alert.changed", "event.admitted"].includes(row.kind)));
  assert.ok(publication.json.rows.some((row) => row.kind === "alert.changed"));

  const correction = await get(`/api/journal/review?${acteur}&kind=correction&limite=500`);
  assert.ok(correction.json.rows.every((row) =>
    ["org.changed", "match.refuse", "match.decided", "event.rattachement"].includes(row.kind)));
  assert.ok(correction.json.rows.some((row) => row.kind === "org.changed"));
});

test("route audit: actor and search reach the raw evidence", async () => {
  const parActeur = await get(`/api/journal/review?acteur=${encodeURIComponent(TAG.toUpperCase())}&limite=500`);
  assert.ok(parActeur.json.rows.length >= 5);

  const parPreuve = await get(`/api/journal/review?q=${encodeURIComponent(`${TAG}-proof`)}&limite=500`);
  assert.deepEqual(parPreuve.json.rows.map((row) => row.kind), ["org.created"]);

  const parRaison = await get(`/api/journal/review?q=${encodeURIComponent(`${TAG}-accept`)}&limite=500`);
  assert.equal(parRaison.json.rows.length, 1);
  assert.equal(parRaison.json.rows[0].decision, "accepter");

  const sansResultat = await get(`/api/journal/review?q=${encodeURIComponent(`${TAG}-absent`)}&limite=500`);
  assert.deepEqual(sansResultat.json.rows, []);
  assert.equal(sansResultat.json.avant, null);
});

test("route audit: inclusive date bounds on the UTC day", async () => {
  const jour = reference.jour;
  const dans = await get(
    `/api/journal/review?acteur=${encodeURIComponent(TAG)}&du=${jour}&au=${jour}&limite=500`,
  );
  assert.ok(dans.json.rows.length >= 5);
  const hors = await get(
    `/api/journal/review?acteur=${encodeURIComponent(TAG)}&du=2999-01-01&au=2999-01-02`,
  );
  assert.deepEqual(hors.json.rows, []);
});

test("route audit: cursor pagination keeps the filters", async () => {
  const url = `/api/journal/review?acteur=${encodeURIComponent(TAG)}&kind=review&limite=1`;
  const premiere = await get(url);
  assert.equal(premiere.json.rows.length, 1);
  assert.equal(premiere.json.limite, 1);
  assert.ok(premiere.json.avant !== null);

  const suivante = await get(`${url}&avant=${premiere.json.avant}`);
  assert.equal(suivante.json.rows.length, 1);
  assert.notEqual(suivante.json.rows[0].id, premiere.json.rows[0].id);
  assert.ok(suivante.json.rows.every((row) => row.kind === "review.decided"));
});

test("route audit: page size, offset and total come from SQL", async () => {
  const acteur = `acteur=${encodeURIComponent(TAG)}`;
  const complet = await get(`/api/journal/review?${acteur}&limite=500`);
  const total = complet.json.total;
  assert.ok(total >= 5, "le total doit compter toutes les lignes filtrées");
  assert.equal(complet.json.rows.length, total);

  const revues = await get(`/api/journal/review?${acteur}&kind=review&limite=500`);
  assert.equal(revues.json.total, revues.json.rows.length);
  assert.ok(revues.json.total >= 2);

  const page = await get(`/api/journal/review?${acteur}&limit=2&offset=1`);
  assert.equal(page.json.total, total);
  assert.equal(page.json.limite, 2);
  assert.equal(page.json.offset, 1);
  assert.equal(page.json.rows.length, Math.min(2, total - 1));
  assert.equal(page.json.rows[0].id, complet.json.rows[1].id);

  const cinq = await get(`/api/journal/review?${acteur}&limit=5`);
  assert.equal(cinq.json.limite, 5);
  assert.equal(cinq.json.rows.length, Math.min(5, total));
});

test("route audit: invalid filters are rejected", async () => {
  assert.equal((await app.inject({
    method: "GET", url: "/api/journal/review?du=21-11-2026",
    headers: { authorization: `Bearer ${TOKEN}` },
  })).statusCode, 400);
  assert.equal((await app.inject({
    method: "GET", url: "/api/journal/review?limite=5000",
    headers: { authorization: `Bearer ${TOKEN}` },
  })).statusCode, 400);
  assert.equal((await app.inject({
    method: "GET", url: "/api/journal/review?kind=aucun@type",
    headers: { authorization: `Bearer ${TOKEN}` },
  })).statusCode, 400);
});
