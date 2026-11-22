import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectContradictions,
  type ContradictionEvent,
} from "../src/analyse/source-contradictions.js";

function evt(overrides: Partial<ContradictionEvent> = {}): ContradictionEvent {
  return {
    id: "1",
    orgId: 42,
    orgDept: "17",
    regional: true,
    sourceId: "cert-fr",
    sourceUrl: "https://www.cert.ssi.gouv.fr/feed/",
    family: "cert_fr",
    assertionType: "ambient_signal",
    severity: 3,
    observedAt: "2026-11-18T00:00:00.000Z",
    title: "F5 NGINX vulnerabilities fixed",
    evidence: null,
    ...overrides,
  };
}

function second(overrides: Partial<ContradictionEvent> = {}): ContradictionEvent {
  return evt({
    id: "2",
    sourceId: "cert-at",
    sourceUrl: "https://cert.at/warnings.xml",
    severity: 2,
    title: "NGINX vulnerabilities patched",
    ...overrides,
  });
}

test("one severity point of disagreement is detected between publishers", () => {
  const report = detectContradictions([evt(), second()]);
  assert.equal(report.count, 1);
  assert.deepEqual(report.byKind, { severity: 1, nature: 0 });
  assert.deepEqual(report.contradictions[0]?.positions.map((p) => p.publisher),
    ["cert.at", "cert.ssi.gouv.fr"]);
});

test("two feeds of the same publisher are one voice, not a contradiction", () => {
  const a = evt({
    sourceId: "ransomlook",
    sourceUrl: "https://www.ransomlook.io/api/recent",
    family: "ransomware",
    title: "NGINX victim claimed",
  });
  const b = second({
    sourceId: "leak:ransomlook:recent-api",
    sourceUrl: "https://ransomlook.io/api/recent",
    family: "leaks",
    title: "NGINX victim leak",
  });
  assert.equal(detectContradictions([a, b]).count, 0);
});

test("a disagreement about the nature of the claim is detected", () => {
  const confirmed = evt({
    family: "ransomware",
    assertionType: "confirmed_incident",
    title: "NGINX victim confirmed",
  });
  const claimed = second({
    family: "leaks",
    assertionType: "third_party_claim",
    severity: 3,
    title: "NGINX victim claim",
  });
  const report = detectContradictions([confirmed, claimed]);
  assert.equal(report.count, 1);
  assert.deepEqual(report.byKind, { severity: 0, nature: 1 });
  assert.deepEqual(report.contradictions[0]?.positions.map((p) => p.nature),
    ["data_leak", "ransomware_claim"]);
});

test("events outside Nouvelle-Aquitaine are not scanned", () => {
  const outside = (event: ContradictionEvent): ContradictionEvent => ({
    ...event, regional: false, orgDept: "75",
  });
  const report = detectContradictions([outside(evt()), outside(second())]);
  assert.equal(report.count, 0);
  assert.equal(report.eventsScanned, 0);
});

test("reports beyond the 72-hour window are not grouped", () => {
  const late = second({
    observedAt: "2026-11-21T01:00:00.000Z",
  });
  assert.equal(detectContradictions([evt(), late]).count, 0);
});

test("unrelated topics in the same organisation are not merged", () => {
  const oracle = second({ title: "Oracle Communications CVE published" });
  assert.equal(detectContradictions([evt(), oracle]).count, 0);
});

test("a victim domain groups events when no organisation is attached", () => {
  const hint = { org_hint: "victim.example\\$10M\\France" };
  const a = evt({ orgId: null, evidence: hint, title: "victim.example breach confirmed" });
  const b = second({ orgId: null, evidence: hint, title: "victim.example breach claimed" });
  const report = detectContradictions([a, b]);
  assert.equal(report.count, 1);
  assert.equal(report.subjectsScanned, 1);
});

test("a report never carries a title or a victim identifier", () => {
  const hint = { org_hint: "secret-victim.example" };
  const a = evt({ orgId: null, evidence: hint, title: "secret-victim.example breach confirmed" });
  const b = second({ orgId: null, evidence: hint, title: "secret-victim.example breach claimed" });
  const report = detectContradictions([a, b]);
  const json = JSON.stringify(report);
  assert.ok(!json.includes("secret-victim.example"));
  assert.ok(!json.includes("breach"));
  assert.match(report.contradictions[0]?.subject ?? "", /^[a-f0-9]{16}$/);
});

test("a single source cannot contradict itself", () => {
  assert.equal(detectContradictions([evt()]).count, 0);
});

test("a silent source is not a source claiming zero severity", () => {
  const report = detectContradictions([evt({ severity: null }), second()]);
  assert.equal(report.count, 0);
});
