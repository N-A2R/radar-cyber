/**
 * Le quota anonyme est clavé sur l'adresse client validée par Fastify, pas sur
 * un en-tête que n'importe quel client peut forger. Derrière un proxy de
 * confiance (`trustProxy`), deux X-Forwarded-For distincts ont deux quotas ;
 * sans proxy déclaré, l'en-tête est ignoré et tous partagent la même clé.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { adresseClient, clientKey, rateLimit } from "../src/middleware/rate-limit.js";

async function appAvecQuota(trustProxy?: string): Promise<FastifyInstance> {
  const app = Fastify(trustProxy ? { trustProxy } : {});
  app.get("/api/limite", { preHandler: rateLimit({ max: 2, windowMs: 60_000 }) }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

function envoi(app: FastifyInstance, adresse: string) {
  return app.inject({ url: "/api/limite", headers: { "x-forwarded-for": adresse } });
}

test("avec trustProxy, X-Forwarded-For sépare les quotas", async () => {
  const app = await appAvecQuota("127.0.0.1");
  try {
    for (const adresse of ["203.0.113.10", "203.0.113.11"]) {
      assert.equal((await envoi(app, adresse)).statusCode, 200, `premier appel ${adresse}`);
      assert.equal((await envoi(app, adresse)).statusCode, 200, `deuxième appel ${adresse}`);
    }
    const refuse = await envoi(app, "203.0.113.10");
    assert.equal(refuse.statusCode, 429, "le troisième appel de .10 doit être refusé");
    assert.match(String(refuse.headers["retry-after"]), /^\d+$/);
    assert.equal((await envoi(app, "203.0.113.12")).statusCode, 200, "une autre IP garde son quota");
  } finally {
    await app.close();
  }
});

test("sans trustProxy, X-Forwarded-For ne peut pas changer de clé de quota", async () => {
  const app = await appAvecQuota();
  try {
    assert.equal((await envoi(app, "203.0.113.20")).statusCode, 200);
    assert.equal((await envoi(app, "203.0.113.21")).statusCode, 200);
    const refuse = await envoi(app, "203.0.113.22");
    assert.equal(refuse.statusCode, 429, "l'adresse du pair reste la clé, quel que soit l'en-tête");
  } finally {
    await app.close();
  }
});

test("la clé de quota utilise l'adresse client résolue par Fastify", async () => {
  const app = Fastify({ trustProxy: "127.0.0.1" });
  await app.ready();
  const req = { ip: "203.0.113.30", user: undefined } as Parameters<typeof clientKey>[0];
  assert.equal(adresseClient(req), "203.0.113.30");
  assert.equal(clientKey(req), "ip:203.0.113.30");
  await app.close();
});
