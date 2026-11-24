/**
 * Contrat de GET /api/v1/na/events : la spec, le client généré et le SDK
 * doivent décrire exactement la réponse que la route publie réellement.
 * Rejouer : pnpm -F @radar/api test -- test/api-v1-na-events-contract.test.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test, before, after } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { closePools, query } from "../src/db.js";
import { OPERATIONS } from "../src/openapi/catalog.js";
import { createRadarClient as createGeneratedClient } from "../src/openapi/client.generated.js";
import { NaEventFeed as NaEventFeedSchema } from "../src/openapi/schemas.js";
import { buildOpenApi, openApiPath } from "../src/openapi/spec.js";
import { RadarClient } from "../../../sdks/typescript/src/index.ts";

type Doc = Record<string, any>;

const TAG = `nacontract${randomBytes(6).toString("hex")}`;
let app: FastifyInstance;
let orgId: number;
let eventId: number;

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
  const source = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, status)
     VALUES ($1, $2, 'entreprise', 'Bordeaux', '33', 'confirme') RETURNING id`,
    [`Organisation contrat ${TAG}`, `${TAG}-org`],
  );
  orgId = Number(org.rows[0]!.id);
  const event = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id,
                        evidence, observed_at, source_url)
     VALUES ($1, 'ransomware', 'technical_indicator', $2, $3, $4,
             '{"tlp":"CLEAR","run_id":"1"}'::jsonb, '2026-11-20T10:00:00Z',
             'https://example.invalid/na-contract') RETURNING id`,
    [`${TAG}-event`, `Fait public témoin ${TAG}`, source.rows[0]!.id, orgId],
  );
  eventId = Number(event.rows[0]!.id);
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM event WHERE id=$1", [eventId]);
  await query("DELETE FROM org WHERE id=$1", [orgId]);
  await closePools();
});

test("la publication documente dept et la forme camelCase renvoyée par la route", () => {
  const op = OPERATIONS.find((item) => item.operationId === "getNaEvents")!;
  const spec = buildOpenApi();
  const doc = (spec.paths as Doc)[openApiPath(op.path)]!.get as Doc;
  assert.deepEqual((doc.parameters as Doc[]).map((p) => [p.in, p.name]), [["query", "dept"]]);
  assert.equal((doc.responses as Doc)["200"].content["application/json"].schema.$ref,
    "#/components/schemas/NaEventFeed");

  const feed = ((spec.components as Doc).schemas as Doc).NaEventFeed as Doc;
  assert.deepEqual(Object.keys(feed.properties as Doc).sort(), ["dept", "events"]);
  const row = ((feed.properties as Doc).events as Doc).items as Doc;
  for (const key of ["observedAt", "collectedAt", "orgId"]) {
    assert.ok((row.properties as Doc)[key], `champ publié manquant : ${key}`);
  }
  for (const key of ["observed_at", "collected_at"]) {
    assert.equal((row.properties as Doc)[key], undefined, `champ obsolète publié : ${key}`);
  }
});

test("réponse HTTP, client généré et SDK partagent le même contrat", async () => {
  const response = await app.inject({ method: "GET", url: "/api/v1/na/events?dept=33" });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json<{ dept: string; events: Array<Doc & { id: number }> }>();
  assert.equal(body.dept, "33");
  const wire = body.events.find((item) => item.id === eventId);
  assert.ok(wire, "l'événement témoin doit être publié");
  const parsed = NaEventFeedSchema.safeParse(body);
  assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  assert.equal(Object.hasOwn(wire!, "observedAt"), true);
  assert.equal(Object.hasOwn(wire!, "collectedAt"), true);
  assert.equal(Object.hasOwn(wire!, "observed_at"), false);
  assert.equal(Object.hasOwn(wire!, "collected_at"), false);

  const generated = await createGeneratedClient({
    baseUrl: "http://localhost/api/v1", fetch: injectFetch(app),
  }).getNaEvents({ query: { dept: "33" } });
  assert.deepEqual(generated, body);

  const sdk = await new RadarClient({
    baseUrl: "http://localhost/api", fetch: injectFetch(app),
  }).getNaEvents("33");
  const projected = sdk.find((item) => item.id === eventId);
  assert.ok(projected, "le SDK doit exposer l'événement témoin");
  assert.equal(projected!.observedAt, wire!.observedAt);
  assert.equal(projected!.collectedAt, wire!.collectedAt);
  for (const forbidden of ["title", "orgName", "summary"]) {
    assert.equal(Object.hasOwn(projected!, forbidden), false, `texte libre exposé : ${forbidden}`);
  }
});
