/**
 * Integration tests for per-API-key quota headers and enforcement.
 * One behavior per test. Run with:
 *   apps/api/node_modules/.bin/tsx test/run.ts test/api-key-quota.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { generateApiKey, hashApiKey } from "../src/api-key.js";
import { buildApp } from "../src/app.js";
import { closePools, query } from "../src/db.js";

const TAG = `quota${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const EMAIL = `${TAG}@quota.test`;

let app: FastifyInstance;
let userId: number;

type Key = { id: number; key: string };

async function createKey(quota: number): Promise<Key> {
  const key = generateApiKey();
  const r = await query<{ id: number }>(
    `INSERT INTO api_key (user_id, name, key_hash, key_prefix, scope, quota)
     VALUES ($1, $2, $3, $4, 'read', $5) RETURNING id`,
    [userId, `${TAG}-${quota}-${key.slice(-6)}`, hashApiKey(key), key.slice(0, 12), quota],
  );
  return { id: r.rows[0]!.id, key };
}

function get(key: string) {
  return app.inject({ method: "GET", url: "/api/v1/health", headers: { "x-api-key": key } });
}

function headerNumber(response: { headers: Record<string, string | string[] | undefined> }, name: string): number {
  const value = response.headers[name.toLowerCase()];
  assert.match(String(value), /^\d+$/, `${name} missing or invalid: ${String(value)}`);
  return Number(value);
}

before(async () => {
  const r = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','admin') RETURNING id",
    [EMAIL],
  );
  userId = r.rows[0]!.id;
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM app_user WHERE id=$1", [userId]);
  await closePools();
});

test("accepted requests publish the per-key quota state", async () => {
  const key = await createKey(3);
  const first = await get(key.key);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(headerNumber(first, "RateLimit-Limit"), 3);
  assert.equal(headerNumber(first, "RateLimit-Remaining"), 2);
  const reset = headerNumber(first, "RateLimit-Reset");
  assert.ok(reset >= 0 && reset <= 60, `unexpected reset: ${reset}`);
  assert.equal(first.headers["retry-after"], undefined);

  const second = await get(key.key);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(headerNumber(second, "RateLimit-Remaining"), 1);
});

test("exhausted key returns 429 with quota headers and Retry-After", async () => {
  const key = await createKey(1);
  assert.equal((await get(key.key)).statusCode, 200);
  const denied = await get(key.key);
  assert.equal(denied.statusCode, 429, denied.body);
  assert.equal(denied.json().error.code, "API_KEY_QUOTA_EXCEEDED");
  assert.equal(headerNumber(denied, "RateLimit-Limit"), 1);
  assert.equal(headerNumber(denied, "RateLimit-Remaining"), 0);
  const retryAfter = headerNumber(denied, "Retry-After");
  assert.ok(retryAfter >= 1 && retryAfter <= 60, `unexpected Retry-After: ${retryAfter}`);
});

test("zero-quota key publishes a zero limit with Retry-After", async () => {
  const key = await createKey(0);
  const denied = await get(key.key);
  assert.equal(denied.statusCode, 429, denied.body);
  assert.equal(denied.json().error.code, "API_KEY_QUOTA_EXCEEDED");
  assert.equal(headerNumber(denied, "RateLimit-Limit"), 0);
  assert.equal(headerNumber(denied, "RateLimit-Remaining"), 0);
  assert.ok(headerNumber(denied, "Retry-After") >= 1);
});

test("quota is isolated between keys", async () => {
  const a = await createKey(1);
  const b = await createKey(1);
  assert.equal((await get(a.key)).statusCode, 200);
  assert.equal((await get(a.key)).statusCode, 429);
  // Exhausting key A must neither consume nor block key B.
  assert.equal((await get(b.key)).statusCode, 200);
  assert.equal((await get(b.key)).statusCode, 429);
});

test("concurrent requests never exceed the key quota", async () => {
  const key = await createKey(5);
  const responses = await Promise.all(Array.from({ length: 20 }, () => get(key.key)));
  assert.equal(responses.filter((r) => r.statusCode === 200).length, 5);
  assert.equal(responses.filter((r) => r.statusCode === 429).length, 15);
  const state = await query<{ used: number }>("SELECT used FROM api_key WHERE id=$1", [key.id]);
  assert.equal(state.rows[0]!.used, 5);
});

test("expired quota window restores the remaining quota", async () => {
  const key = await createKey(2);
  assert.equal((await get(key.key)).statusCode, 200);
  assert.equal((await get(key.key)).statusCode, 200);
  assert.equal((await get(key.key)).statusCode, 429);
  await query("UPDATE api_key SET window_start = now() - interval '61 seconds' WHERE id=$1", [key.id]);
  const again = await get(key.key);
  assert.equal(again.statusCode, 200, again.body);
  assert.equal(headerNumber(again, "RateLimit-Remaining"), 1);
});
