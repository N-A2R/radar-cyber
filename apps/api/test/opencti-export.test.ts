/** One behaviour per test: the OpenCTI exporter is a pure, privacy-first projection. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportToOpenCti, isNouvelleAquitaine, type ExportEventRow, type OpenCtiExport } from "../src/connectors/opencti.js";

function row(overrides: Partial<ExportEventRow> = {}): ExportEventRow {
  return {
    id: 1,
    dedupKey: "ev-1",
    family: "ransomware",
    title: "Cyberattack in Bordeaux",
    observedAt: "2026-11-20T10:00:00.000Z",
    sourceId: "press-sudouest",
    sourceName: "Sud Ouest",
    sourceRelevance: "context",
    regional: false,
    orgId: 42,
    orgDept: "33",
    orgName: "Hôpital de Bordeaux",
    orgDomain: "hopital-bordeaux.fr",
    ...overrides,
  };
}

function reports(exported: OpenCtiExport): Record<string, unknown>[] {
  return exported.bundle.objects.filter((object) => object.type === "report");
}

describe("OpenCTI export connector", () => {
  it("exports only events with a Nouvelle-Aquitaine proof", () => {
    const result = exportToOpenCti([
      row(),
      row({ id: 2, dedupKey: "ev-2", title: "Cyberattack in Lyon", orgDept: "69" }),
    ]);
    assert.equal(result.exported, 1);
    assert.deepEqual(result.skipped, [{ id: 2, reason: "outside-nouvelle-aquitaine" }]);
    assert.equal(reports(result)[0]?.name, "Cyberattack in Bordeaux");
  });

  it("accepts a regional event with no organisation attached", () => {
    const regional = row({ orgDept: null, orgId: null, orgName: null, regional: true });
    assert.equal(isNouvelleAquitaine(regional), true);
    const result = exportToOpenCti([regional]);
    assert.equal(result.exported, 1);
    assert.ok(reports(result)[0]?.labels?.includes("department:unspecified"));
  });

  it("keeps gray sources with an explicit trust label", () => {
    const gray = exportToOpenCti([row({ sourceRelevance: "context" })]);
    const standard = exportToOpenCti([row({ sourceRelevance: "veille" })]);
    assert.equal(gray.graySources, 1);
    assert.equal(standard.graySources, 0);
    assert.ok(reports(gray)[0]?.labels?.includes("source-trust:gray"));
    assert.ok(reports(standard)[0]?.labels?.includes("source-trust:standard"));
  });

  it("never exports victim personal data, summaries or raw evidence", () => {
    const dirty = {
      ...row({
        title: "Incident: Mme Jean Dupont, jean.dupont@example.fr, 01 23 45 67 89",
        sourceUrl: "https://example.fr/news?token=private&user=jean",
      }),
      summary: "The victim's private notes are confidential.",
      evidence: { victim_full_name: "Jean Dupont", medical_record: "abc" },
      lat: 45.839,
      lon: -0.583,
    } as ExportEventRow & { summary: string; evidence: unknown; lat: number; lon: number };
    const json = JSON.stringify(exportToOpenCti([dirty]).bundle);
    assert.ok(!json.includes("jean.dupont@example.fr"));
    assert.ok(!json.includes("01 23 45 67 89"));
    assert.ok(!json.includes("Jean Dupont"));
    assert.ok(!json.includes("private"));
    assert.ok(!json.includes("victim_full_name"));
    assert.ok(!json.includes("medical_record"));
    assert.ok(!json.includes("confidential"));
    assert.ok(!json.includes("45.839"));
    assert.ok(json.includes("[email-redacted]"));
    assert.ok(json.includes("[person-redacted]"));
  });

  it("produces deterministic STIX identifiers regardless of input order", () => {
    const first = row();
    const second = row({ id: 2, dedupKey: "ev-2", title: "Second incident" });
    const forward = exportToOpenCti([first, second]);
    const backward = exportToOpenCti([second, first]);
    assert.equal(JSON.stringify(forward.bundle), JSON.stringify(backward.bundle));
    assert.match(String(reports(forward)[0]?.id), /^report--[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
