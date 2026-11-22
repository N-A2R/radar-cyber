/** En-têtes de sécurité : JSON d'API, HTML du front, erreur 404. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { installErrorHandler } from "../src/errors.js";
import { installSecurityHeaders } from "../src/security/headers.js";

let app: FastifyInstance;

before(async () => {
  app = Fastify({ logger: false });
  installErrorHandler(app);
  await installSecurityHeaders(app);
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/", async (_req, reply) => {
    reply.type("text/html").send("<!doctype html><html><body>radar</body></html>");
  });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("réponse JSON : en-têtes de sécurité complets et pas de cache", async () => {
  const res = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-frame-options"], "SAMEORIGIN");
  assert.equal(res.headers["referrer-policy"], "no-referrer");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["cross-origin-opener-policy"], "same-origin");
  assert.equal(res.headers["cross-origin-resource-policy"], "same-origin");
  assert.equal(res.headers["x-permitted-cross-domain-policies"], "none");
  assert.match(String(res.headers["permissions-policy"]), /geolocation=\(\)/);
  assert.equal(res.headers["content-security-policy"], undefined, "pas de CSP sur du JSON");
});

test("réponse HTML : CSP stricte avec origines explicitement autorisées", async () => {
  const res = await app.inject({ method: "GET", url: "/" });
  assert.equal(res.statusCode, 200);
  const csp = String(res.headers["content-security-policy"]);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  // MapLibre exige 'unsafe-inline' pour les styles ; aucun script inline ne
  // doit être autorisé pour autant.
  const scriptSrc = csp.split(";").map((directive) => directive.trim()).find((directive) => directive.startsWith("script-src"));
  assert.ok(scriptSrc !== undefined, "directive script-src absente");
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "aucun script inline autorisé");
});

test("erreurs : format et en-têtes restent cohérents", async () => {
  const res = await app.inject({ method: "GET", url: "/api/inexistant" });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, "NOT_FOUND");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});
