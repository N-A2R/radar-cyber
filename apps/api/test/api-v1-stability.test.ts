/**
 * API v1 stable : version publiée et engagement de compatibilité vérifiable.
 * Rejouer : apps/api/node_modules/.bin/tsx --test apps/api/test/api-v1-stability.test.ts
 */
import assert from "node:assert/strict";
import Fastify from "fastify";
import { test } from "node:test";
import { OPERATIONS, type Operation } from "../src/openapi/catalog.js";
import { checkCompatibility } from "../src/openapi/contract.js";
import { V1_CONTRACT } from "../src/openapi/v1-contract.js";
import { installPublicApi } from "../src/openapi/install.js";
import { buildOpenApi } from "../src/openapi/spec.js";
import { COMPATIBILITY_POLICY, STABILITY } from "../src/openapi/stability.js";
import { API_VERSION } from "../src/openapi/version.js";

const spec = buildOpenApi();

test("v1 est publiée comme stable avec une version et un contrat", () => {
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.version, API_VERSION);
  assert.equal(spec.info["x-stability"], STABILITY);
  assert.equal(spec.info["x-contract"].version, API_VERSION);
  assert.equal(spec.info["x-contract"].operations, V1_CONTRACT.operations.length);
  assert.deepEqual(
    (spec.servers as { url: string }[]).map((server) => server.url),
    ["/api/v1", "/api"],
  );
});

test("la politique interdit les changements cassants dans 1.x", () => {
  assert.equal(COMPATIBILITY_POLICY.breakingChangesRequireMajor, true);
  assert.equal(COMPATIBILITY_POLICY.major, "1");
  assert.equal(COMPATIBILITY_POLICY.legacyPrefix, "/api");
  assert.equal(COMPATIBILITY_POLICY.rules.length, 5);
  assert.match(COMPATIBILITY_POLICY.rules.join(" "), /new major version/);
  assert.deepEqual(spec.info["x-compatibility"], COMPATIBILITY_POLICY);
});

test("toutes les opérations publiées sont figées sans divergence", () => {
  const report = checkCompatibility(V1_CONTRACT, OPERATIONS);
  // 56 opérations depuis la republication qui a ajouté GET /sources/verification.
  assert.equal(report.frozen, 56);
  assert.equal(report.live, OPERATIONS.length);
  assert.equal(report.frozen, report.live);
  assert.deepEqual(report.breaking, []);
  assert.equal(report.digestMatches, true);
  assert.equal(report.digest, V1_CONTRACT.digest);
  assert.equal(report.stable, true);
});

test("retirer une opération publiée est détecté comme cassant", () => {
  const report = checkCompatibility(V1_CONTRACT, OPERATIONS.slice(1));
  assert.ok(report.breaking.some((change) => change.startsWith("removed: ")));
  assert.equal(report.stable, false);
});

test("modifier la signature d'une opération publiée est détecté comme cassant", () => {
  const operations: Operation[] = [...OPERATIONS];
  const first = operations[0]!;
  operations[0] = { ...first, status: (first.status ?? 200) + 1 };
  const report = checkCompatibility(V1_CONTRACT, operations);
  assert.ok(report.breaking.some((change) => change.startsWith("changed: ")));
  assert.equal(report.stable, false);
});

test("une opération ajoutée est compatible mais exige une nouvelle publication", () => {
  const first = OPERATIONS[0]!;
  const added: Operation = { ...first, path: "/stability-probe", operationId: "stabilityProbe" };
  const report = checkCompatibility(V1_CONTRACT, [...OPERATIONS, added]);
  assert.deepEqual(report.breaking, []);
  assert.deepEqual(report.added, [`${first.method} /stability-probe`]);
  assert.equal(report.digestMatches, false);
});

test("les deux préfixes publient la même version et le même engagement", async () => {
  const app = Fastify({ logger: false });
  await installPublicApi(app);
  try {
    for (const url of ["/api/v1/openapi.json", "/api/openapi.json"]) {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.headers["x-api-version"], API_VERSION);
      assert.equal(response.headers["x-api-stability"], STABILITY);
      const document = response.json<{ info: { "x-stability": string } }>();
      assert.equal(document.info["x-stability"], STABILITY);
    }
  } finally {
    await app.close();
  }
});
