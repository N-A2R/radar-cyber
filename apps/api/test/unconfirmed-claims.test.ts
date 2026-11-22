/**
 * One test per unconfirmed-claim behaviour: trust label, regional scope, grey
 * evidence, official exclusion, deduplication, privacy projection, public HTTP
 * route and the measured corpus total.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import {
  classifyPublisher,
  detectUnconfirmedClaims,
  isUnconfirmedClaim,
  NA_DEPARTMENTS,
  type CorpusIncident,
} from "../src/analyse/unconfirmed-claims.js";
import unconfirmedClaimsRoute from "../src/routes/unconfirmed-claims.js";

const CORPUS = fileURLToPath(new URL("../../../bench/fixtures/corpus-reference-na.json", import.meta.url));
const CLAIM: CorpusIncident = {
  id: "test-claim",
  departement: "33",
  confiance: "declare",
  datePublique: "2026-07-16",
  type: "ransomware",
  preuve: { editeur: "FrenchBreaches" },
};

function withChanges(changes: Partial<CorpusIncident>): CorpusIncident {
  return { ...CLAIM, ...changes };
}

test("real corpus: 6 unconfirmed claims, all in Nouvelle-Aquitaine", () => {
  const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { incidents: CorpusIncident[] };
  const result = detectUnconfirmedClaims(corpus.incidents);
  assert.equal(result.corpusTotal, 60);
  assert.equal(result.count, 6, "the verified corpus labels 6 incidents as unconfirmed claims");
  assert.equal(result.incidents.length, result.count);
  assert.equal(new Set(result.incidents.map((row) => row.id)).size, result.count);
  for (const row of result.incidents) {
    assert.ok((NA_DEPARTMENTS as readonly string[]).includes(row.department), row.department);
  }
  assert.equal(result.byDepartment.reduce((sum, d) => sum + d.count, 0), result.count);
  assert.equal(result.byPublisherKind.press + result.byPublisherKind.grey + result.byPublisherKind.unknown, result.count);
});

test("trust label: confirmed and press-only incidents are excluded", () => {
  assert.equal(isUnconfirmedClaim(CLAIM), true);
  assert.equal(isUnconfirmedClaim(withChanges({ id: "test-etabli", confiance: "etabli" })), false);
  assert.equal(isUnconfirmedClaim(withChanges({ id: "test-rapporte", confiance: "rapporte" })), false);
  const result = detectUnconfirmedClaims([
    CLAIM,
    withChanges({ id: "test-etabli", confiance: "etabli" }),
    withChanges({ id: "test-rapporte", confiance: "rapporte" }),
  ]);
  assert.equal(result.count, 1);
  assert.deepEqual(result.incidents.map((row) => row.id), ["test-claim"]);
});

test("scope: incidents outside Nouvelle-Aquitaine are excluded", () => {
  for (const departement of ["75", "972", ""]) {
    assert.equal(isUnconfirmedClaim(withChanges({ id: `test-${departement}`, departement })), false, departement);
  }
  assert.equal(detectUnconfirmedClaims([CLAIM, withChanges({ id: "test-75", departement: "75" })]).count, 1);
});

test("grey public publishers are claim evidence, never confirmation", () => {
  for (const editeur of ["FrenchBreaches", "ZATAZ", "Clubic", "TNTIC", "Cyberattaque.org"]) {
    const incident = withChanges({ id: `grey-${editeur}`, preuve: { editeur } });
    assert.equal(classifyPublisher(editeur), "grey", editeur);
    assert.equal(isUnconfirmedClaim(incident), true, editeur);
  }
  const result = detectUnconfirmedClaims([
    CLAIM,
    withChanges({ id: "grey-zataz", preuve: { editeur: "ZATAZ" } }),
  ]);
  assert.equal(result.count, 2);
  assert.equal(result.withGreySource, 2);
  assert.equal(result.byPublisherKind.grey, 2);
});

test("official publisher disqualifies an unconfirmed claim", () => {
  const incident = withChanges({
    id: "test-official",
    sourcesAdditionnelles: [{ editeur: "Ville de Tarnos (communiqué officiel)" }],
  });
  assert.equal(classifyPublisher("Ville de Tarnos (communiqué officiel)"), "official");
  assert.equal(isUnconfirmedClaim(incident), false);
  assert.equal(detectUnconfirmedClaims([CLAIM, incident]).count, 1);
});

test("deduplication: one verified claim counts once", () => {
  const result = detectUnconfirmedClaims([CLAIM, CLAIM, withChanges({ datePublique: "2026-08-01" })]);
  assert.equal(result.count, 1);
  assert.equal(result.incidents[0].publicationDate, "2026-07-16");
});

test("privacy: projection carries no victim name, free text or article URL", () => {
  const incident = withChanges({
    entite: "VICTIM_NAME_MARKER",
    resume: "RESUME_MARKER",
    verification: "VERIFICATION_MARKER",
    preuve: { editeur: "FrenchBreaches", url: "https://article.example/private" } as CorpusIncident["preuve"],
  });
  const serialised = JSON.stringify(detectUnconfirmedClaims([incident]));
  for (const marker of ["VICTIM_NAME_MARKER", "RESUME_MARKER", "VERIFICATION_MARKER", "https://article.example/private"]) {
    assert.equal(serialised.includes(marker), false, marker);
  }
  assert.deepEqual(Object.keys(detectUnconfirmedClaims([incident]).incidents[0]).sort(), [
    "department", "id", "incidentType", "publicationDate", "publisherKind",
  ]);
});

test("public route: measured count and privacy-safe fields", async () => {
  const app = Fastify();
  await app.register(unconfirmedClaimsRoute, { prefix: "/api" });
  await app.ready();
  try {
    const response = await app.inject({ method: "GET", url: "/api/unconfirmed-claims/incidents" });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json<{ count: number; incidents: Record<string, unknown>[] }>();
    assert.equal(body.count, 6);
    assert.equal(body.incidents.length, 6);
    for (const row of body.incidents) {
      assert.deepEqual(Object.keys(row).sort(), [
        "department", "id", "incidentType", "publicationDate", "publisherKind",
      ]);
    }
  } finally {
    await app.close();
  }
});
