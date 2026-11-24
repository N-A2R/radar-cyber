/**
 * One behavior per test for presumed C2 servers hosted in Nouvelle-Aquitaine.
 *
 * Pure rules run on fixtures; one database test and one HTTP test check that
 * the reproducible measurement and the API share the same rule. No victim
 * payload is inserted or read.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
  countC2Servers,
  detectC2Servers,
  isC2Signal,
  hostedInNa,
  type C2Candidate,
} from "../src/c2/detect.js";
import { measureC2Servers } from "../src/c2/measure.js";
import c2ServersRoute from "../src/routes/c2-servers.js";
import { installAccessControl } from "../src/security/rbac.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `c2${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const HASH = `${TAG}-claim`;
const C2_SOURCE_ID = "feed:firehol:c2_tracker";

function candidate(text: string, overrides: Partial<C2Candidate> = {}): C2Candidate {
  return { id: "1", source: "ransomlook", text, origin: "event", ...overrides };
}

let app: FastifyInstance;
let fixtureEventId: number;

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, license, retain_raw)
     VALUES ($1, 'FireHOL c2_tracker', 'reputation', $2, NULL, false)`,
    [C2_SOURCE_ID, "https://example.invalid/c2.ipset"],
  );
  const event = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, source_url, evidence)
     VALUES ($1, 'cti', 'reported_observation', $2, 3, 'ransomlook',
             'https://example.invalid/${TAG}/event', '{"run_id":"1"}'::jsonb) RETURNING id`,
    [`${TAG}-event`, "C2 server hosted in Bordeaux"],
  );
  fixtureEventId = Number(event.rows[0]!.id);
  await query(
    `INSERT INTO quarantine_raw (source, source_url, org_hint, content_hash, tlp, status, kind)
     VALUES ('ransomwatch', 'https://example.invalid/c2', $1, $2, 'RED', 'reviewed', 'claim')`,
    ["C2 server located in Gironde", HASH],
  );

  app = Fastify({ logger: false });
  installAccessControl(app);
  await app.register(c2ServersRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await supprimerEvenementsArchivees("id = $1", [fixtureEventId]);
  await query("DELETE FROM quarantine_raw WHERE content_hash = $1", [HASH]);
  await query("DELETE FROM source WHERE id = $1", [C2_SOURCE_ID]);
  await closePools();
});

test("English C2 wording is recognized", () => {
  assert.equal(isC2Signal("C2 server hosted in Bordeaux"), true);
  assert.equal(isC2Signal("Command-and-control infrastructure deployed in Niort"), true);
});

test("French C2 wording is recognized", () => {
  assert.equal(isC2Signal("Serveur de commande hébergé en Gironde"), true);
});

test("a known C2 framework counts as a C2 signal", () => {
  assert.equal(isC2Signal("Cobalt Strike teamserver observed in Limoges"), true);
});

test("a CVE description is not an infrastructure observation", () => {
  assert.equal(countC2Servers([candidate("Sliver C2 framework hosted in Bordeaux", { family: "vuln" })]), 0);
});

test("an explicit in-region hosting claim is detected", () => {
  const [detection] = detectC2Servers([candidate("C2 server hosted in Bordeaux")]);
  assert.equal(detection?.basis, "na-hosting");
  assert.equal(detection?.location, "bordeaux");
  assert.equal(detection?.source, "ransomlook");
});

test("a department name in a hosting claim scopes the detection", () => {
  assert.equal(hostedInNa("Serveur de commande hébergé en Gironde"), "gironde");
  assert.equal(hostedInNa("C2 infrastructure based in Deux-Sèvres"), "deux-sevres");
});

test("a foreign hosting location is never counted", () => {
  assert.equal(
    countC2Servers([candidate("Iranian Hacking Group Found Hosting C2 Infrastructure in the US")]),
    0,
  );
  assert.equal(countC2Servers([candidate("C2 server hosted in Paris targeting Bordeaux")]), 0);
});

test("a C2 mention without a hosting location is not counted", () => {
  assert.equal(countC2Servers([candidate("NIK C2 malware can use victims' API keys")]), 0);
});

test("a hosting claim without a C2 signal is not counted", () => {
  assert.equal(countC2Servers([candidate("Web server hosted in Bordeaux")]), 0);
});

test("a gray-source claim keeps its own source attribution", () => {
  const [detection] = detectC2Servers([
    candidate("C2 server located in Gironde", { id: "42", source: "ransomwatch", origin: "claim" }),
  ]);
  assert.equal(detection?.id, "claim:42");
  assert.equal(detection?.source, "ransomwatch");
});

test("the same detection read twice is counted once", () => {
  const detections = detectC2Servers([
    candidate("C2 server hosted in Bordeaux"),
    candidate("C2 server hosted in Bordeaux"),
  ]);
  assert.deepEqual(detections.map((d) => d.id), ["event:1"]);
});

test("a published detection carries identifiers only, never victim data", () => {
  const [detection] = detectC2Servers([candidate("alice@example.com C2 server hosted in Bordeaux")]);
  assert.deepEqual(Object.keys(detection!).sort(), ["basis", "id", "location", "source"]);
  assert.doesNotMatch(JSON.stringify(detection), /alice|email|password|body|victim|title|summary/i);
});

test("the measurement reads stored tables through the same rule", async () => {
  const measurement = await measureC2Servers();
  assert.equal(measurement.scope, "nouvelle-aquitaine");
  assert.equal(measurement.basis, "explicit-c2-hosting");
  assert.equal(typeof measurement.baseline.organizations, "number");
  assert.ok(measurement.signalsScanned > 0);
  assert.ok(measurement.c2Sources.some((s) => s.id === C2_SOURCE_ID));
  assert.ok(measurement.detections.some((d) => d.id === `event:${fixtureEventId}`));
  assert.ok(measurement.detections.some((d) => d.source === "ransomwatch" && d.location === "gironde"));
});

test("every scanned signal keeps its source without any text", async () => {
  const measurement = await measureC2Servers();
  assert.equal(measurement.signals.length, measurement.signalsScanned);
  assert.ok(measurement.signals.some((s) => s.id === String(fixtureEventId) && s.source === "ransomlook"));
  assert.deepEqual(Object.keys(measurement.signals[0]!).sort(), ["family", "id", "origin", "source"]);
});

test("GET /api/c2/hosted publishes the English contract without victim data", async () => {
  const response = await app.inject({ method: "GET", url: "/api/c2/hosted" });
  assert.equal(response.statusCode, 200);
  const body = response.json<Record<string, unknown>>();
  assert.deepEqual(Object.keys(body).sort(), [
    "baseline", "basis", "c2Sources", "count", "detections", "measuredAt", "scope", "signals", "signalsScanned",
  ]);
  assert.equal(body.scope, "nouvelle-aquitaine");
  assert.equal(body.basis, "explicit-c2-hosting");
  assert.equal(typeof body.count, "number");
  assert.doesNotMatch(response.body, /victim|email|password|raw|summary/i);
});
