import { test } from "node:test";
import assert from "node:assert/strict";
import { parseObservedAt } from "../src/collectors/dates.js";

const fetchedAt = new Date("2026-11-10T12:00:00.000Z");

test("RFC822", () => {
  const r = parseObservedAt("Tue, 10 Nov 2026 08:00:00 +0000", { fetchedAt });
  assert.equal(r.source, "feed");
  assert.equal(r.confidence, "high");
  assert.ok(r.at instanceof Date);
});

test("RFC3339", () => {
  const r = parseObservedAt("2026-11-09T10:00:00Z", { fetchedAt });
  assert.equal(r.source, "feed");
  assert.equal(r.confidence, "high");
});

test("date française", () => {
  const r = parseObservedAt("9 novembre 2026", { fetchedAt });
  // V8 parse la chaîne comme date valide -> branche RFC822-ish du code
  assert.equal(r.source, "feed");
  assert.equal(r.confidence, "high");
});

test("JJ/MM/AAAA", () => {
  const r = parseObservedAt("09/11/2026", { fetchedAt });
  assert.equal(r.source, "inferred");
  assert.equal(r.confidence, "medium");
});

test("relatif FR", () => {
  const r = parseObservedAt("il y a 2 heures", { fetchedAt });
  assert.equal(r.source, "inferred");
  assert.equal(r.confidence, "medium");
});

test("relatif EN", () => {
  const r = parseObservedAt("2 days ago", { fetchedAt });
  assert.equal(r.source, "inferred");
  assert.equal(r.confidence, "medium");
});

test("epoch s", () => {
  const r = parseObservedAt("1731230400", { fetchedAt });
  assert.equal(r.source, "feed");
  assert.equal(r.confidence, "high");
});

test("epoch ms", () => {
  const r = parseObservedAt("1731230400000", { fetchedAt });
  assert.equal(r.source, "feed");
  assert.equal(r.confidence, "high");
});

test("chaîne vide fallback fetched", () => {
  const r = parseObservedAt("", { fetchedAt });
  assert.equal(r.source, "fetched");
  assert.equal(r.confidence, "low");
  assert.equal(r.at?.getTime(), fetchedAt.getTime());
});

test("chaîne invalide fallback fetched", () => {
  const r = parseObservedAt("zzzzz not a date", { fetchedAt });
  assert.equal(r.source, "fetched");
  assert.equal(r.confidence, "low");
});
