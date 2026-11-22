/** The measurable objective: an OpenCTI export survives a MISP import unchanged. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportToOpenCti, type ExportEventRow, type OpenCtiExport, type StixObject } from "../src/connectors/opencti.js";
import { importMispEvents } from "../src/connectors/misp.js";

function row(id: number, dept: string, relevance = "veille", regional = false): ExportEventRow {
  return {
    id,
    dedupKey: `ev-${id}`,
    family: "ransomware",
    title: `Incident reported in department ${dept}`,
    observedAt: "2026-11-20T10:00:00.000Z",
    sourceId: `feed-${id}`,
    sourceName: "Regional press",
    sourceRelevance: relevance,
    regional,
    orgDept: dept,
    orgDomain: `org-${dept}.fr`,
  };
}

/** Build a MISP-shaped feed from an exported STIX report, with a PII probe. */
function toMisp(report: StixObject): Record<string, unknown> {
  const labels = (report.labels ?? []) as string[];
  const dept = labels.find((label) => String(label).startsWith("department:"))?.slice("department:".length);
  const tags = dept && dept !== "unspecified" ? [{ name: `na:${dept}` }] : [{ name: "region:nouvelle-aquitaine" }];
  if (labels.includes("source-trust:gray")) tags.push({ name: "source-trust:gray" });
  const reference = (report.external_references ?? []) as { url?: string }[];
  const attributes: Record<string, string>[] = [
    { type: "domain", value: "org-na.fr" },
    { type: "email", value: "victim@example.fr" },
  ];
  if (reference[0]?.url !== undefined) attributes.push({ type: "url", value: reference[0].url });
  return {
    uuid: String(report.id).replace("report--", ""),
    info: report.name,
    date: String(report.published).slice(0, 10),
    Tag: tags,
    Attribute: attributes,
  };
}

function reports(exported: OpenCtiExport): StixObject[] {
  return exported.bundle.objects.filter((object) => object.type === "report");
}

describe("CTI connector round trip", () => {
  it("round-trips exported Nouvelle-Aquitaine events through MISP import", () => {
    const exported = exportToOpenCti([
      row(1, "33"),
      row(2, "86", "context"),
      row(3, "75"),
    ]);
    const stixReports = reports(exported);
    const imported = importMispEvents({ Event: stixReports.map(toMisp) });

    assert.equal(exported.exported, 2);
    assert.equal(exported.skipped.length, 1);
    assert.equal(imported.accepted.length, 2);
    assert.equal(imported.rejected.length, 0);
    assert.deepEqual(
      imported.accepted.map((event) => event.id).sort(),
      stixReports.map((report) => String(report.id).replace("report--", "")).sort(),
    );
    assert.equal(imported.attributesDropped, 2);
    assert.ok(imported.accepted.some((event) => event.sourceTrust === "gray"));
    assert.ok(!JSON.stringify(imported.accepted).includes("victim@example.fr"));
  });
});
