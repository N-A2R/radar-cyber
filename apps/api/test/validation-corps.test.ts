/**
 * Validation des corps POST : contrat 400 détaillé sur toutes les routes
 * d'écriture auditées, et règle « pas de corps = {} accepté » sur les actions.
 *
 * Isolation : compte et jeton admin jetables, exactement comme dans
 * `contrat-routes.test.ts` ; les routes sont montées sur une instance Fastify
 * sans serveur ni collecteur. `after` retire le compte et ferme les pools.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { hashSessionToken } from "../src/auth.js";
import { resolveUser } from "../src/middleware/auth.js";
import alertsRoute from "../src/routes/alerts.js";
import authRoute from "../src/routes/auth.js";
import ingestRoute from "../src/routes/ingest.js";
import orgsRoute from "../src/routes/orgs.js";
import quarantineRoute from "../src/routes/quarantine.js";
import reviewRoute from "../src/routes/review.js";
import sourcesRoute from "../src/routes/sources.js";

const TAG = randomBytes(6).toString("hex");
const EMAIL = `validation-${TAG}@test.local`;
const TOKEN = randomBytes(24).toString("hex");
const HEADERS = { authorization: `Bearer ${TOKEN}` };

/** Routes dont le corps porte des champs obligatoires : {} doit être refusé. */
const REQUIRED_BODY = [
  "/api/auth/register",
  "/api/auth/login",
  "/api/ingest",
  "/api/quarantine/review",
  "/api/orgs/from-hint",
  "/api/review/refuser-sans-indice",
  "/api/review/1/decision",
  `/api/sources/source-inexistante-${TAG}/morte`,
] as const;

/** Actions sans corps : {} passe, une clé inconnue est refusée. */
const NO_BODY = [
  "/api/auth/logout",
  "/api/alerts/987654321/ack",
  "/api/alerts/987654321/resolve",
  "/api/quarantine/987654321/promote",
  `/api/sources/source-inexistante-${TAG}/reactiver`,
] as const;

type Detail = { path: string; message: string };

let app: FastifyInstance;
let userId: number;

/** `/auth/logout` supprime le jeton présenté : chaque appel reçoit le sien. */
async function sessionHeaders() {
  const token = randomBytes(24).toString("hex");
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(token), userId],
  );
  return { authorization: `Bearer ${token}` };
}

before(async () => {
  const inserted = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','admin') RETURNING id",
    [EMAIL],
  );
  userId = Number(inserted.rows[0].id);
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(TOKEN), userId],
  );

  app = Fastify({ logger: false });
  app.addHook("onRequest", async (req) => {
    const user = await resolveUser(req);
    if (user) req.user = user;
  });
  for (const plugin of [
    alertsRoute, authRoute, ingestRoute, orgsRoute,
    quarantineRoute, reviewRoute, sourcesRoute,
  ]) {
    await app.register(plugin, { prefix: "/api" });
  }
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM app_session WHERE user_id = $1", [userId]);
  await query("DELETE FROM app_user WHERE id = $1", [userId]);
  await closePools();
});
function assertInvalid(res: { statusCode: number; json(): unknown }, requirePath = true): Detail[] {
  assert.equal(res.statusCode, 400, JSON.stringify(res.json()).slice(0, 400));
  const body = res.json() as { error?: { message?: string; details?: Detail[] } };
  assert.equal(body.error?.message, "invalid input");
  const details = body.error?.details;
  assert.ok(Array.isArray(details) && details.length > 0, JSON.stringify(body));
  if (requirePath) {
    assert.ok(
      details.some((d) => typeof d.path === "string" && d.path.length > 0),
      JSON.stringify(details),
    );
  }
  return details!;
}
for (const url of REQUIRED_BODY) {
  test(`POST ${url} : corps vide -> 400 avec un chemin de champ`, async () => {
    const res = await app.inject({ method: "POST", url, headers: HEADERS, payload: {} });
    assertInvalid(res);
  });
}

for (const url of NO_BODY) {
  test(`POST ${url} : {} accepté, clé inconnue refusée`, async () => {
    const vide = await app.inject({
      method: "POST",
      url,
      headers: url === "/api/auth/logout" ? await sessionHeaders() : HEADERS,
      payload: {},
    });
    assert.notEqual(vide.statusCode, 400, `${url} : {} ne doit jamais être rejeté — ${vide.body}`);

    const etranger = await app.inject({
      method: "POST",
      url,
      headers: url === "/api/auth/logout" ? await sessionHeaders() : HEADERS,
      payload: { inattendu: "oui" },
    });
    // Zod 4 place les clés inattendues dans le message (issue.path est vide).
    const details = assertInvalid(etranger, false);
    assert.ok(details.some((d) => d.message.includes("inattendu")), JSON.stringify(details));
  });
}

test("POST /api/ingest : events: [] reste valide", async () => {
  const res = await app.inject({
    method: "POST", url: "/api/ingest", headers: HEADERS, payload: { events: [] },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().inserted, 0);
});
