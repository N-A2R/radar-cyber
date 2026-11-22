/** One test per behavior of the multi-language incident detector. */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyseIncidents,
  incidentAdmissionVerdict,
  detectIncidentLanguage,
  isIncident,
  isInNouvelleAquitaine,
  MIN_CONFIDENCE,
  type IncidentRecord,
} from "../src/multilingualIncidents/index.js";
import { languageVerdict } from "../src/collectors/filter.js";

function record(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  return {
    id: "test-1",
    title: "Dummy headline",
    summary: null,
    assertion_type: "third_party_claim",
    regional: true,
    ...overrides,
  };
}

test("a French claim headline stays French beside an English actor name", () => {
  const result = detectIncidentLanguage("BAE Exchange — revendiqué par the gentlemen");
  assert.equal(result.language, "fr");
  assert.ok(result.scores.fr > result.scores.en);
});

test("an English third-party claim is detected", () => {
  const result = detectIncidentLanguage(
    "Third-party ransomware claim referencing a Nouvelle-Aquitaine organization (department 23)",
  );
  assert.equal(result.language, "en");
  assert.equal(result.confidence, 1);
});

test("a German advisory headline is detected", () => {
  assert.equal(
    detectIncidentLanguage("Kritische Sicherheitslücken in NGINX Plus und NGINX Open Source - Updates verfügbar").language,
    "de",
  );
});

test("a Dutch advisory headline is detected", () => {
  assert.equal(detectIncidentLanguage("Kwetsbaarheden in Adobe Commerce: update nu").language, "nl");
});

test("a Polish advisory headline is detected", () => {
  assert.equal(detectIncidentLanguage("Podatności w oprogramowaniu — aktualizacje krytyczne").language, "pl");
});

test("an Occitan headline is detected", () => {
  assert.equal(detectIncidentLanguage("Una vulnerabilitat critica es estat descuberta en Occitània").language, "oc");
});

test("a Basque headline is detected", () => {
  assert.equal(detectIncidentLanguage("Zenbait ahultasun kritiko aurkitu dira").language, "eu");
});

test("empty, null and number-only text is undetermined", () => {
  for (const text of ["", "   ", "CVE-2026-1147 — 42%", null, undefined]) {
    assert.equal(detectIncidentLanguage(text).language, "und", `text: ${String(text)}`);
  }
});

test("a tie between languages is undetermined", () => {
  const result = detectIncidentLanguage("des the");
  assert.equal(result.language, "und");
  assert.equal(result.confidence, 0);
});

test("a single word hit is not enough evidence", () => {
  assert.equal(detectIncidentLanguage("the").language, "und");
});

test("only the two incident assertions are incidents", () => {
  assert.equal(isIncident("confirmed_incident"), true);
  assert.equal(isIncident("third_party_claim"), true);
  for (const value of ["ambient_signal", "technical_indicator", "", null, undefined]) {
    assert.equal(isIncident(value), false, `value: ${String(value)}`);
  }
});

test("only Nouvelle-Aquitaine departments and regional flags are in scope", () => {
  assert.equal(isInNouvelleAquitaine({ regional: true }), true);
  assert.equal(isInNouvelleAquitaine({ department: "64" }), true);
  assert.equal(isInNouvelleAquitaine({ department: " 16 " }), true);
  for (const value of [{ department: "75" }, { department: "2A" }, { regional: false }, {}]) {
    assert.equal(isInNouvelleAquitaine(value), false);
  }
});

test("an English summary does not flip a French claim headline", () => {
  const analysis = analyseIncidents([record({
    title: "Triad Architects — revendiqué par the gentlemen",
    summary: "Triad Architects is an American company with offices and data centers in the United States",
  })]);
  assert.equal(analysis.inScopeIncidents, 1);
  assert.equal(analysis.nonFrenchIncidents, 0);
  assert.deepEqual(analysis.byLanguage, { fr: 1 });
});

test("a reliable title wins over an empty or noisy summary", () => {
  const fromTitle = analyseIncidents([record({ title: "Kritische Sicherheitslücke in NGINX: Updates verfügbar" })]);
  const withSummary = analyseIncidents([record({
    title: "Kritische Sicherheitslücke in NGINX: Updates verfügbar",
    summary: "the company reported data of users in a report",
  })]);
  assert.equal(fromTitle.nonFrenchIncidents, 1);
  assert.equal(withSummary.nonFrenchIncidents, 1);
});

test("the summary is used when the title carries no language signal", () => {
  const analysis = analyseIncidents([record({
    title: "Product update",
    summary: "Ernstige kwetsbaarheid in Adobe Commerce actief misbruikt: update onmiddellijk",
  })]);
  assert.equal(analysis.nonFrenchIncidents, 1);
  assert.equal(analysis.byLanguage.nl, 1);
});

test("non-incidents and events outside Nouvelle-Aquitaine are not counted", () => {
  const analysis = analyseIncidents([
    record({ assertion_type: "ambient_signal", title: "Third-party claim referencing the organization" }),
    record({ regional: false, department: "75", title: "Third-party claim referencing the organization" }),
  ]);
  assert.deepEqual(analysis, { inScopeIncidents: 0, nonFrenchIncidents: 0, byLanguage: {}, nonFrenchIds: [] });
});

test("low-confidence detections are not reported as non-French", () => {
  const analysis = analyseIncidents([record({
    title: "the third party data update und nicht für bei",
  })]);
  const detection = detectIncidentLanguage("the third party data update und nicht für bei");
  assert.equal(detection.language, "en");
  assert.ok(detection.confidence < MIN_CONFIDENCE, `confidence: ${detection.confidence}`);
  assert.equal(analysis.nonFrenchIncidents, 0);
});

test("the frozen Nouvelle-Aquitaine corpus reproduces the published figure", () => {
  const corpusPath = new URL("../../../bench/corpus/incidents-multilingues-na.jsonl", import.meta.url);
  const resultPath = new URL("../../../bench/results/multilingual-incidents.json", import.meta.url);
  const corpus = readFileSync(corpusPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as IncidentRecord);
  const published = JSON.parse(readFileSync(resultPath, "utf8")) as {
    inScopeIncidents: number;
    nonFrenchIncidents: number;
    byLanguage: Record<string, number>;
  };
  const analysis = analyseIncidents(corpus);
  assert.equal(corpus.length, 65);
  assert.equal(analysis.inScopeIncidents, published.inScopeIncidents);
  assert.equal(analysis.nonFrenchIncidents, published.nonFrenchIncidents);
  assert.deepEqual(analysis.byLanguage, published.byLanguage);
});

test("an English company summary does not reject a French claim headline", () => {
  const verdict = incidentAdmissionVerdict(
    "Triad Architects — revendiqué par the gentlemen",
    "Triad Architects is an American company with data centers in the United States",
    new Set(["fr"]),
  );
  assert.equal(verdict.language, "fr");
  assert.equal(verdict.detected, "fr");
  assert.equal(verdict.keep, true);
  assert.equal(verdict.basis, "title");
});

test("an English claim is rejected when only French is allowed", () => {
  const verdict = incidentAdmissionVerdict(
    "Third-party ransomware claim referencing a Nouvelle-Aquitaine organization (department 23)",
    null,
    new Set(["fr"]),
  );
  assert.equal(verdict.language, "en");
  assert.equal(verdict.keep, false);
  assert.equal(verdict.basis, "title");
});

test("a low-confidence mixed title still follows the claim marker", () => {
  const title = "Dong Engineering Consulting Company Data Breach — revendiqué par hyflock";
  assert.ok(detectIncidentLanguage(title).confidence < MIN_CONFIDENCE);
  const verdict = incidentAdmissionVerdict(title, "an engineering company in the United States", new Set(["fr"]));
  assert.equal(verdict.language, "fr");
  assert.equal(verdict.keep, true);
  assert.equal(verdict.basis, "title");
});

test("the summary decides when the title carries no language signal", () => {
  const verdict = incidentAdmissionVerdict(
    "Product update",
    "Ernstige kwetsbaarheid in Adobe Commerce actief misbruikt: update onmiddellijk",
    new Set(["fr"]),
  );
  assert.equal(verdict.detected, "nl");
  assert.equal(verdict.language, "en");
  assert.equal(verdict.keep, false);
  assert.equal(verdict.basis, "title+summary");
});

test("empty text falls back to English without evidence", () => {
  const verdict = incidentAdmissionVerdict("", null, new Set(["fr", "en"]));
  assert.equal(verdict.detected, "und");
  assert.equal(verdict.language, "en");
  assert.equal(verdict.confidence, 0);
  assert.equal(verdict.keep, true);
});

test("the runtime language gate uses the multilingual verdict", () => {
  const allowed = new Set<"fr" | "en">(["fr"]);
  const verdict = languageVerdict(
    "Triad Architects — revendiqué par the gentlemen",
    "Triad Architects is an American company with offices in the United States",
    allowed,
  );
  assert.equal(verdict.language, "fr");
  assert.equal(verdict.keep, true);
});

test("the frozen corpus admissions match the high-confidence non-French ids", () => {
  const corpusPath = new URL("../../../bench/corpus/incidents-multilingues-na.jsonl", import.meta.url);
  const corpus = readFileSync(corpusPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as IncidentRecord);
  const nonFrench = new Set(analyseIncidents(corpus).nonFrenchIds.map(String));
  const allowed = new Set(["fr"]);
  for (const row of corpus) {
    const verdict = incidentAdmissionVerdict(row.title, row.summary, allowed);
    assert.equal(
      verdict.language === "en",
      nonFrench.has(String(row.id)),
      `id ${row.id}: detected ${verdict.detected}`,
    );
  }
});
