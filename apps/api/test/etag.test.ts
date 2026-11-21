/**
 * ETag conditionnel sur les lectures JSON : un second appel identique avec
 * If-None-Match doit répondre 304 et ne rien transférer, y compris sur la file
 * de revue dont le corps contient une mesure `tookMs` variable.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import authRoute from "../src/routes/auth.js";
import todayRoute from "../src/routes/today.js";
import orgsLieesRoute from "../src/routes/orgs-liees.js";
import reviewRoute from "../src/routes/review.js";

const TAG = `etag${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EMAIL = `${TAG}@etag.test`;
const TOKEN = `tok-${TAG}`;
const auth = { authorization: `Bearer ${TOKEN}` };

let app: FastifyInstance;

before(async () => {
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
  await app.register(todayRoute, { prefix: "/api" });
  await app.register(orgsLieesRoute, { prefix: "/api" });
  await app.register(reviewRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
  await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
  await closePools();
});

for (const [url, headers] of [
  ["/api/today", {}],
  ["/api/orgs/liees", auth],
  ["/api/review/queue", auth],
  ["/api/review/stats", auth],
] as const) {
  test(`${url} : le second appel avec If-None-Match répond 304`, async () => {
    const premier = await app.inject({ method: "GET", url, headers });
    assert.equal(premier.statusCode, 200);
    assert.ok(premier.body.length > 0, "un corps est bien servi au premier appel");
    const etag = premier.headers.etag;
    assert.match(etag ?? "", /^"[A-Za-z0-9_-]{43}"$/, "ETag SHA-256 entre guillemets");

    const second = await app.inject({
      method: "GET",
      url,
      headers: { ...headers, "if-none-match": etag },
    });
    assert.equal(second.statusCode, 304);
    assert.equal(second.body, "");
    assert.equal(second.headers.etag, etag);
  });
}
