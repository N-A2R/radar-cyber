/**
 * One test per behaviour of the J-21 precision measurement.
 * Pure, deterministic, no database and no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePrecision,
  hasValidatedSignal,
  renderFrenchReport,
  validateCorpus,
  validateSnapshots,
  type Incident100,
} from "../src/analyse/precision-anticipation.js";
import type { EvenementInstantane, Instantane } from "../src/analyse/rapport-anticipation.js";

const DATE = "2026-01-31";
const J21 = "2026-01-10";
const START = "2025-12-21";

function incident(id: string, overrides: Partial<Incident100> = {}): Incident100 {
  return {
    id,
    entite: "Alpha Bravo (Paris)",
    departement: "33",
    dateIncident: DATE,
    dateReference: DATE,
    dateReferenceType: "dateIncident",
    aliases: ["alpha bravo"],
    ...overrides,
  };
}

function corpus(): Incident100[] {
  return Array.from({ length: 100 }, (_, index) => incident(`inc-${String(index).padStart(3, "0")}`));
}

function event(titre: string, assertionType = "ambient_signal"): EvenementInstantane {
  return {
    id: 1,
    family: "cti",
    assertion_type: assertionType,
    titre,
    valid_at: "2026-01-05T12:00:00.000Z",
    source_id: "src-test",
    org_id: null,
  };
}

function snapshot(id: string, events: EvenementInstantane[] = []): Instantane {
  return {
    incident: { id, entite: "Alpha Bravo (Paris)", dateReference: DATE, typeReference: "dateIncident" },
    j21: J21,
    fenetre: { debut: START, fin: J21, jours: 21 },
    comptes: {
      evenements_avant_j21: events.length,
      evenements_fenetre: events.length,
      sources_actives: 0,
      organisations_citees: 0,
    },
    evenements: events,
    sources_actives: [],
    organisations_citees: [],
  };
}

function snapshots(eventsById: Record<string, EvenementInstantane[]> = {}): Instantane[] {
  return corpus().map((item) => snapshot(item.id, eventsById[item.id] ?? []));
}

test("validateCorpus accepts exactly 100 Nouvelle-Aquitaine incidents", () => {
  assert.doesNotThrow(() => validateCorpus(corpus()));
});

test("validateCorpus rejects a corpus shorter than 100 incidents", () => {
  assert.throws(() => validateCorpus(corpus().slice(0, 99)), /expected 100 incidents/);
});

test("validateCorpus rejects duplicate incident ids", () => {
  const list = corpus();
  list[1] = list[0]!;
  assert.throws(() => validateCorpus(list), /duplicate or missing id/);
});

test("validateCorpus rejects an incident outside Nouvelle-Aquitaine", () => {
  const list = corpus();
  list[0] = incident(list[0]!.id, { departement: "75" });
  assert.throws(() => validateCorpus(list), /outside Nouvelle-Aquitaine/);
});

test("validateCorpus rejects an excluded personal-data incident", () => {
  const list = corpus();
  list[0] = incident("na-charente-002");
  assert.throws(() => validateCorpus(list), /personal data excluded/);
});

test("validateSnapshots accepts a 21-day window ending at J-21", () => {
  assert.doesNotThrow(() => validateSnapshots(corpus(), snapshots()));
});

test("validateSnapshots rejects an event after J-21", () => {
  const list = snapshots();
  const first = list[0]!;
  first.evenements = [
    { ...event("Alpha Bravo leak"), valid_at: "2026-01-11T00:00:00.000Z" },
  ];
  assert.throws(() => validateSnapshots(corpus(), list), /outside J-21 window/);
});

test("hasValidatedSignal requires a name supplied by the corpus", () => {
  const item = incident("inc-000");
  assert.equal(hasValidatedSignal(item, snapshot(item.id, [event("Alpha Bravo targeted")])), true);
  assert.equal(hasValidatedSignal(item, snapshot(item.id, [event("Generic site issue")])), false);
});

test("computePrecision counts emitted signals that ground truth rejects", () => {
  const first = corpus()[0]!.id;
  const result = computePrecision({ corpus: corpus(), snapshots: snapshots({ [first]: [event("Bravo plugin vulnerable", "technical_indicator")] }) });
  assert.equal(result.signalsEmitted, 1);
  assert.equal(result.falsePositives, 1);
  assert.equal(result.truePositives, 0);
  assert.equal(result.decisionPrecision, 0.99);
  assert.equal(result.detectionPrecision, 0);
});

test("computePrecision leaves detection precision unset with no emitted signal", () => {
  const result = computePrecision({ corpus: corpus(), snapshots: snapshots() });
  assert.equal(result.decisionPrecision, 1);
  assert.equal(result.detectionPrecision, null);
  assert.equal(result.recall, null);
});

test("renderFrenchReport states the measured figure and is byte-stable", () => {
  const result = computePrecision({ corpus: corpus(), snapshots: snapshots() });
  const report = renderFrenchReport(result);
  assert.match(report, /Précision de décision : 100,00 %/);
  assert.equal(report, renderFrenchReport(result));
});

test("renderFrenchReport declares the measured 100/100 objective", () => {
  const result = computePrecision({ corpus: corpus(), snapshots: snapshots() });
  const report = renderFrenchReport(result);
  assert.match(report, /^OBJECTIF : atteint — 100 \/ 100 incidents mesurés\.$/m);
});
