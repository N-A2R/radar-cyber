import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEW_THRESHOLD, scoreAlert } from "../src/detect/confidence.js";

test("note maximale : source A1, incident confirmé, org géolocalisée, 3 sources", () => {
  const c = scoreAlert({
    sourceConfidence: "A1",
    assertionType: "confirmed_incident",
    orgId: 12,
    orgDept: "33",
    distinctSources: 3,
  });
  assert.equal(c.score, 100);
  assert.equal(c.status, "verifie");
  assert.deepEqual(c.components, {
    source_reliability: 1,
    assertion_strength: 1,
    attachment_quality: 1,
    corroboration: 1,
  });
});

test("note minimale : source C3, signal d'ambiance, aucun rattachement", () => {
  const c = scoreAlert({
    sourceConfidence: "C3",
    assertionType: "ambient_signal",
    orgId: null,
    orgDept: null,
    distinctSources: 0,
  });
  assert.equal(c.score, 21);
  assert.equal(c.status, "a_verifier");
});

test("seuil : une note exactement égale au seuil vaut « vérifié »", () => {
  const c = scoreAlert({
    sourceConfidence: "B2",
    assertionType: "confirmed_incident",
    orgId: 3,
    orgDept: "33",
    distinctSources: 0,
  });
  assert.equal(c.score, REVIEW_THRESHOLD);
  assert.equal(c.status, "verifie");
});

test("une note juste sous le seuil bascule en « à vérifier »", () => {
  const c = scoreAlert({
    sourceConfidence: "B2",
    assertionType: "third_party_claim",
    orgId: 3,
    orgDept: "33",
    distinctSources: 0,
  });
  assert.ok(c.score < REVIEW_THRESHOLD);
  assert.equal(c.status, "a_verifier");
});

test("revendication non corroborée d'une source C3 : jamais « vérifié »", () => {
  const c = scoreAlert({
    sourceConfidence: "C3",
    assertionType: "third_party_claim",
    orgId: 12,
    orgDept: "17",
    distinctSources: 1,
  });
  assert.ok(c.score < REVIEW_THRESHOLD);
  assert.equal(c.status, "a_verifier");
});

test("corroboration : la deuxième source compte plus que la première", () => {
  const base = { sourceConfidence: "A2", assertionType: "third_party_claim", orgId: 4, orgDept: "64" };
  const one = scoreAlert({ ...base, distinctSources: 1 });
  const two = scoreAlert({ ...base, distinctSources: 2 });
  const three = scoreAlert({ ...base, distinctSources: 3 });
  assert.ok(two.score > one.score);
  assert.ok(three.score > two.score);
  assert.ok(three.score <= 100);
});

test("champs absents : aucune composante NaN, note bornée", () => {
  const c = scoreAlert({});
  assert.ok(Number.isInteger(c.score));
  assert.ok(c.score >= 0 && c.score <= 100);
  for (const value of Object.values(c.components)) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
});
