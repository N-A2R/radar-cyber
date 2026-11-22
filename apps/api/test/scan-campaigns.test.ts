/**
 * One behavior per test for passive mass-scan campaign detection.
 *
 * Pure rules are checked on public-text fixtures; two database tests and one
 * HTTP test verify that the reproducible measurement and the route share the
 * same rule. No victim payload is inserted or read.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
  extractScanSignals,
  groupScanCampaigns,
  isPublicIpv4,
  redactPersonalData,
  type ScanCandidate,
  type ScanSignal,
} from "../src/scan/detect.js";
import { measureScanCampaigns } from "../src/scan/measure.js";
import scanCampaignsRoute from "../src/routes/scan-campaigns.js";
import { installAccessControl } from "../src/security/rbac.js";

const TAG = `scan${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE_A = `${TAG}-a`;
const SOURCE_B = `${TAG}-b`;
const SOURCE_GREY = `${TAG}-grey`;
const PERIMETER_IP = "109.234.166.247";

function candidate(text: string, overrides: Partial<ScanCandidate> = {}): ScanCandidate {
  return {
    id: "1",
    source: "public-feed",
    text,
    origin: "event",
    observedAt: "2026-11-22T10:00:00Z",
    ...overrides,
  };
}

function signal(source: string, observedAt: string, subnet = "203.0.113.0/24"): ScanSignal {
  return {
    id: `${source}:${observedAt}`,
    source,
    origin: "event",
    target: subnet.replace(".0/24", ".42"),
    subnet,
    attribution: "na-locality",
    locality: "bordeaux",
    observedAt,
    tool: null,
  };
}

let app: FastifyInstance;
const eventIds: number[] = [];

before(async () => {
  for (const [id, name, family] of [
    [SOURCE_A, "Public CTI feed A", "cti"],
    [SOURCE_B, "Public CTI feed B", "cti"],
    [SOURCE_GREY, "Ransomware tracker", "ransomware"],
  ]) {
    await query(
      `INSERT INTO source (id, name, family, url, license, retain_raw)
       VALUES ($1, $2, $3, $4, NULL, false)`,
      [id, name, family, "https://example.invalid/feed"],
    );
  }

  const insertEvent = async (source: string, title: string, day: string): Promise<void> => {
    const row = await query<{ id: number }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity, source_id, evidence)
       VALUES ($1, 'cti', 'reported_observation', $2, $3, 3, $4, '{}') RETURNING id`,
      [`${TAG}-${source}-${day}`, title, day, source],
    );
    eventIds.push(Number(row.rows[0]!.id));
  };

  await insertEvent(SOURCE_A, "Mass port scan of 203.0.113.42 observed in Bordeaux", "2026-11-20T09:00:00Z");
  await insertEvent(SOURCE_B, "Coordinated scan waves hit 203.0.113.77 in Gironde", "2026-11-22T09:00:00Z");
  await query(
    `INSERT INTO quarantine_raw (source, source_url, org_hint, content_hash, claimed_at, tlp, status, kind)
     VALUES ($1, $2, $3, $4, '2026-11-21T09:00:00Z', 'RED', 'reviewed', 'claim')`,
    [SOURCE_GREY, "https://example.invalid/claim", `Scan massif contre ${PERIMETER_IP}`, `${TAG}-claim`],
  );

  app = Fastify({ logger: false });
  installAccessControl(app);
  await app.register(scanCampaignsRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (eventIds.length > 0) {
    await query("DELETE FROM event WHERE id = ANY($1::int[])", [eventIds]);
  }
  await query("DELETE FROM quarantine_raw WHERE content_hash = $1", [`${TAG}-claim`]);
  for (const id of [SOURCE_A, SOURCE_B, SOURCE_GREY]) {
    await query("DELETE FROM source WHERE id = $1", [id]);
  }
  await closePools();
});

test("an explicit port scan against an NA IP is a signal", () => {
  const signals = extractScanSignals([
    candidate("Mass port scan of 203.0.113.42 observed in Bordeaux"),
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]!.target, "203.0.113.42");
  assert.equal(signals[0]!.attribution, "na-locality");
  assert.equal(signals[0]!.locality, "bordeaux");
});

test("a vulnerability title mentioning a scanner is not a scan signal", () => {
  const signals = extractScanSignals([
    candidate("CVE-2026-1234: QR Code Scanner plugin mass scan", { family: "vuln" }),
    candidate("CVE-2026-1235: port scan against 203.0.113.42 in Bordeaux"),
  ]);
  assert.deepEqual(signals, []);
});

test("a private or loopback address is not an NA scan target", () => {
  assert.equal(isPublicIpv4("192.168.1.10"), false);
  assert.equal(isPublicIpv4("127.0.0.1"), false);
  const signals = extractScanSignals([
    candidate("Mass port scan of 10.0.0.5 in Bordeaux"),
  ]);
  assert.deepEqual(signals, []);
});

test("a public NA IP in the passive perimeter needs no locality in the text", () => {
  const signals = extractScanSignals(
    [candidate("Massive network scan of 109.234.166.247")],
    { naIps: new Set([PERIMETER_IP]) },
  );
  assert.equal(signals.length, 1);
  assert.equal(signals[0]!.attribution, "na-ip-perimeter");
});

test("an explicit foreign location vetoes an NA attribution", () => {
  const signals = extractScanSignals([
    candidate("Mass port scan of 203.0.113.42 in Paris"),
  ]);
  assert.deepEqual(signals, []);
});

test("a repeated report of the same target by one source on one day is collapsed", () => {
  const repeated = candidate("Mass port scan of 203.0.113.42 in Bordeaux", { id: "2" });
  const signals = extractScanSignals([
    candidate("Mass port scan of 203.0.113.42 in Bordeaux"),
    repeated,
  ]);
  assert.equal(signals.length, 1);
});

test("two public sources scanning the same /24 form one campaign", () => {
  const signals = extractScanSignals([
    candidate("Mass port scan of 203.0.113.42 in Bordeaux", {
      source: SOURCE_A,
      observedAt: "2026-11-20T09:00:00Z",
    }),
    candidate("Network scan hit 203.0.113.77 in Gironde", {
      source: SOURCE_B,
      observedAt: "2026-11-22T09:00:00Z",
    }),
  ]);
  const campaigns = groupScanCampaigns(signals);
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0]!.subnet, "203.0.113.0/24");
  assert.deepEqual(campaigns[0]!.sources, [SOURCE_A, SOURCE_B]);
});

test("one source alone is an observation, not a campaign", () => {
  const campaigns = groupScanCampaigns([
    signal(SOURCE_A, "2026-11-20T09:00:00Z"),
    signal(SOURCE_A, "2026-11-22T09:00:00Z"),
  ]);
  assert.deepEqual(campaigns, []);
});

test("reports outside the rolling window are separate campaigns", () => {
  const campaigns = groupScanCampaigns([
    signal(SOURCE_A, "2026-09-01T09:00:00Z"),
    signal(SOURCE_B, "2026-09-03T09:00:00Z"),
    signal(SOURCE_A, "2026-11-20T09:00:00Z"),
    signal(SOURCE_B, "2026-11-22T09:00:00Z"),
  ]);
  assert.equal(campaigns.length, 2);
});

test("victim e-mails and phone numbers are removed before classification", () => {
  const cleaned = redactPersonalData(
    "Victim victim@example.com called 0612345678 about a mass port scan in Bordeaux",
  );
  assert.equal(cleaned.includes("victim@example.com"), false);
  assert.equal(cleaned.includes("0612345678"), false);
  assert.equal(cleaned.includes("mass port scan"), true);
});

test("the reproducible measurement finds the campaign from the real corpus", async () => {
  const measurement = await measureScanCampaigns({ sourceIds: [SOURCE_A, SOURCE_B] });
  assert.equal(measurement.count, 1);
  assert.equal(measurement.campaigns[0]!.subnet, "203.0.113.0/24");
  assert.ok(measurement.baseline.organizations >= 1);
});

test("a gray source stays eligible as a public scan signal", async () => {
  const measurement = await measureScanCampaigns({ sourceIds: [SOURCE_GREY] });
  assert.equal(measurement.signals.length, 1);
  assert.equal(measurement.signals[0]!.source, SOURCE_GREY);
  assert.equal(measurement.count, 0);
});

test("the public route exposes the count without any victim text", async () => {
  const response = await app.inject({ method: "GET", url: "/api/scan/campaigns" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.scope, "nouvelle-aquitaine");
  assert.equal(typeof body.count, "number");
  assert.equal(JSON.stringify(body).includes("victim@example.com"), false);
  for (const campaign of body.campaigns) {
    assert.equal("text" in campaign, false);
  }
});
