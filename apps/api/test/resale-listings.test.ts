/**
 * One behavior per test for Nouvelle-Aquitaine resale listing detection.
 *
 * Pure rules run on fixtures; one database test and one HTTP test check that
 * the reproducible measurement and the API share the same rule. No victim
 * payload is ever inserted or read.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import {
  countResaleListings,
  detectResaleListings,
  isNaDepartment,
  isSaleOffer,
  mentionsNa,
  type ResaleCandidate,
} from "../src/resale/detect.js";
import { measureResaleListings } from "../src/resale/measure.js";
import resaleListingsRoute from "../src/routes/resale-listings.js";
import { installAccessControl } from "../src/security/rbac.js";

const TAG = `rl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DOMAIN = `${TAG}.example`;
const HASH = `${TAG}-claim`;

function candidate(text: string, overrides: Partial<ResaleCandidate> = {}): ResaleCandidate {
  return { id: "1", source: "ransomwatch", text, origin: "claim", ...overrides };
}

let app: FastifyInstance;
let fixtureOrgId: number;
let fixtureEventId: number;

before(async () => {
  const inserted = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain, status)
     VALUES ($1, $2, 'entreprise', '33', $3, 'confirme') RETURNING id`,
    [`Resale Fixture ${TAG}`, `${TAG}-org`, DOMAIN],
  );
  fixtureOrgId = Number(inserted.rows[0]!.id);
  const event = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, org_id, evidence)
     VALUES ($1, 'ransomware', 'third_party_claim', $2, 3, 'ransomlook', $3, '{}') RETURNING id`,
    [`${TAG}-event`, "DATA SALE — database offered for purchase", fixtureOrgId],
  );
  fixtureEventId = Number(event.rows[0]!.id);
  await query(
    `INSERT INTO quarantine_raw (source, source_url, org_hint, content_hash, tlp, status, kind)
     VALUES ('ransomwatch', 'https://example.invalid/test', $1, $2, 'RED', 'reviewed', 'claim')`,
    [`data-selling.${DOMAIN}`, HASH],
  );

  app = Fastify({ logger: false });
  installAccessControl(app);
  await app.register(resaleListingsRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM event WHERE id = $1", [fixtureEventId]);
  await query("DELETE FROM quarantine_raw WHERE content_hash = $1", [HASH]);
  await query("DELETE FROM org WHERE id = $1", [fixtureOrgId]);
  await closePools();
});

test("an explicit English offer of data is recognized", () => {
  assert.equal(isSaleOffer("Se.com — 1.5TB DATA SALE"), true);
  assert.equal(isSaleOffer("Medical records for sale on a darknet forum"), true);
});

test("a French offer of data is recognized", () => {
  assert.equal(isSaleOffer("Base de données à vendre"), true);
  assert.equal(isSaleOffer("Revente de fichiers clients"), true);
});

test("generic commerce wording is not a resale listing", () => {
  assert.equal(isSaleOffer("Point of sale terminal vulnerability"), false);
  assert.equal(isSaleOffer("Selling tickets for local events"), false);
});

test("a sale marker without a data object is not counted", () => {
  assert.equal(isSaleOffer("Family car for sale"), false);
  assert.equal(isSaleOffer("Solar panels selling fast"), false);
});

test("NA department codes and labels scope a listing", () => {
  assert.equal(isNaDepartment("33"), true);
  assert.equal(isNaDepartment("Gironde"), true);
  assert.equal(countResaleListings([candidate("DATA SALE database", { department: "Deux-Sèvres" })]), 1);
});

test("an explicit Nouvelle-Aquitaine locality scopes a listing", () => {
  assert.equal(mentionsNa("Customer database for sale in Bordeaux"), true);
  assert.equal(countResaleListings([candidate("Database for sale in Bordeaux")]), 1);
});

test("a list outside Nouvelle-Aquitaine is never counted", () => {
  assert.equal(isNaDepartment("75"), false);
  assert.equal(mentionsNa("Database for sale in Lyon"), false);
  assert.equal(countResaleListings([candidate("Database for sale in Lyon", { department: "69" })]), 0);
});

test("a gray source claim is attached by an NA organization domain", () => {
  const naDomains = new Set([DOMAIN]);
  const listings = detectResaleListings(
    [candidate("Data selling", { domainHint: `https://data-selling.${DOMAIN}/post`, source: "ransomwatch" })],
    naDomains,
  );
  assert.equal(listings.length, 1);
  assert.equal(listings[0]!.basis, "domain");
});

test("the same listing read twice is counted once", () => {
  const listings = detectResaleListings([
    candidate("DATA SALE database", { department: "33" }),
    candidate("DATA SALE database", { department: "33" }),
  ]);
  assert.deepEqual(listings.map((l) => l.id), ["claim:1"]);
});

test("a published listing carries identifiers only, never victim data", () => {
  const [listing] = detectResaleListings([candidate("alice@example.com DATA SALE database", { department: "33" })]);
  assert.deepEqual(Object.keys(listing!).sort(), ["basis", "id", "source"]);
  assert.doesNotMatch(JSON.stringify(listing), /alice|email|password|body|victim/i);
});

test("the measurement reads stored tables through the same rule", async () => {
  const measurement = await measureResaleListings();
  assert.equal(measurement.scope, "nouvelle-aquitaine");
  assert.equal(measurement.basis, "explicit-sale");
  assert.equal(typeof measurement.baseline.organizations, "number");
  assert.ok(measurement.candidatesScanned > 0);
  assert.ok(measurement.listings.some((l) => l.id === `event:${fixtureEventId}`));
  assert.ok(measurement.listings.some((l) => l.source === "ransomwatch" && l.basis === "domain"));
});

test("GET /api/resale/listings publishes the English contract without victim data", async () => {
  const response = await app.inject({ method: "GET", url: "/api/resale/listings" });
  assert.equal(response.statusCode, 200);
  const body = response.json<Record<string, unknown>>();
  assert.deepEqual(Object.keys(body).sort(), [
    "baseline", "basis", "candidatesScanned", "count", "measuredAt", "saleOffersAll", "scope",
  ]);
  assert.equal(body.scope, "nouvelle-aquitaine");
  assert.equal(body.basis, "explicit-sale");
  assert.equal(typeof body.count, "number");
  assert.doesNotMatch(response.body, /raw|victim|email|password/i);
});
