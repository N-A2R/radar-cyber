/**
 * "Am I affected?" pure assistant — one test per behaviour.
 *
 * No database, no network: the same rules are replayed later against the real
 * corpus by scripts/measure-affected.mts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAffectedReport,
  hasVerifiableEvidence,
  OutsideRegionError,
  proofUrl,
  safeText,
  type Observation,
  type Organization,
} from "../src/affected/model.js";

function org(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 42,
    name: "Association Riveraine",
    slug: "association-riveraine",
    kind: "association",
    sector: "environment",
    city: "Bordeaux",
    dept: "33",
    siren: "123456789",
    entityCode: "SIRENE-42",
    entitySource: "sirene",
    geoSource: "sirene",
    domain: "riveraine.example",
    website: "https://riveraine.example",
    validFrom: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 7,
    family: "ransomware",
    assertionType: "third_party_claim",
    observedAt: "2026-11-20T10:00:00.000Z",
    sourceId: "ransomlook",
    sourceUrl: "https://example.invalid/claim/7?token=secret#fragment",
    evidence: { group: "actor", org_hint: "riveraine.example" },
    regional: true,
    ...overrides,
  };
}

test("registry statements carry a verifiable register reference", () => {
  const report = buildAffectedReport(org());
  const names = report.statements.map((s) => s.id);
  assert.deepEqual(names, ["registry:name", "registry:activity", "registry:location", "registry:domain"]);
  assert.ok(report.statements.every(hasVerifiableEvidence));
  assert.equal(report.summary.withEvidence, report.summary.statements);
  assert.equal(report.statements[0]?.evidence.reference, "sirene:SIRENE-42");
  assert.equal(report.scope, "nouvelle-aquitaine");
});

test("grey-source claims stay visible but are marked unconfirmed", () => {
  const report = buildAffectedReport(org(), [observation()]);
  const claim = report.statements.find((s) => s.id === "event:7");
  assert.ok(claim);
  assert.equal(claim.category, "claim");
  assert.equal(claim.label, "Ransomware extortion claim");
  assert.equal(claim.evidence.label, "Ransomlook");
  assert.equal(claim.evidence.kind, "claim");
  assert.equal(claim.evidence.reference, "event:7");
});

test("organizations outside Nouvelle-Aquitaine are refused", () => {
  assert.throws(() => buildAffectedReport(org({ dept: "75" })), OutsideRegionError);
  assert.throws(() => buildAffectedReport(org({ dept: null })), OutsideRegionError);
});

test("event free text and victim personal data never enter the report", () => {
  const secret = "Victim Jean Dupont 0601020304 victim@example.fr";
  const withFreeText = {
    ...observation({ evidence: { raw_body: secret, note: secret } }),
    title: secret,
    summary: secret,
  } as Observation;
  const report = buildAffectedReport(org(), [withFreeText]);
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes("Victim Jean Dupont"));
  assert.ok(!serialized.includes("0601020304"));
  assert.ok(!serialized.includes("victim@example.fr"));
  assert.ok(!serialized.includes("raw_body"));
  assert.equal(report.statements.find((s) => s.id === "event:7")?.value, "Ransomware extortion claim");
});

test("proof URLs keep origin and path but drop query and fragment", () => {
  assert.equal(
    proofUrl("https://example.invalid/claim/7?token=secret#fragment"),
    "https://example.invalid/claim/7",
  );
  assert.equal(safeText("Jean Dupont 0601020304 victim@example.fr"), "Jean Dupont [redacted] [redacted]");
  assert.equal(proofUrl("javascript:alert(1)"), null);
});

test("absence of a statement is never presented as proof of safety", () => {
  const report = buildAffectedReport(org());
  assert.ok(report.limitations.some((line) => line.includes("not proof that nothing happened")));
  assert.ok(report.limitations.some((line) => line.includes("never displayed")));
});
