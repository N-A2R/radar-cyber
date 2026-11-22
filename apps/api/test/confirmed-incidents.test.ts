/**
 * One test per confirmed-incident behaviour: trust label, regional scope, grey
 * evidence, official confirmation, deduplication, privacy projection, public
 * HTTP route and the measured corpus total.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import {
  classifyPublisher,
  detectConfirmedIncidents,
  isConfirmedIncident,
  NA_DEPARTMENTS,
  type CorpusIncident,
} from "../src/analyse/confirmed-incidents.js";
import confirmedIncidentsRoute from "../src/routes/confirmed-incidents.js";

const CORPUS = fileURLToPath(new URL("../../../bench/fixtures/corpus-reference-na.json", import.meta.url));
const CONFIRMED: CorpusIncident = {
  id: "test-confirmed",
  departement: "33",
  confiance: "etabli",
  datePublique: "2026-07-16",
  type: "ransomware",
  preuve: { editeur: "Sud Ouest" },
};

function withChanges(changes: Partial<CorpusIncident>): CorpusIncident {
  return { ...CONFIRMED, ...changes };
}

test("real corpus: 33 confirmed incidents, all in Nouvelle-Aquitaine", () => {
  const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { incidents: CorpusIncident[] };
  const result = detectConfirmedIncidents(corpus.incidents);
  assert.equal(result.corpusTotal, 60);
  assert.equal(result.count, 33, "the verified corpus labels 33 incidents as confirmed");
  assert.equal(result.incidents.length, result.count);
  assert.equal(new Set(result.incidents.map((row) => row.id)).size, result.count);
  for (const row of result.incidents) {
    assert.ok((NA_DEPARTMENTS as readonly string[]).includes(row.department), row.department);
  }
  assert.equal(result.byDepartment.reduce((sum, d) => sum + d.count, 0), result.count);
  assert.equal(
    result.byPublisherKind.press + result.byPublisherKind.grey +
      result.byPublisherKind.official + result.byPublisherKind.unknown,
    result.count,
  );
});

test("trust label: press-only and unconfirmed claims are excluded", () => {
  assert.equal(isConfirmedIncident(CONFIRMED), true);
  assert.equal(isConfirmedIncident(withChanges({ id: "test-rapporte", confiance: "rapporte" })), false);
  assert.equal(isConfirmedIncident(withChanges({ id: "test-declare", confiance: "declare" })), false);
  const result = detectConfirmedIncidents([
    CONFIRMED,
    withChanges({ id: "test-rapporte", confiance: "rapporte" }),
    withChanges({ id: "test-declare", confiance: "declare" }),
  ]);
  assert.equal(result.count, 1);
  assert.deepEqual(result.incidents.map((row) => row.id), ["test-confirmed"]);
});

test("scope: incidents outside Nouvelle-Aquitaine are excluded", () => {
  for (const departement of ["75", "972", ""]) {
    assert.equal(isConfirmedIncident(withChanges({ id: `test-${departement}`, departement })), false, departement);
  }
  assert.equal(detectConfirmedIncidents([CONFIRMED, withChanges({ id: "test-75", departement: "75" })]).count, 1);
});

test("grey public publishers never turn the corpus label into confirmation", () => {
  for (const editeur of ["Cyber Breaches", "Cyberattaque.org", "ZATAZ", "Clubic"]) {
    const incident = withChanges({ id: `grey-${editeur}`, preuve: { editeur } });
    assert.equal(classifyPublisher(editeur), "grey", editeur);
    assert.equal(isConfirmedIncident(incident), true, editeur);
  }
  const result = detectConfirmedIncidents([
    CONFIRMED,
    withChanges({ id: "grey-cyber", preuve: { editeur: "Cyber Breaches" } }),
  ]);
  assert.equal(result.count, 2);
  assert.equal(result.withGreySource, 1);
  assert.equal(result.byPublisherKind.grey, 1);
});

test("official confirmation is corroborating evidence, not required by the label", () => {
  const official = withChanges({
    id: "test-official",
    preuve: { editeur: "Ville de Limoges (communiqué officiel)" },
  });
  assert.equal(classifyPublisher("Ville de Limoges (communiqué officiel)"), "official");
  assert.equal(isConfirmedIncident(official), true);
  const result = detectConfirmedIncidents([CONFIRMED, official]);
  assert.equal(result.count, 2);
  assert.equal(result.byPublisherKind.official, 1);
});

test("deduplication: one verified incident counts once", () => {
  const result = detectConfirmedIncidents([CONFIRMED, CONFIRMED, withChanges({ datePublique: "2026-08-01" })]);
  assert.equal(result.count, 1);
  assert.equal(result.incidents[0].publicationDate, "2026-07-16");
});

test("privacy: projection carries no victim name, free text or article URL", () => {
  const incident = withChanges({
    entite: "VICTIM_NAME_MARKER",
    resume: "RESUME_MARKER",
    verification: "VERIFICATION_MARKER",
    preuve: { editeur: "Sud Ouest", url: "https://article.example/private" } as CorpusIncident["preuve"],
  });
  const serialised = JSON.stringify(detectConfirmedIncidents([incident]));
  for (const marker of ["VICTIM_NAME_MARKER", "RESUME_MARKER", "VERIFICATION_MARKER", "https://article.example/private"]) {
    assert.equal(serialised.includes(marker), false, marker);
  }
  assert.deepEqual(Object.keys(detectConfirmedIncidents([incident]).incidents[0]).sort(), [
    "department", "id", "incidentType", "publicationDate", "publisherKind",
  ]);
});

test("public route: measured count and privacy-safe fields", async () => {
  const app = Fastify();
  await app.register(confirmedIncidentsRoute, { prefix: "/api" });
  await app.ready();
  try {
    const response = await app.inject({ method: "GET", url: "/api/confirmed-incidents/incidents" });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json<{ count: number; incidents: Record<string, unknown>[] }>();
    assert.equal(body.count, 33);
    assert.equal(body.incidents.length, 33);
    for (const row of body.incidents) {
      assert.deepEqual(Object.keys(row).sort(), [
        "department", "id", "incidentType", "publicationDate", "publisherKind",
      ]);
    }
  } finally {
    await app.close();
  }
});
