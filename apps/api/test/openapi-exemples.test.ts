/**
 * Executable OpenAPI documentation: one test per observable behaviour.
 * Replay: pnpm -F @radar/api test -- test/openapi-exemples.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { OPERATIONS } from "../src/openapi/catalog.js";
import { BASELINE, buildExamples } from "../src/openapi/examples.js";
import { replayAll, type ReplayResult } from "../src/openapi/replay.js";
import { buildOpenApi, documentedRouteCount, executableExampleCount, openApiPath } from "../src/openapi/spec.js";

let app: FastifyInstance;
let results: ReplayResult[];

before(async () => {
  app = await buildApp();
  await app.ready();
  results = await replayAll({ application: app });
});

after(async () => {
  if (app) await app.close();
});

test("every operation publishes a request and a response example", () => {
  const spec = buildOpenApi();
  assert.equal(documentedRouteCount(spec), OPERATIONS.length);
  assert.equal(executableExampleCount(spec), OPERATIONS.length);
  const paths = spec.paths as Record<string, Record<string, { "x-request-example": unknown }>>;
  for (const op of OPERATIONS) {
    assert.ok(paths[openApiPath(op.path)]?.[op.method]?.["x-request-example"], op.operationId);
  }
});

test("request examples validate against the schemas used by the routes", () => {
  for (const result of results) {
    const relevant = result.problems.filter((problem) => /path parameters|query|body/.test(problem));
    assert.deepEqual(relevant, [], `${result.operationId}: ${relevant.join("; ")}`);
  }
});

test("response examples validate against their declared response schema", () => {
  for (const result of results) {
    const relevant = result.problems.filter((problem) => problem.startsWith("response example"));
    assert.deepEqual(relevant, [], `${result.operationId}: ${relevant.join("; ")}`);
  }
});

test("replayed HTTP responses match the documented examples", () => {
  for (const result of results) {
    assert.equal(result.ok, true, `${result.operationId}: ${result.problems.join("; ")}`);
  }
  assert.equal(results.length, OPERATIONS.length);
});

test("documented requests target routes registered by the application", () => {
  for (const result of results) {
    assert.ok(!result.problems.includes("no matching route in the application"), result.operationId);
  }
});

test("examples embed the documented real Nouvelle-Aquitaine state", () => {
  const source = readFileSync(new URL(`../../../${BASELINE.provenance}`, import.meta.url), "utf8");
  for (const fragment of ["1 673 151 organisations", "312 sources", "26 719 événements"]) {
    assert.ok(source.includes(fragment), fragment);
  }
  const serialized = JSON.stringify(buildOpenApi());
  for (const value of [BASELINE.organisations, BASELINE.sources, BASELINE.evenements]) {
    assert.ok(serialized.includes(String(value)), String(value));
  }
});

test("examples contain no victim personal data", () => {
  const serialized = JSON.stringify(buildExamples());
  const emails = serialized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  for (const email of emails) assert.equal(email.toLowerCase(), "demo@example.org");
  for (const forbidden of ["victim", "victime", "victimes"]) {
    assert.ok(!serialized.toLowerCase().includes(forbidden), forbidden);
  }
});

test("the served document exposes the same examples on both prefixes", async () => {
  for (const url of ["/api/openapi.json", "/api/v1/openapi.json"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200, url);
    const document = response.json<{ paths: Record<string, Record<string, { "x-request-example": unknown }>> }>();
    assert.ok(document.paths["/health"]?.get?.["x-request-example"], url);
  }
});

test("a tampered example is rejected by the replay", async () => {
  const examples = buildExamples();
  const original = examples.get("getDirectory")!;
  examples.set("getDirectory", { ...original, query: { ...original.query, dept: "XXX" } });
  const invalid = await replayAll({ examples });
  const result = invalid.find((item) => item.operationId === "getDirectory")!;
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => problem.startsWith("query does not validate")));
});
