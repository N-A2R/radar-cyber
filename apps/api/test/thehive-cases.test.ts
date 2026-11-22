/**
 * TheHive connector — one test per behavior.
 *
 * No database and no external service: case creation is asserted against an
 * injected fetch function, which is also the seam used by the measurement
 * script's local TheHive-compatible test double.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCase,
  createCases,
  planCases,
  readTheHiveConfig,
  theHiveClient,
  toTheHiveSeverity,
  type TheHiveAlert,
  type TheHiveCasePayload,
  type TheHiveClient,
} from "../src/thehive/cases.js";

function alert(overrides: Partial<TheHiveAlert> = {}): TheHiveAlert {
  return {
    id: 42,
    ruleId: "ransomware-claim",
    severity: 4,
    scope: "organization_incident",
    regional: true,
    organizationName: "Hôpital de Gironde",
    organizationDept: "33",
    eventFamily: "ransomware",
    sourceName: "ransomwatch",
    sourceUrl: "https://example.invalid/claim/42",
    observedAt: "2026-11-21T10:00:00Z",
    ...overrides,
  };
}

function respondingClient(
  capture: (url: string, init: RequestInit) => Response,
): { client: TheHiveClient; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = theHiveClient({
    url: "http://thehive.invalid",
    apiKey: "test-key",
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      return capture(url, init ?? {});
    }) as typeof fetch,
  });
  return { client, calls };
}

function created(id: string): Response {
  return new Response(JSON.stringify({ id }), { status: 201, headers: { "content-type": "application/json" } });
}

test("builds a case from allowlisted structured fields only", () => {
  const payload = buildCase(alert());
  assert.equal(payload.externalRef, "radar-cyber:alert:42");
  assert.equal(payload.severity, 3);
  assert.match(payload.title, /\[Radar Cyber\] Alert 42/);
  assert.match(payload.description, /Region: Nouvelle-Aquitaine \(33\)/);
  assert.match(payload.description, /Organization: Hôpital de Gironde/);
  assert.ok(payload.tags.includes("nouvelle-aquitaine"));
  assert.ok(payload.tags.includes("rule:ransomware-claim"));
});

test("skips alerts outside Nouvelle-Aquitaine", () => {
  const plan = planCases([alert({ regional: false, organizationDept: "75" })]);
  assert.equal(plan.cases.length, 0);
  assert.equal(plan.skipped.outsideRegion, 1);
});

test("keeps gray-source alerts eligible", () => {
  const plan = planCases([alert({ sourceName: "municipal forum mirror", sourceUrl: "https://gray.invalid/x" })]);
  assert.equal(plan.cases.length, 1);
  assert.equal(plan.skipped.outsideRegion, 0);
});

test("keeps alerts attached to a Nouvelle-Aquitaine organization eligible", () => {
  const plan = planCases([alert({ regional: false, organizationDept: "87" })]);
  assert.equal(plan.cases.length, 1);
});

test("skips review-only alert scopes", () => {
  const plan = planCases([alert({ scope: "agents-cpu" }), alert({ scope: "rupture-revue" })]);
  assert.equal(plan.cases.length, 0);
  assert.equal(plan.skipped.reviewOnly, 2);
});

test("redacts victim personal data from every field", () => {
  const payload = buildCase(alert({
    organizationName: "Clinique Dupont jean.dupont@example.fr 06 12 34 56 78",
    sourceUrl: "https://user:secret@gray.invalid/claim/42",
  }));
  const text = `${payload.title}\n${payload.description}\n${payload.tags.join("\n")}`;
  assert.doesNotMatch(text, /jean\.dupont@example\.fr/);
  assert.doesNotMatch(text, /06 12 34 56 78/);
  assert.doesNotMatch(text, /user:secret@/);
  assert.match(text, /\[redacted\]/);
});

test("posts a case to TheHive with bearer authorization", async () => {
  const { client, calls } = respondingClient(() => created("case-99"));
  const result = await createCases([alert()], client);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://thehive.invalid/api/case");
  assert.equal((calls[0]?.init.headers as Record<string, string>).authorization, "Bearer test-key");
  const body = JSON.parse(String(calls[0]?.init.body)) as TheHiveCasePayload;
  assert.equal(body.externalRef, "radar-cyber:alert:42");
  assert.equal(result.created, 1);
  assert.deepEqual(result.cases, [{ alertId: 42, caseId: "case-99", externalRef: "radar-cyber:alert:42" }]);
});

test("does not create a duplicate case for the same alert", () => {
  const plan = planCases([alert(), alert()]);
  assert.equal(plan.cases.length, 1);
  assert.equal(plan.skipped.duplicate, 1);
});

test("reports an HTTP failure without claiming a case was created", async () => {
  const { client } = respondingClient(() => new Response("boom", { status: 500 }));
  const result = await createCases([alert()], client);
  assert.equal(result.created, 0);
  assert.equal(result.failed, 1);
  assert.match(result.errors[0]?.error ?? "", /thehive HTTP 500/);
});

test("rejects an HTTP response without a case id", async () => {
  const { client } = respondingClient(() => new Response("{}", { status: 201 }));
  const result = await createCases([alert()], client);
  assert.equal(result.created, 0);
  assert.match(result.errors[0]?.error ?? "", /without case id/);
});

test("maps radar severities to TheHive severities", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(toTheHiveSeverity), [1, 1, 2, 3, 4]);
});

test("reads TheHive configuration only when URL and key are present", () => {
  assert.equal(readTheHiveConfig({}), null);
  assert.equal(readTheHiveConfig({ RADAR_THEHIVE_URL: "http://thehive.invalid" }), null);
  assert.deepEqual(readTheHiveConfig({
    RADAR_THEHIVE_URL: "http://thehive.invalid/",
    RADAR_THEHIVE_API_KEY: "  test-key  ",
  }), { url: "http://thehive.invalid", apiKey: "test-key" });
});
