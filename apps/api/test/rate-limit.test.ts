/**
 * Intégration du limiteur de débit sur les trois routes POST d'écriture.
 * 30 appels rapides par route : la fenêtre glissante doit en refuser au moins
 * un avec un en-tête Retry-After. Les charges sont volontairement invalides
 * (400) ou vides : aucun test n'écrit en base.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import reviewRoute from "../src/routes/review.js";
import ingestRoute from "../src/routes/ingest.js";

const ROUTES = [
  { name: "review/decision", url: "/api/review/0/decision", payload: { decision: "refuser", raison: "test" } },
  { name: "review/refuser-sans-indice", url: "/api/review/refuser-sans-indice", payload: {} },
  { name: "ingest", url: "/api/ingest", payload: { events: [] } },
] as const;

let app: FastifyInstance;

before(async () => {
  app = Fastify();
  app.addHook("onRequest", async (req) => {
    req.user = { id: 1, email: "rate-limit@test.local", role: "admin", displayName: null };
  });
  await app.register(reviewRoute, { prefix: "/api" });
  await app.register(ingestRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

for (const route of ROUTES) {
  test(`30 appels rapides sur ${route.name} : au moins un 429 avec Retry-After`, async () => {
    const responses = await Promise.all(
      Array.from({ length: 30 }, () => app.inject({ method: "POST", url: route.url, payload: route.payload })),
    );
    const codes = responses.map((r) => r.statusCode);
    const refused = responses.filter((r) => r.statusCode === 429);
    assert.ok(refused.length > 0, `aucun 429 sur ${route.name} : ${codes.join(",")}`);
    for (const res of refused) {
      const retryAfter = res.headers["retry-after"];
      assert.match(String(retryAfter), /^\d+$/, `Retry-After manquant ou invalide : ${String(retryAfter)}`);
      assert.ok(Number(retryAfter) >= 1, "Retry-After doit être au moins 1 seconde");
    }
  });
}
