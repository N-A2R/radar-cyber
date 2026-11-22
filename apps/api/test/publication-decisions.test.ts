import { test } from "node:test";
import assert from "node:assert/strict";
import { publicationVerdicts } from "../src/analyse/incident-corroboration-48h.js";
import type { CorroborationReport } from "../src/analyse/incident-corroboration.js";
import {
  ACTEUR_DECISION,
  CHAIN_GENESIS,
  REFUS_PUBLICATION,
  buildPublicationJournal,
  verifyPublicationJournal,
} from "../src/analyse/publication-decisions.js";

const FIRST = "2026-11-20T12:00:00.000Z";
const NOW = "2026-11-22T12:00:00.000Z";

type Cluster = {
  hash: string;
  firstClaimAt?: string;
  corroborated?: boolean;
  publishers?: string[];
  naIncident?: boolean;
};

function journalFor(clusters: Cluster[]) {
  const report: CorroborationReport = {
    incidentsTotal: clusters.length,
    incidentsCorroborated: clusters.filter((item) => item.corroborated).length,
    incidentsSingleSource: clusters.filter((item) => !item.corroborated).length,
    ratePercent: 0,
    clusters: clusters.map((item) => ({
      incidentKey: item.hash,
      victimHash: item.hash,
      eventIds: [1],
      sourceIds: [],
      publishers: item.publishers ?? ["one"],
      incidentEvents: 1,
      firstClaimAt: item.firstClaimAt ?? FIRST,
      lastClaimAt: item.firstClaimAt ?? FIRST,
      corroborated: item.corroborated ?? false,
      naIncident: item.naIncident ?? true,
    })),
  };
  return buildPublicationJournal(publicationVerdicts(report, NOW), NOW);
}

test("a second independent source is named with the proof and no refusal", () => {
  const decision = journalFor([
    { hash: "aa", corroborated: true, publishers: ["a", "b"] },
  ]).decisions[0];
  assert.equal(decision?.verdict, "second_source");
  assert.equal(decision?.nommer, true);
  assert.equal(decision?.motifRefus, null);
  assert.equal(decision?.preuve.independentPublishers, 2);
  assert.equal(decision?.acteur, ACTEUR_DECISION);
});

test("a documented 48 h delay is named with the reason recorded", () => {
  const decision = journalFor([{ hash: "bb" }]).decisions[0];
  assert.equal(decision?.verdict, "after_delay");
  assert.equal(decision?.nommer, true);
  assert.equal(decision?.decisionAt, "2026-11-22T12:00:00.000Z");
  assert.match(decision?.raison ?? "", /48 h/);
});

test("a recent single source is refused under publication-risquee", () => {
  const decision = journalFor([
    { hash: "cc", firstClaimAt: "2026-11-22T10:00:00.000Z" },
  ]).decisions[0];
  assert.equal(decision?.verdict, "pending");
  assert.equal(decision?.nommer, false);
  assert.equal(decision?.motifRefus, REFUS_PUBLICATION);
  assert.match(decision?.raison ?? "", /anonymisé/);
});

test("one decision is journalised per Nouvelle-Aquitaine incident", () => {
  const journal = journalFor([
    { hash: "aa", corroborated: true },
    { hash: "hors", naIncident: false },
  ]);
  assert.deepEqual(journal.decisions.map((item) => item.victimHash), ["aa"]);
  assert.equal(journal.summary.incidents, 1);
  assert.equal(journal.decisions[0]?.previousHash, CHAIN_GENESIS);
});

test("the whole chain replays successfully", () => {
  const journal = journalFor([
    { hash: "cc", firstClaimAt: "2026-11-22T10:00:00.000Z" },
    { hash: "aa", corroborated: true },
    { hash: "bb" },
  ]);
  assert.equal(journal.chainHead, journal.decisions.at(-1)?.hash);
  assert.deepEqual(verifyPublicationJournal(journal), {
    ok: true,
    checked: 3,
    firstInvalidSequence: null,
  });
});

test("a modified decision breaks the chain at its sequence", () => {
  const journal = journalFor([
    { hash: "aa", corroborated: true },
    { hash: "bb" },
  ]);
  journal.decisions[1]!.raison = "raison réécrite après coup";
  assert.deepEqual(verifyPublicationJournal(journal), {
    ok: false,
    checked: 1,
    firstInvalidSequence: 2,
  });
});

test("two claim windows for one victim stay distinct journal entries", () => {
  const journal = journalFor([
    { hash: "aa", firstClaimAt: FIRST, corroborated: true },
    { hash: "aa", firstClaimAt: "2026-11-10T12:00:00.000Z", corroborated: true },
  ]);
  assert.equal(journal.decisions.length, 2);
  assert.equal(new Set(journal.decisions.map((item) => item.identifiant)).size, 2);
  assert.deepEqual(verifyPublicationJournal(journal), {
    ok: true,
    checked: 2,
    firstInvalidSequence: null,
  });
});
