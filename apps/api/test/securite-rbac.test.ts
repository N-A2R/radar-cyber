/**
 * Matrice de rôles appliquée route par route, et traçabilité des refus.
 *
 * Le serveur de test n'enregistre que quelques routes, mais ce sont les vraies
 * règles de `POLITIQUE_ACCES` qui sont exercées : un changement de niveau
 * dans la matrice change immédiatement le résultat de ces appels.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import { installErrorHandler } from "../src/errors.js";
import { installAccessControl } from "../src/security/rbac.js";
import { lireJournal } from "../src/journal/index.js";

const TAG = `rbac${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TOKENS: Record<string, string> = {};
const IDS: Record<string, number> = {};

let app: FastifyInstance;

before(async () => {
  for (const role of ["lecteur", "analyste", "admin"]) {
    const email = `${role}-${TAG}@rbac.test`;
    const u = await query<{ id: number }>(
      "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x',$2) RETURNING id",
      [email, role],
    );
    IDS[role] = Number(u.rows[0]!.id);
    TOKENS[role] = `tok-${role}-${TAG}`;
    await query(
      "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
      [hashSessionToken(TOKENS[role]!), IDS[role]],
    );
  }

  app = Fastify({ logger: false });
  installErrorHandler(app);
  installAccessControl(app);
  const reponse = async () => ({ ok: true });
  app.get("/api/health", reponse);
  app.get("/api/orgs/liees", reponse);
  app.get("/api/review/queue", reponse);
  app.get("/api/audit/acces", reponse);
  app.post("/api/rectifications", reponse);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM app_session WHERE user_id = ANY($1::int[])", [Object.values(IDS)]);
  await query("DELETE FROM app_user WHERE id = ANY($1::int[])", [Object.values(IDS)]);
  await closePools();
});

function headers(role?: string) {
  return role ? { authorization: `Bearer ${TOKENS[role]}` } : {};
}

test("lecture publique sans jeton, avec identifiant de corrélation rendu", async () => {
  const res = await app.inject({ method: "GET", url: "/api/health", headers: { "x-request-id": "test-rbac-1" } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["x-request-id"], "test-rbac-1");
});

test("lecture lecteur : anonyme 401, tous les rôles authentifiés passent", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/api/orgs/liees" })).statusCode, 401);
  for (const role of ["lecteur", "analyste", "admin"]) {
    const res = await app.inject({ method: "GET", url: "/api/orgs/liees", headers: headers(role) });
    assert.equal(res.statusCode, 200, `${role} devrait lire la fiche`);
  }
});

test("file de revue : lecteur 403, analyste et admin 200", async () => {
  const lecteur = await app.inject({ method: "GET", url: "/api/review/queue", headers: headers("lecteur") });
  assert.equal(lecteur.statusCode, 403);
  assert.match(lecteur.json().error.message, /analyste requis/);
  for (const role of ["analyste", "admin"]) {
    assert.equal((await app.inject({ method: "GET", url: "/api/review/queue", headers: headers(role) })).statusCode, 200);
  }
});

test("audit des accès : admin seul", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/api/audit/acces", headers: headers("analyste") })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/api/audit/acces", headers: headers("admin") })).statusCode, 200);
});

test("jeton invalide ou expiré : 401, pas de contournement par rôle", async () => {
  const res = await app.inject({
    method: "GET", url: "/api/audit/acces", headers: { authorization: "Bearer jeton-inexistant" },
  });
  assert.equal(res.statusCode, 401);
});

test("route API non déclarée : 404 et refus audité", async () => {
  const res = await app.inject({ method: "GET", url: "/api/route-oubliée", headers: { "x-request-id": "rbac-inconnue" } });
  assert.equal(res.statusCode, 404);
  const { rows } = await query<{ decision: string; motif: string; statut: number; ip_hash: string }>(
    "SELECT decision, motif, statut, ip_hash FROM access_log WHERE correlation_id=$1",
    ["rbac-inconnue"],
  );
  assert.equal(rows[0]?.decision, "refuse");
  assert.equal(rows[0]?.statut, 404);
  assert.match(rows[0]?.motif ?? "", /non déclarée/);
  assert.match(rows[0]?.ip_hash ?? "", /^[0-9a-f]{32}$/, "l'IP n'est pas stockée en clair");
});

test("chaque refus est aussi un fait du journal de vérité", async () => {
  const refus = await app.inject({
    method: "GET", url: "/api/review/queue", headers: { ...headers("lecteur"), "x-request-id": "rbac-refus-journal" },
  });
  assert.equal(refus.statusCode, 403);
  const entrees = await lireJournal({ kind: "acces.refus", subject: "acces:rbac-refus-journal" });
  assert.equal(entrees.length, 1);
  assert.equal(entrees[0]?.payload.statut, 403);
  assert.equal(entrees[0]?.payload.role, "lecteur");
});

test("les lignes du journal des accès ne se réécrivent pas", async () => {
  await assert.rejects(
    query("UPDATE access_log SET statut=200 WHERE correlation_id='rbac-inconnue'"),
    /ne se réécrivent pas/,
  );
});
