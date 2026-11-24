/**
 * Contrat du handler global d'erreurs : toute erreur HTTP, y compris une
 * contrainte Postgres, répond { error: { code, message, details } }.
 * Rejouer : pnpm -F @radar/api test -- test/erreurs-api.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { closePools, query } from "../src/db.js";
import { installErrorHandler, badRequest, conflict } from "../src/errors.js";

const TAG = `err${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EMAIL = `${TAG}@erreurs.test`;
const TOKEN = `${TAG}-session`;

/** Schéma du contrat : aucune clé en plus, aucune clé manquante. */
const ErrorEnvelope = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown(),
  }),
});

let app: FastifyInstance;

before(async () => {
  app = Fastify({ logger: false });
  installErrorHandler(app);
  await app.register(async (probe) => {
    probe.get("/probe/bad-request", async () => { throw badRequest("invalid id"); });
    probe.get("/probe/conflict", async () => { throw conflict("already decided"); });
    probe.get("/probe/boom", async () => { throw new Error("boom"); });
    probe.post("/probe/duplicate", async () => {
      const sql = "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur')";
      await query(sql, [EMAIL]);
      await query(sql, [EMAIL]);
    });
    probe.post("/probe/fk", async () => {
      await query(
        "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,999999999, now() + interval '1 hour')",
        [TOKEN],
      );
    });
  });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
  await query("DELETE FROM app_session WHERE token=$1", [TOKEN]);
  await closePools();
});

function assertErrorShape(body: unknown, status: number): z.infer<typeof ErrorEnvelope>["error"] {
  const parsed = ErrorEnvelope.safeParse(body);
  assert.ok(parsed.success, `enveloppe invalide : ${JSON.stringify(body)}`);
  assert.deepEqual(Object.keys(parsed.data.error).sort(), ["code", "details", "message"]);
  assert.equal(status >= 400, true);
  return parsed.data.error;
}

test("404, 400 et 409 ont exactement la même forme", async () => {
  const cas = [
    ["GET", "/api/route-inexistante", 404],
    ["GET", "/probe/bad-request", 400],
    ["GET", "/probe/conflict", 409],
  ] as const;
  const formes: string[][] = [];
  for (const [method, url, status] of cas) {
    const res = await app.inject({ method, url });
    assert.equal(res.statusCode, status, `${url} : ${res.body}`);
    assertErrorShape(res.json(), status);
    formes.push(Object.keys(ErrorEnvelope.parse(res.json()).error).sort());
  }
  assert.deepEqual(formes[0], formes[1]);
  assert.deepEqual(formes[1], formes[2]);
});

test("codes et messages distincts derrière la même enveloppe", async () => {
  const notFound = await app.inject({ method: "GET", url: "/api/route-inexistante" });
  assert.equal(assertErrorShape(notFound.json(), 404).code, "NOT_FOUND");
  const badRequestRes = await app.inject({ method: "GET", url: "/probe/bad-request" });
  assert.equal(assertErrorShape(badRequestRes.json(), 400).code, "BAD_REQUEST");
  const conflictRes = await app.inject({ method: "GET", url: "/probe/conflict" });
  assert.equal(assertErrorShape(conflictRes.json(), 409).code, "CONFLICT");
});

test("23505 (doublon) devient 409 DUPLICATE_KEY sans détails Postgres", async () => {
  const res = await app.inject({ method: "POST", url: "/probe/duplicate" });
  assert.equal(res.statusCode, 409, res.body);
  const error = assertErrorShape(res.json(), 409);
  assert.equal(error.code, "DUPLICATE_KEY");
  assert.doesNotMatch(res.body, /constraint|already exists|app_user_email_key/);
});

test("23503 (clé étrangère) devient 422 FOREIGN_KEY_VIOLATION sans détails Postgres", async () => {
  const res = await app.inject({ method: "POST", url: "/probe/fk" });
  assert.equal(res.statusCode, 422, res.body);
  const error = assertErrorShape(res.json(), 422);
  assert.equal(error.code, "FOREIGN_KEY_VIOLATION");
  assert.doesNotMatch(res.body, /constraint|violates foreign key/);
});

test("une erreur inattendue reste dans la même enveloppe", async () => {
  const res = await app.inject({ method: "GET", url: "/probe/boom" });
  assert.equal(res.statusCode, 500, res.body);
  const error = assertErrorShape(res.json(), 500);
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.equal(error.message, "internal server error");
});
