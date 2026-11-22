import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseKey,
  redactPersonalData,
  sourceKind,
  summariseIncident,
  SummaryInputError,
  type IncidentInput,
} from "../src/analyse/incident-summary.js";
import {
  CRITERIA_MAX,
  gradeSummary,
  QUALITY_THRESHOLD,
} from "../src/analyse/incident-summary-quality.js";

const REFERENCE =
  "Les services numériques de la commune sont attaqués le 18 avril 2024 : réseaux et accès internet " +
  "sont suspendus par précaution, les services essentiels restant ouverts. Les premières expertises " +
  "menées avec Bordeaux Métropole concluent à aucune exfiltration.";

function incident(overrides: Partial<IncidentInput> = {}): IncidentInput {
  return {
    id: "na-couv-001",
    organization: "Ville de Floirac",
    department: "Gironde",
    incidentDate: "2024-04-18",
    publishedAt: "2024-04-19",
    type: "compromission",
    title: "Aucune donnée n'a été exfiltrée : victime d'une cyberattaque, une mairie est privée d'accès à internet",
    excerpt: "Ce jeudi 18 avril, la ville de Floirac, près de Bordeaux, a été victime d’une cyberattaque.",
    source: "France 3 Nouvelle-Aquitaine",
    sourceText: REFERENCE,
    ...overrides,
  };
}

/** One behaviour per test. No database, clock or network participates. */

test("normalisation ignores accents, case and punctuation", () => {
  assert.equal(normaliseKey("  Hôpital de Niort ! "), "hopitaldeniort");
});

test("an incident outside Nouvelle-Aquitaine is refused", () => {
  assert.throws(
    () => summariseIncident(incident({ department: "Loire-Atlantique" })),
    (error: unknown) => error instanceof SummaryInputError && error.code === "outside-nouvelle-aquitaine",
  );
});

test("an unknown department is refused", () => {
  assert.throws(() => summariseIncident(incident({ department: "" })), SummaryInputError);
});

test("gray-area sources are labelled, not discarded", () => {
  const summary = summariseIncident(incident({ source: "Ransomwatch listing" }));
  assert.equal(summary.sourceKind, "gray");
  assert.equal(summary.sourceLabel, "Ransomwatch listing");
});

test("public sources are labelled as public", () => {
  assert.equal(summariseIncident(incident()).sourceKind, "public");
});

test("the headline names the organisation, type and department", () => {
  const headline = summariseIncident(incident()).headline;
  assert.match(headline, /Ville de Floirac/);
  assert.match(headline, /Compromission/);
  assert.match(headline, /Gironde/);
});

test("the lead carries the incident date", () => {
  assert.match(summariseIncident(incident()).lead, /18 avril 2024/);
});

test("the lead contains no fact absent from the verified source", () => {
  const summary = summariseIncident(incident());
  assert.match(summary.lead, /aucune exfiltration/);
  assert.doesNotMatch(summary.lead, /fabricated|invented|unknown/i);
});

test("the summary stays inside the word budget", () => {
  const summary = summariseIncident(incident({ sourceText: `${REFERENCE} ${REFERENCE}` }));
  assert.ok(summary.wordCount >= 25, `word count ${summary.wordCount} is too low`);
  assert.ok(summary.wordCount <= 80, `word count ${summary.wordCount} is too high`);
});

test("victim email addresses are redacted", () => {
  const result = redactPersonalData("Contactez jean.dupont@example.com pour la suite.");
  assert.doesNotMatch(result.text, /example\.com/);
  assert.equal(result.count, 1);
});

test("victim phone numbers are redacted", () => {
  const result = redactPersonalData("Appeler le 06 12 34 56 78 pour le signalement.");
  assert.doesNotMatch(result.text, /06 12 34 56 78/);
  assert.equal(result.count, 1);
});

test("named private people are redacted", () => {
  const result = redactPersonalData("Mme Jeanne Dupont a porté plainte.");
  assert.doesNotMatch(result.text, /Jeanne Dupont/);
  assert.equal(result.count, 1);
});

test("the generator redacts identifiers found in source prose", () => {
  const summary = summariseIncident(incident({
    sourceText: "Mme Jeanne Dupont a prévenu la mairie : joignez jean.dupont@example.com pour en savoir plus.",
  }));
  assert.ok(summary.redactions >= 2);
  assert.doesNotMatch(`${summary.headline} ${summary.lead}`, /Jeanne Dupont|example\.com/);
});

test("a faithful summary passes the objective threshold", () => {
  const input = incident();
  const grade = gradeSummary(summariseIncident(input), input, REFERENCE);
  assert.ok(grade.total >= QUALITY_THRESHOLD, `score ${grade.total} below ${QUALITY_THRESHOLD}`);
  assert.equal(grade.passed, true);
});

test("a summary carrying personal data loses the privacy points", () => {
  const input = incident();
  const summary = summariseIncident(input);
  const grade = gradeSummary(
    { ...summary, lead: `Mme Jeanne Dupont — ${summary.lead}` },
    input,
    REFERENCE,
  );
  assert.equal(grade.privacy, 0);
  assert.ok(grade.reasons.includes("personal-data"));
});

test("a number absent from the source is ungrounded", () => {
  const input = incident();
  const grade = gradeSummary(
    { ...summariseIncident(input), lead: "151 000 profils en vente sur le darknet." },
    input,
    REFERENCE,
  );
  assert.ok(grade.faithfulness < CRITERIA_MAX.faithfulness);
  assert.ok(grade.reasons.includes("ungrounded-number"));
});

test("a summary without the department loses scope points", () => {
  const input = incident();
  const grade = gradeSummary(
    { ...summariseIncident(input), headline: "Ville de Floirac — Compromission" },
    input,
    REFERENCE,
  );
  assert.ok(grade.scope < CRITERIA_MAX.scope);
  assert.ok(grade.reasons.includes("missing-department"));
});

test("grading the same summary twice gives the same score", () => {
  const input = incident();
  const summary = summariseIncident(input);
  assert.deepEqual(gradeSummary(summary, input, REFERENCE), gradeSummary(summary, input, REFERENCE));
});

test("a private person introduced by a job title is redacted", () => {
  const result = redactPersonalData("François Signarbieux, le directeur du site, a porté plainte.");
  assert.doesNotMatch(result.text, /François Signarbieux/);
  assert.equal(result.count, 1);
});

test("curated prose wins over an excerpt naming a private person", () => {
  const summary = summariseIncident(incident({
    verifiedText: REFERENCE,
    excerpt: "Mardi 18 février, François Signarbieux, le directeur du site, est revenu sur l'attaque.",
  }));
  assert.doesNotMatch(summary.lead, /Signarbieux/);
  assert.match(summary.lead, /aucune exfiltration/);
});
