import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import githubSecretsRoute from "../src/routes/github-secrets.js";
import {
  countDistinctSecrets,
  scanCode,
  summarizeFindings,
} from "../src/github/secrets.js";
import { isNaLocation } from "../src/github/na-location.js";
import {
  summarizeCorpus,
  validateCorpus,
  type RedactedSecretRecord,
  type SecretCorpus,
} from "../src/github/corpus.js";

const AWS = "AKIAQQQQQQQQQQQQQQQQ";
const GH = `ghp_${"a1b2c3d4".repeat(5)}`;
const GOOGLE = `AIza${"b".repeat(35)}`;

const baseRecord: RedactedSecretRecord = {
  org: "bordeaux-labs",
  location: "Bordeaux, France",
  repository: "bordeaux-labs/demo",
  commit: "0123456789abcdef",
  path: "config/.env",
  line: 7,
  kind: "generic_api_key",
  fingerprint: "0123456789abcdef",
};

function corpusWith(records: RedactedSecretRecord[]): SecretCorpus {
  return validateCorpus({
    collectedAt: "2026-11-22T00:00:00.000Z",
    scope: "nouvelle-aquitaine",
    origin: "public-github",
    queryLocations: ["Bordeaux"],
    organizations: ["bordeaux-labs"],
    repositories: 1,
    filesScanned: 1,
    records,
  });
}

test("detects credential shapes and publishes only fingerprints", () => {
  const findings = scanCode(
    `aws=${AWS}\ntoken=${GH}\nkey: "${GOOGLE}"\n`,
  );
  assert.deepEqual(
    findings.map((finding) => finding.kind),
    ["aws_access_key_id", "github_token", "google_api_key"],
  );
  assert.equal(JSON.stringify(findings).includes(AWS), false);
  assert.equal(JSON.stringify(findings).includes(GH), false);
  assert.equal(JSON.stringify(findings).includes(GOOGLE), false);
  assert.deepEqual(findings.map((finding) => finding.line), [1, 2, 3]);
});

test("ignores documentation placeholders", () => {
  const findings = scanCode(
    'aws=AKIAIOSFODNN7EXAMPLE\ntoken=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\napi_key: "your_api_key_here"\n',
  );
  assert.equal(findings.length, 0);
});

test("counts the same credential once across several files", () => {
  const findings = scanCode(`A=${AWS}\nB=${AWS}\n`);
  assert.equal(findings.length, 1);
  assert.equal(countDistinctSecrets(findings), 1);
  assert.deepEqual(summarizeFindings(findings), {
    total: 1,
    byKind: { aws_access_key_id: 1 },
  });
});

test("accepts organization locations in Nouvelle-Aquitaine", () => {
  for (const location of [
    "Bordeaux, France",
    "Poitiers",
    "Nouvelle-Aquitaine",
    "La Rochelle",
    "Pyrénées-Atlantiques",
  ]) {
    assert.equal(isNaLocation(location), true, location);
  }
});

test("rejects locations outside Nouvelle-Aquitaine", () => {
  for (const location of ["Lyon, France", "Paris", "Paulette", "Nantes", null, ""]) {
    assert.equal(isNaLocation(location), false, String(location));
  }
});

test("rejects a corpus record that carries a raw value", () => {
  assert.throws(
    () => corpusWith([{ ...baseRecord, value: AWS } as RedactedSecretRecord]),
    /unexpected fields/,
  );
});

test("rejects a corpus record located outside Nouvelle-Aquitaine", () => {
  assert.throws(
    () => corpusWith([{ ...baseRecord, location: "Lyon, France" }]),
    /outside Nouvelle-Aquitaine/,
  );
});

test("counts distinct secrets and groups them by kind and organization", () => {
  const second: RedactedSecretRecord = {
    ...baseRecord,
    org: "poitiers-labs",
    location: "Poitiers",
    kind: "github_token",
    fingerprint: "abcdef0123456789",
  };
  const summary = summarizeCorpus(corpusWith([baseRecord, { ...baseRecord }, second]));
  assert.equal(summary.count, 2);
  assert.equal(summary.records, 3);
  assert.equal(summary.organizations, 2);
  assert.deepEqual(summary.byKind, { generic_api_key: 1, github_token: 1 });
  assert.deepEqual(summary.byOrg, { "bordeaux-labs": 1, "poitiers-labs": 1 });
});

test("a serialized corpus contains no credential-shaped text", () => {
  const serialized = JSON.stringify(corpusWith([baseRecord]));
  assert.equal(scanCode(serialized).length, 0);
});

test("detects unquoted environment credentials", () => {
  const secret = "z9Y8x7W6v5U4t3S2r1Q0p9Oa";
  const findings = scanCode(`CLIENT_SECRET=${secret}\n`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.kind, "env_credential");
  assert.equal(JSON.stringify(findings).includes(secret), false);
});

test("route exposes counters only", async () => {
  const app = Fastify();
  await app.register(githubSecretsRoute, { prefix: "/api" });
  const response = await app.inject({ method: "GET", url: "/api/github-secrets" });
  assert.equal(response.statusCode, 200);
  const body = response.json() as Record<string, unknown>;
  assert.equal(typeof body.count, "number");
  assert.equal(body.scope, "nouvelle-aquitaine");
  assert.equal(Object.keys(body).some((key) => /value|content|fingerprint|raw/.test(key)), false);
  await app.close();
});
