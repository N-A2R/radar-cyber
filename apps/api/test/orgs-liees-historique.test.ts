/**
 * GET /api/orgs/liees/historique : lecture des relevés quotidiens, borne
 * `jours`, et aucun point fabriqué quand la table ne contient rien.
 * Base de test éphémère créée par test/run.ts (aucune écriture en production).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import authRoute from "../src/routes/auth.js";
import historiqueRoute from "../src/routes/orgs-liees-historique.js";

const TAG = `hist${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EMAIL = `${TAG}@orgs-liees.test`;
const TOKEN = `tok-${TAG}`;
const auth = { authorization: `Bearer ${TOKEN}` };

let app: FastifyInstance;

before(async () => {
  await query(
    `INSERT INTO orgs_liees_historique (jour, semaine, total, en_attente, examinees)
     VALUES (current_date - 2, 10, 40, 3, 1),
            (current_date - 1, 14, 42, 4, 2),
            (current_date,     26, 46, 5, 3),
            (current_date - 40, 99, 99, 99, 99)`,
  );
  const user = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur') RETURNING id",
    [EMAIL],
  );
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(TOKEN), user.rows[0].id],
  );
  app = Fastify();
  await app.register(authRoute, { prefix: "/api" });
  await app.register(historiqueRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM orgs_liees_historique WHERE semaine IN (10, 14, 26, 99)");
  await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
  await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
  await closePools();
});

test("la route exige un jeton valide", async () => {
  for (const headers of [{}, { authorization: "Bearer jeton-inexistant" }]) {
    const res = await app.inject({ method: "GET", url: "/api/orgs/liees/historique", headers });
    assert.equal(res.statusCode, 401);
  }
});

test("les relevés des 30 derniers jours sont renvoyés du plus ancien au plus récent", async () => {
  const res = await app.inject({ method: "GET", url: "/api/orgs/liees/historique", headers: auth });
  assert.equal(res.statusCode, 200);
  const body = res.json<{ jours: number; points: { jour: string; semaine: number; enAttente: number }[] }>();
  assert.equal(body.jours, 30);
  assert.deepEqual(body.points.map((p) => p.semaine), [10, 14, 26], "le point à -40 j est hors fenêtre");
  assert.equal(body.points[0]?.enAttente, 3, "en_attente est exposé en camelCase");
  for (let i = 1; i < body.points.length; i++) {
    assert.ok(body.points[i - 1].jour < body.points[i].jour);
  }
});

test("le paramètre jours borne la fenêtre et refuse les valeurs invalides", async () => {
  const court = await app.inject({
    method: "GET", url: "/api/orgs/liees/historique?jours=2", headers: auth,
  });
  assert.equal(court.statusCode, 200);
  assert.deepEqual(court.json<{ points: { semaine: number }[] }>().points.map((p) => p.semaine), [14, 26]);

  for (const jours of ["abc", "0", "-1", "366", "1.5"]) {
    const res = await app.inject({
      method: "GET", url: `/api/orgs/liees/historique?jours=${jours}`, headers: auth,
    });
    assert.equal(res.statusCode, 400, `jours=${jours}`);
  }
});

test("sans relevé dans la fenêtre, la réponse est vide et non inventée", async () => {
  await query("DELETE FROM orgs_liees_historique WHERE jour >= current_date - 2");
  try {
    const res = await app.inject({ method: "GET", url: "/api/orgs/liees/historique", headers: auth });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json<{ points: unknown[] }>().points, []);
  } finally {
    await query(
      `INSERT INTO orgs_liees_historique (jour, semaine, total, en_attente, examinees)
       VALUES (current_date - 2, 10, 40, 3, 1),
              (current_date - 1, 14, 42, 4, 2),
              (current_date,     26, 46, 5, 3)`,
    );
  }
});
