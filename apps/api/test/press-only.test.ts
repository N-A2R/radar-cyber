/**
 * One test per press-only behaviour: trust label, regional scope, grey sources,
 * official exclusion, deduplication, privacy projection and public HTTP route.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import {
  classifyPublisher,
  detectPressOnly,
  isPressOnly,
  NA_DEPARTMENTS,
  type CorpusIncident,
} from "../src/analyse/press-only.js";
import pressOnlyRoute from "../src/routes/press-only.js";

const CORPUS = fileURLToPath(new URL("../../../bench/fixtures/corpus-reference-na.json", import.meta.url));
const PRESS: CorpusIncident = {
  id: "test-press",
  departement: "33",
  confiance: "rapporte",
  datePublique: "2026-04-09",
  type: "fuite",
  preuve: { editeur: "Sud Ouest" },
};

function withChanges(changes: Partial<CorpusIncident>): CorpusIncident {
  return { ...PRESS, ...changes };
}

test("real corpus: 21 press-only incidents, all in Nouvelle-Aquitaine", () => {
  const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { incidents: CorpusIncident[] };
  const result = detectPressOnly(corpus.incidents);
  assert.equal(result.corpusTotal, 60);
  assert.equal(result.count, 21, "the verified corpus labels 21 incidents as press-only");
  assert.equal(result.incidents.length, result.count);
  assert.equal(new Set(result.incidents.map((row) => row.id)).size, result.count);
  for (const row of result.incidents) {
    assert.ok((NA_DEPARTMENTS as readonly string[]).includes(row.department), row.department);
  }
  assert.equal(result.byDepartment.reduce((sum, d) => sum + d.count, 0), result.count);
  assert.equal(result.byPublisherKind.press + result.byPublisherKind.grey, result.count);
});

test("trust label: confirmed and claim-only incidents are excluded", () => {
  assert.equal(isPressOnly(PRESS), true);
  assert.equal(isPressOnly(withChanges({ id: "test-etabli", confiance: "etabli" })), false);
  assert.equal(isPressOnly(withChanges({ id: "test-declare", confiance: "declare" })), false);
  const result = detectPressOnly([
    PRESS,
    withChanges({ id: "test-etabli", confiance: "etabli" }),
    withChanges({ id: "test-declare", confiance: "declare" }),
  ]);
  assert.equal(result.count, 1);
  assert.deepEqual(result.incidents.map((row) => row.id), ["test-press"]);
});

test("scope: incidents outside Nouvelle-Aquitaine are excluded", () => {
  for (const departement of ["75", "972", ""]) {
    assert.equal(isPressOnly(withChanges({ id: `test-${departement}`, departement })), false, departement);
  }
  assert.equal(detectPressOnly([PRESS, withChanges({ id: "test-75", departement: "75" })]).count, 1);
});

test("grey public publishers count as press evidence", () => {
  for (const editeur of ["ZATAZ", "Clubic", "TNTIC", "Cyberattaque.org", "FrenchBreaches"]) {
    const incident = withChanges({ id: `grey-${editeur}`, preuve: { editeur } });
    assert.equal(classifyPublisher(editeur), "grey", editeur);
    assert.equal(isPressOnly(incident), true, editeur);
  }
  const result = detectPressOnly([
    PRESS,
    withChanges({ id: "grey-zataz", preuve: { editeur: "ZATAZ" } }),
  ]);
  assert.equal(result.count, 2);
  assert.equal(result.withGreySource, 1);
  assert.equal(result.byPublisherKind.grey, 1);
});

test("official publisher disqualifies a press-labelled incident", () => {
  const incident = withChanges({
    id: "test-official",
    sourcesAdditionnelles: [{ editeur: "Ville de Tarnos (communiqué officiel)" }],
  });
  assert.equal(classifyPublisher("Ville de Tarnos (communiqué officiel)"), "official");
  assert.equal(isPressOnly(incident), false);
  assert.equal(detectPressOnly([PRESS, incident]).count, 1);
});

test("deduplication: one verified event counts once", () => {
  const result = detectPressOnly([PRESS, PRESS, withChanges({ datePublique: "2026-05-01" })]);
  assert.equal(result.count, 1);
  assert.equal(result.incidents[0].publicationDate, "2026-04-09");
});

test("privacy: projection carries no victim name, free text or article URL", () => {
  const incident = withChanges({
    entite: "VICTIM_NAME_MARKER",
    resume: "RESUME_MARKER",
    verification: "VERIFICATION_MARKER",
    preuve: { editeur: "Sud Ouest" },
  });
  const serialised = JSON.stringify(detectPressOnly([incident]));
  for (const marker of ["VICTIM_NAME_MARKER", "RESUME_MARKER", "VERIFICATION_MARKER"]) {
    assert.equal(serialised.includes(marker), false, marker);
  }
  assert.deepEqual(Object.keys(detectPressOnly([incident]).incidents[0]).sort(), [
    "department", "id", "incidentType", "publicationDate", "publisherKind",
  ]);
});

test("public route: measured count and privacy-safe fields", async () => {
  const app = Fastify();
  await app.register(pressOnlyRoute, { prefix: "/api" });
  await app.ready();
  try {
    const response = await app.inject({ method: "GET", url: "/api/press-only/incidents" });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json<{ count: number; incidents: Record<string, unknown>[] }>();
    assert.equal(body.count, 21);
    assert.equal(body.incidents.length, 21);
    for (const row of body.incidents) {
      assert.deepEqual(Object.keys(row).sort(), [
        "department", "id", "incidentType", "publicationDate", "publisherKind",
      ]);
    }
  } finally {
    await app.close();
  }
});
