/** One test per contagion behaviour: region, window, grading, precision, score, privacy. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  attributionPrecision,
  buildContagionReport,
  deduplicateFalls,
  gradeAttribution,
  contagionScore,
  type FallRecord,
} from "../src/analyse/contagion.js";

function fall(orgId: number, date: string, extra: Partial<FallRecord> = {}): FallRecord {
  return {
    orgId,
    date,
    name: `ORG ${orgId}`,
    victim: `ORG ${orgId}`,
    department: "33",
    sector: "services",
    sectorGroup: "services",
    city: "Bordeaux",
    naf: "70.10Z",
    parentOrgId: null,
    domain: "",
    source: "grey-site",
    ...extra,
  };
}

test("attribution grades exact, partial and unrelated claims", () => {
  assert.equal(gradeAttribution("MECA-PRECIS", "MECA PRECIS"), "exact");
  assert.equal(gradeAttribution("TEDI (Technicien Diagnostic Immobilier)", "DIAGNOSTIC IMMOBILIER"), "partial");
  assert.equal(gradeAttribution("Cushman & Wakefield Inc.", "BCI"), "unrelated");
});

test("precision weights a partial attribution as half a true positive", () => {
  assert.equal(attributionPrecision(["exact", "exact", "partial", "unrelated"]), 0.625);
  assert.equal(attributionPrecision([]), 0);
});

test("only Nouvelle-Aquitaine falls in the 30-day window become exposures", () => {
  const asOf = "2026-08-01";
  const records = [
    ...Array.from({ length: 25 }, (_, i) => fall(i + 1, addDays(asOf, -(25 - i)))),
    fall(100, addDays(asOf, 5)),
    fall(101, addDays(asOf, 30)),
    fall(102, addDays(asOf, 31)),
    fall(103, addDays(asOf, 6), { department: "75" }),
  ];
  const report = buildContagionReport(records, asOf);
  assert.equal(report.seedCount, 20);
  assert.deepEqual(report.seeds.map((s) => s.orgId), Array.from({ length: 20 }, (_, i) => i + 6));
  assert.deepEqual(report.exposures.map((e) => e.orgId), [100, 101]);
  assert.equal(report.exposures.some((e) => e.orgId === 102 || e.orgId === 103), false);
});

test("one organisation is dated at its first claim", () => {
  const falls = deduplicateFalls([fall(7, "2026-08-10"), fall(7, "2026-08-02"), fall(8, "2026-08-01")]);
  assert.deepEqual(falls.map((f) => [f.orgId, f.date]), [[8, "2026-08-01"], [7, "2026-08-02"]]);
});

test("contagion score ranks a shared sector group above an unrelated organisation", () => {
  const seed = fall(1, "2026-07-20", { sectorGroup: "sante", city: "Niort" });
  const near = contagionScore(fall(2, "2026-08-01", { sectorGroup: "sante" }), [seed], "2026-08-01");
  const far = contagionScore(fall(3, "2026-08-01", { sectorGroup: "industrie" }), [seed], "2026-08-01");
  assert.ok(near.score > far.score);
  assert.ok(near.reasons.includes("shared-sector-group"));
  assert.ok(near.score <= 1 && near.score >= 0);
});

test("raw victim labels never leave the model", () => {
  const record = fall(99, "2026-08-10", { victim: "PRIVATE VICTIM LABEL", name: "ACME" });
  const report = buildContagionReport([...Array.from({ length: 20 }, (_, i) => fall(i, "2026-07-20")), record], "2026-08-01");
  assert.equal(JSON.stringify(report).includes("PRIVATE VICTIM LABEL"), false);
  assert.equal(report.exposures[0]?.attribution, "unrelated");
});

test("an empty evaluation reports a measured zero, not a success", () => {
  const report = buildContagionReport([], "2026-08-01");
  assert.equal(report.precision.evaluated, 0);
  assert.equal(report.precision.value, 0);
  assert.equal(report.precision.reachedTarget, false);
  assert.deepEqual(report.exposures, []);
});
