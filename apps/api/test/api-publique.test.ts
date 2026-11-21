/**
 * API publique : documentation OpenAPI, versioning, clés à quota et client
 * généré. Chaque route documentée est vérifiée en 200 et en erreur.
 * Rejouer : pnpm -F @radar/api test -- test/api-publique.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { buildApp } from "../src/app.js";
import { closePools, query } from "../src/db.js";
import { OPERATIONS } from "../src/openapi/catalog.js";
import { generateClientSource } from "../../../scripts/generate-api-client.mts";
import {
  ApiClientError, createRadarClient,
} from "../src/openapi/client.generated.js";
import { buildOpenApi, openApiPath } from "../src/openapi/spec.js";
import { API_VERSION } from "../src/openapi/version.js";
const TAG = `api${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EMAIL = `${TAG}@api-publique.test`;
const TOKEN = `tok-${TAG}`;
const SESSION = { authorization: `Bearer ${TOKEN}` };

const ROUTES = [
  { path: "/api/v1/health" },
  { path: "/api/v1/stats" },
  { path: "/api/v1/sources" },
  { path: "/api/v1/events", auth: true },
  { path: "/api/v1/orgs" },
  { path: "/api/v1/directory", bad: "?dept=XXX" },
  { path: "/api/v1/search" },
  { path: "/api/v1/flows" },
  { path: "/api/v1/alerts", auth: true },
  { path: "/api/v1/couverture" },
] as const;

type Key = { id: number; key: string };

let app: FastifyInstance;
let readKey: Key;
let zeroKey: Key;
let writeKey: Key;
let orgId: number;

async function createKey(name: string, scope: "read" | "write", quota: number): Promise<Key> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/keys",
    headers: SESSION,
    payload: { name, scope, quota },
  });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json<{ id: number; key: string }>();
  return { id: body.id, key: body.key };
}

function injectFetch(instance: FastifyInstance): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const target = new URL(raw, "http://localhost");
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [name, value] of new Headers(init.headers).entries()) headers[name] = value;
    }
    const res = await instance.inject({
      method: init?.method ?? "GET",
      url: `${target.pathname}${target.search}`,
      headers,
      payload: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(res.body, { status: res.statusCode, headers: res.headers as Record<string, string> });
  };
}

before(async () => {
  const user = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','admin') RETURNING id",
    [EMAIL],
  );
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(TOKEN), user.rows[0]!.id],
  );
  const org = await query<{ id: number }>("SELECT id FROM org ORDER BY id LIMIT 1");
  orgId = Number(org.rows[0]!.id);

  app = await buildApp();
  await app.ready();
  readKey = await createKey(`${TAG}-read`, "read", 60);
  zeroKey = await createKey(`${TAG}-zero`, "read", 0);
  writeKey = await createKey(`${TAG}-write`, "write", 10);
  assert.match(readKey.key, /^rdk_/);
  assert.match(zeroKey.key, /^rdk_/);
  assert.match(writeKey.key, /^rdk_/);
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
  await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
  await closePools();
});

function assertEnvelope(body: unknown, code: string): void {
  const parsed = body as { error?: { code?: string; message?: string } };
  assert.equal(parsed.error?.code, code, JSON.stringify(body));
  assert.ok(typeof parsed.error?.message === "string");
}

test("GET /api/docs et /api/openapi.json répondent 200", async () => {
  const docs = await app.inject({ method: "GET", url: "/api/docs" });
  assert.equal(docs.statusCode, 200, docs.body);
  assert.match(docs.body, /Swagger UI/);
  const ui = await app.inject({ method: "GET", url: "/api/docs/" });
  assert.equal(ui.statusCode, 200, ui.body);
  for (const url of ["/api/openapi.json", "/api/v1/openapi.json", "/api/docs/json"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200, `${url} : ${res.body}`);
    const spec = res.json<{ openapi: string; info: { version: string } }>();
    assert.equal(spec.openapi, "3.1.0");
    assert.equal(spec.info.version, API_VERSION);
  }
});

test("la spec documente au moins 8 routes avec schéma de réponse et d'erreur", () => {
  const spec = buildOpenApi();
  const paths = spec.paths as Record<string, Record<string, {
    responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
  }>>;
  const documented = OPERATIONS.filter((op) => {
    const opDoc = paths[openApiPath(op.path)]?.[op.method];
    const ok = opDoc?.responses[String(op.status ?? 200)]?.content?.[op.contentType ?? "application/json"]?.schema?.$ref;
    const error = opDoc?.responses["429"]?.content?.["application/json"]?.schema?.$ref;
    return Boolean(ok && error);
  });
  assert.ok(documented.length >= 8, `${documented.length} routes documentées avec schéma`);
  for (const route of ROUTES) {
    const doc = paths[route.path.slice("/api/v1".length)]?.get;
    assert.ok(doc, `${route.path} absent de la spec`);
    assert.match(doc!.responses["200"]!.content!["application/json"]!.schema!.$ref!, /^#\/components\/schemas\//);
    assert.match(doc!.responses["429"]!.content!["application/json"]!.schema!.$ref!, /ErrorBody/);
  }
  const components = spec.components as { schemas: Record<string, unknown> };
  assert.ok(Object.keys(components.schemas).length >= 20);
  const body = components.schemas.CreateKeyBody as { required: string[]; properties: Record<string, unknown> };
  assert.ok(body.required.includes("name"));
  assert.ok(body.properties.scope);
});

test("les 10 routes répondent 200 et une erreur explicite", async () => {
  for (const route of ROUTES) {
    const headers = "auth" in route && route.auth ? SESSION : {};
    const ok = await app.inject({ method: "GET", url: route.path, headers });
    assert.equal(ok.statusCode, 200, `${route.path} : ${ok.body}`);
    assert.equal(ok.headers["x-api-version"], API_VERSION);

    const quota = await app.inject({ method: "GET", url: route.path, headers: { "x-api-key": zeroKey.key } });
    assert.equal(quota.statusCode, 429, `${route.path} sans quota : ${quota.body}`);
    assertEnvelope(quota.json(), "API_KEY_QUOTA_EXCEEDED");

    if ("auth" in route && route.auth) {
      const anonymous = await app.inject({ method: "GET", url: route.path });
      assert.equal(anonymous.statusCode, 401, `${route.path} sans jeton`);
      assertEnvelope(anonymous.json(), "UNAUTHORIZED");
    }

    if ("bad" in route && route.bad) {
      const bad = await app.inject({ method: "GET", url: `${route.path}${route.bad}`, headers });
      assert.equal(bad.statusCode, 400, `${route.path}${route.bad} : ${bad.body}`);
      assertEnvelope(bad.json(), "BAD_REQUEST");
    }
  }
});

test("le quota est atomique et une clé de lecture ne peut pas écrire", async () => {
  const limited = await createKey(`${TAG}-limited`, "read", 2);
  const codes: number[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await app.inject({ method: "GET", url: "/api/v1/stats", headers: { "x-api-key": limited.key } });
    codes.push(res.statusCode);
    if (res.statusCode === 429) assertEnvelope(res.json(), "API_KEY_QUOTA_EXCEEDED");
  }
  assert.deepEqual(codes, [200, 200, 429]);

  const denied = await app.inject({
    method: "POST", url: "/api/v1/ingest", headers: { "x-api-key": readKey.key }, payload: { events: [] },
  });
  assert.equal(denied.statusCode, 403, denied.body);
  assertEnvelope(denied.json(), "FORBIDDEN");
  const written = await app.inject({
    method: "POST", url: "/api/v1/ingest", headers: { "x-api-key": writeKey.key }, payload: { events: [] },
  });
  assert.equal(written.statusCode, 200, written.body);
  assert.deepEqual(written.json(), { inserted: 0, skipped: 0 });

  const escalate = await app.inject({
    method: "POST", url: "/api/v1/keys", headers: { "x-api-key": writeKey.key }, payload: { name: "escalade", quota: 1 },
  });
  assert.equal(escalate.statusCode, 403, escalate.body);
});

test("clé inconnue ou révoquée : 401, pas 404", async () => {
  const unknown = await app.inject({ method: "GET", url: "/api/v1/stats", headers: { "x-api-key": "rdk_inconnue" } });
  assert.equal(unknown.statusCode, 401);
  assertEnvelope(unknown.json(), "UNAUTHORIZED");
  const revoked = await createKey(`${TAG}-revoked`, "read", 5);
  const del = await app.inject({ method: "DELETE", url: `/api/v1/keys/${revoked.id}`, headers: SESSION });
  assert.equal(del.statusCode, 200, del.body);
  const afterRevoke = await app.inject({ method: "GET", url: "/api/v1/stats", headers: { "x-api-key": revoked.key } });
  assert.equal(afterRevoke.statusCode, 401);
});

test("les alias /api et /api/v1 partagent la même version", async () => {
  const current = await app.inject({ method: "GET", url: "/api/v1/stats" });
  const legacy = await app.inject({ method: "GET", url: "/api/stats" });
  assert.equal(current.statusCode, 200);
  assert.equal(legacy.statusCode, 200);
  assert.equal(current.headers["x-api-version"], API_VERSION);
  assert.equal(legacy.headers["x-api-version"], API_VERSION);
});

test("le client généré est à jour et appelle les routes typées", async () => {
  const generated = readFileSync(new URL("../src/openapi/client.generated.ts", import.meta.url), "utf8");
  assert.equal(generateClientSource(), generated, "relancer scripts/generate-api-client.mts");

  const fetch = injectFetch(app);
  const client = createRadarClient({ fetch, apiKey: readKey.key });
  const health = await client.getHealth();
  assert.equal(health.ok, true);
  const events = await client.getEvents({ query: { limit: 1 } });
  assert.ok(Array.isArray(events), "GET /events renvoie un tableau d'événements");
  const org = await client.getOrg({ params: { id: orgId } });
  assert.equal(Number(org.org.id), orgId);
  const writer = createRadarClient({ fetch, token: TOKEN });
  const ingested = await writer.ingestEvents({ body: { events: [] } });

  const limited = createRadarClient({ fetch, apiKey: zeroKey.key });
  await assert.rejects(limited.getStats(), (err: unknown) =>
    err instanceof ApiClientError && err.status === 429);
});
