import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreConfidence,
  SCORE_LEVELS,
  SCORE_WEIGHTS,
  type FactSource,
} from "../src/analyse/confidence-score.js";
import {
  computeConfidence,
  datePrecision,
  groupFactsWithCorpus,
  sourceRank,
  type EventForScore,
} from "../src/analyse/confidence-service.js";
import type { ValidatedCorpus } from "../src/analyse/validated-corpus.js";

const NOW = new Date("2026-11-21T12:00:00Z");
const EMPTY_CORPUS: ValidatedCorpus = {
  incidents: 0,
  urls: new Set(),
  publishers: new Set(),
  entities: [],
};

function source(sourceId: string, overrides: Partial<FactSource> = {}): FactSource {
  return {
    sourceId,
    rank: "primary",
    date: "2026-11-20T10:00:00Z",
    precision: "certain",
    ...overrides,
  };
}

function event(id: number, overrides: Partial<EventForScore> = {}): EventForScore {
  return {
    id,
    family: "cti",
    assertionType: "confirmed_incident",
    title: "Rançongiciel chez un hôpital de Nouvelle-Aquitaine",
    summary: null,
    observedAt: "2026-11-20T10:00:00Z",
    at: "2026-11-20T11:00:00Z",
    collectedAt: "2026-11-20T11:00:00Z",
    confidence: "B2",
    sourceId: `source-${id}`,
    sourceFamily: "cti",
    sourceName: "Source",
    sourceUrl: null,
    orgId: 12,
    regional: true,
    ...overrides,
  };
}

test("deux lignes d'une même source ne corroborent rien", () => {
  const score = scoreConfidence({
    sources: [source("same"), source("same")],
    corpusPresence: "absent",
  }, {}, NOW);
  assert.equal(score.measures.independentSources, 1);
  assert.equal(score.components.independentSources, 0.2);
  assert.match(score.breakdown[0].reason, /one source/);
});

test("deux sources indépendantes pèsent plus qu'une, trois atteignent le maximum", () => {
  const base = { corpusPresence: "absent" as const };
  const one = scoreConfidence({ ...base, sources: [source("a")] }, {}, NOW);
  const two = scoreConfidence({ ...base, sources: [source("a"), source("b")] }, {}, NOW);
  const three = scoreConfidence({ ...base, sources: [source("a"), source("b"), source("c")] }, {}, NOW);
  assert.equal(one.measures.independentSources, 1);
  assert.equal(two.measures.independentSources, 2);
  assert.equal(three.measures.independentSources, 3);
  assert.ok(one.score < two.score && two.score < three.score);
  assert.equal(three.components.independentSources, 1);
});

test("la décomposition est complète : quatre lignes, somme égale à la note", () => {
  const score = scoreConfidence({
    sources: [source("a"), source("b", { rank: "secondary" })],
    corpusPresence: "publisher",
  }, {}, NOW);
  assert.equal(score.breakdown.length, 4);
  assert.deepEqual(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 1);
  assert.equal(Math.round(score.breakdown.reduce((sum, line) => sum + line.points, 0)), score.score);
  for (const line of score.breakdown) assert.ok(line.reason.length > 0);
  assert.deepEqual(Object.keys(score.components), Object.keys(SCORE_WEIGHTS));
  assert.ok(score.level === "high" || score.level === "medium" || score.level === "low");
  assert.equal(SCORE_LEVELS.high, 70);
});

test("une source primaire vaut mieux que deux relais", () => {
  const primary = scoreConfidence({ sources: [source("a")], corpusPresence: "absent" }, {}, NOW);
  const relays = scoreConfidence({
    sources: [source("a", { rank: "secondary" }), source("b", { rank: "secondary" })],
    corpusPresence: "absent",
  }, {}, NOW);
  assert.equal(primary.components.sourceQuality, 1);
  assert.equal(relays.components.sourceQuality, 0.5);
  assert.equal(relays.measures.primarySources, 0);
});

test("une date future n'apporte aucune cohérence temporelle", () => {
  const score = scoreConfidence({
    sources: [source("a", { date: "2099-01-01T00:00:00Z" })],
    corpusPresence: "absent",
  }, {}, NOW);
  assert.equal(score.components.temporalCoherence, 0);
  assert.match(score.breakdown[2].reason, /future/);
});

test("présence exacte > éditeur du corpus > absente", () => {
  const base = { sources: [source("a")] };
  const exact = scoreConfidence({ ...base, corpusPresence: "exact" }, {}, NOW);
  const publisher = scoreConfidence({ ...base, corpusPresence: "publisher" }, {}, NOW);
  const absent = scoreConfidence({ ...base, corpusPresence: "absent" }, {}, NOW);
  assert.equal(exact.components.validatedCorpus, 1);
  assert.equal(publisher.components.validatedCorpus, 0.5);
  assert.equal(absent.components.validatedCorpus, 0);
  assert.ok(exact.score > publisher.score && publisher.score > absent.score);
});

test("regroupement : deux sources sur 72 h donnent un fait corroboré", () => {
  const facts = groupFactsWithCorpus([
    event(1, { sourceId: "a" }),
    event(2, { sourceId: "b", observedAt: "2026-11-20T12:00:00Z" }),
  ], EMPTY_CORPUS, NOW);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].sources.length, 2);
  assert.equal(facts[0].score.measures.independentSources, 2);
});

test("regroupement : au-delà de 72 h, deux faits distincts", () => {
  const facts = groupFactsWithCorpus([
    event(1, { sourceId: "a" }),
    event(2, { sourceId: "b", observedAt: "2026-11-24T10:00:00Z" }),
  ], EMPTY_CORPUS, NOW);
  assert.equal(facts.length, 2);
  assert.ok(facts.every((fact) => fact.sources.length === 1));
});

test("le rang de source distingue producteur direct et relais", () => {
  assert.equal(sourceRank(event(1, { confidence: "A1" })), "primary");
  assert.equal(sourceRank(event(2, { confidence: "C3" })), "secondary");
  assert.equal(sourceRank(event(3, { sourceFamily: "cert_fr", confidence: null })), "primary");
});

test("la précision de date distingue publication, inférence et collecte", () => {
  assert.equal(datePrecision(event(1), NOW), "certain");
  assert.equal(datePrecision(event(2, { observedAt: "2026-01-01T00:00:00Z" }), NOW), "inferred");
  assert.equal(datePrecision(event(3, { observedAt: null }), NOW), "collection");
});

test("les scores de rattachement existent seulement pour les événements rattachés", () => {
  const batch = computeConfidence([
    event(1, { sourceId: "a", orgId: 12 }),
    event(2, { sourceId: "b", orgId: null }),
  ], NOW, EMPTY_CORPUS);
  assert.equal(batch.events.length, 2);
  assert.equal(batch.attachments.length, 1);
  assert.equal(batch.attachments[0].orgId, 12);
  assert.equal(batch.factScores.length, 2);
});


test("un fait technique n'est pas un incident, une revendication si", () => {
  const facts = groupFactsWithCorpus([
    event(1, { assertionType: "technical_indicator", sourceId: "a", title: "Indicateur" }),
    event(2, { assertionType: "third_party_claim", sourceId: "b", title: "Revendication" }),
  ], EMPTY_CORPUS, NOW);
  assert.equal(facts.find((fact) => fact.title === "Indicateur")?.incident, false);
  assert.equal(facts.find((fact) => fact.title === "Revendication")?.incident, true);
});