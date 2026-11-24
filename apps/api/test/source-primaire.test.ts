import { test } from "node:test";
import assert from "node:assert/strict";
import { publicationVerdicts } from "../src/analyse/incident-corroboration-48h.js";
import type { CorroborationEvent, CorroborationReport } from "../src/analyse/incident-corroboration.js";
import {
  RAISON_SANS_SOURCE,
  REFUS_PUBLICATION,
  REFUS_SOURCE_MANCANTE,
  buildPublicationJournal,
  verifyPublicationJournal,
} from "../src/analyse/publication-decisions.js";
import { publicSourceUrl, sourcesParIncident } from "../src/analyse/source-primaire.js";

const FIRST = "2026-11-20T12:00:00.000Z";
const NOW = "2026-11-22T12:00:00.000Z";
const SOURCE = "https://presse.example.invalid/feed";

function event(id: number, sourceUrl: string | null): CorroborationEvent {
  return {
    id,
    sourceId: `source-${id}`,
    sourceUrl,
    family: "ransomware",

    assertionType: "third_party_claim",
    orgId: 1,
    orgDept: "33",
    regional: false,
    observedAt: FIRST,
    evidence: { group: "testgroup" },
    title: "Titre confidentiel",
  };
}

function report(publishers: string[]): CorroborationReport {
  return {
    incidentsTotal: 1,
    incidentsCorroborated: publishers.length > 1 ? 1 : 0,
    incidentsSingleSource: publishers.length <= 1 ? 1 : 0,
    ratePercent: 0,
    clusters: [{
      incidentKey: "victim|testgroup",
      victimHash: "abc123",
      eventIds: [1],
      sourceIds: [],
      publishers,
      incidentEvents: 1,
      firstClaimAt: FIRST,
      lastClaimAt: FIRST,
      corroborated: publishers.length > 1,
      naIncident: true,
    }],
  };
}
test("une adresse onion en http reste une source grise vérifiable", () => {
  assert.equal(
    publicSourceUrl("http://6g3aoky5hft4mvzcqt2bugo4r465woaorjhd7em2k2v24sr2exaro5id.onion/"),
    "http://6g3aoky5hft4mvzcqt2bugo4r465woaorjhd7em2k2v24sr2exaro5id.onion/",
  );
});

function auditedJournal(sourceUrl: string | null, publishers = ["presse"]) {
  const data = report(publishers);
  const sources = sourcesParIncident([event(1, sourceUrl)], data);
  return buildPublicationJournal(publicationVerdicts(data, NOW), NOW, sources);
}

test("une URL publique est conservée sans son jeton ni son fragment", () => {
  assert.equal(
    publicSourceUrl("https://presse.example.invalid/feed?token=secret#h"),
    SOURCE,
  );
});

test("une URL onion, avec identifiants ou sans domaine n'est pas une source primaire", () => {
  for (const url of ["onion:presse.example.onion", "https://user:pass@presse.example.invalid/x", "https://localhost/x", "pas-une-url"]) {
    assert.equal(publicSourceUrl(url), null);
  }
});

test("la source d'un incident est attachée à son identité journalisable", () => {
  const sources = sourcesParIncident([event(1, SOURCE)], report(["presse"]));
  assert.equal(sources.get(`abc123@${FIRST}`), SOURCE);
});

test("un incident dont la seule source est onion n'a pas de source publique", () => {
  const sources = sourcesParIncident([event(1, "onion:presse.example.onion")], report(["presse"]));
  assert.equal(sources.get(`abc123@${FIRST}`), null);
});

test("un incident confirmé mais sans source publique est anonymisé", () => {
  const journal = auditedJournal(null, ["a", "b"]);
  const decision = journal.decisions[0];
  assert.equal(decision?.verdict, "second_source");
  assert.equal(decision?.nommer, false);
  assert.equal(decision?.motifRefus, REFUS_SOURCE_MANCANTE);
  assert.equal(decision?.raison, RAISON_SANS_SOURCE);
  assert.equal(journal.summary.nommesSansSource, 0);
  assert.equal(journal.summary.sansSource, 1);
  assert.equal(verifyPublicationJournal(journal).ok, true);
});

test("un incident sourcé après 48 h reste nommable avec son URL dans la chaîne", () => {
  const journal = auditedJournal(SOURCE);
  const decision = journal.decisions[0];
  assert.equal(decision?.verdict, "after_delay");
  assert.equal(decision?.nommer, true);
  assert.equal(decision?.sourcePrimaire, SOURCE);
  assert.equal(verifyPublicationJournal(journal).ok, true);

  journal.decisions[0]!.sourcePrimaire = "https://autre.example.invalid/feed";
  assert.deepEqual(verifyPublicationJournal(journal), {
    ok: false,
    checked: 0,
    firstInvalidSequence: 1,
  });
});

test("un incident en attente garde le motif du délai, pas celui de la source", () => {
  const data = report(["presse"]);
  data.clusters[0]!.firstClaimAt = "2026-11-22T10:00:00.000Z";
  const sources = sourcesParIncident([event(1, null)], data);
  const decision = buildPublicationJournal(publicationVerdicts(data, NOW), NOW, sources).decisions[0];
  assert.equal(decision?.verdict, "pending");
  assert.equal(decision?.motifRefus, REFUS_PUBLICATION);
});
