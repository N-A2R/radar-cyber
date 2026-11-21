import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditHomonymGroup,
  formatRate,
  groupByIdentity,
  identityKey,
  isValidSiren,
  verifiedRate,
  type SirenCandidate,
} from "../src/siren/audit.js";

function candidate(id: number, siren: string, overrides: Partial<SirenCandidate> = {}): SirenCandidate {
  return { id, siren, registerMatch: false, proofMatch: false, ...overrides };
}

test("rejects a SIREN that is not nine digits", () => {
  assert.equal(isValidSiren("55203253"), false);
  assert.equal(isValidSiren("5520325341"), false);
  assert.equal(isValidSiren("55203253A"), false);
  assert.equal(isValidSiren(null), false);
});

test("checks the INSEE Luhn checksum", () => {
  assert.equal(isValidSiren("552032534"), true);
  assert.equal(isValidSiren("552032535"), false);
  assert.equal(isValidSiren("200071827"), true);
});

test("identity key ignores accents, case and punctuation", () => {
  assert.equal(
    identityKey("Centre hospitalier d'Angoulême", "ANGOULEME", "16"),
    identityKey("centre hospitalier d angouleme", "Angoulême", "16"),
  );
  assert.notEqual(
    identityKey("Ranger", "Bruges", "33"),
    identityKey("Ranger", "Bordeaux", "33"),
  );
});

test("identity grouping merges names differing only by punctuation or ligatures", () => {
  const groups = groupByIdentity([
    { id: 1, siren: "552032534", name: "Œuvre d'Angoulême", city: "Angoulême", dept: "16" },
    { id: 2, siren: "200071827", name: "oeuvre d angouleme", city: "ANGOULEME", dept: "16" },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].members.map((member) => member.id),
    [1, 2],
  );
});

test("identity grouping keeps different cities and departments apart", () => {
  const groups = groupByIdentity([
    { id: 1, siren: "552032534", name: "Ranger", city: "Bordeaux", dept: "33" },
    { id: 2, siren: "200071827", name: "Ranger", city: "Angoulême", dept: "16" },
  ]);
  assert.equal(groups.length, 2);
});

test("a lone SIREN in an identity group is verified", () => {
  const verdicts = auditHomonymGroup({
    identity: "org|city|dept",
    members: [candidate(1, "552032534"), candidate(2, "552032534")],
  });
  assert.deepEqual([...verdicts.values()], ["verified", "verified"]);
});

test("unresolved homonyms stay ambiguous instead of choosing a winner", () => {
  const verdicts = auditHomonymGroup({
    identity: "org|city|dept",
    members: [candidate(1, "552032534"), candidate(2, "200071827")],
  });
  assert.equal(verdicts.get(1), "ambiguous");
  assert.equal(verdicts.get(2), "ambiguous");
});

test("an independent register match resolves one homonym", () => {
  const verdicts = auditHomonymGroup({
    identity: "org|city|dept",
    members: [
      candidate(1, "552032534", { registerMatch: true }),
      candidate(2, "200071827"),
    ],
  });
  assert.equal(verdicts.get(1), "verified");
  assert.equal(verdicts.get(2), "ambiguous");
});

test("a traceable register proof resolves one homonym", () => {
  const verdicts = auditHomonymGroup({
    identity: "org|city|dept",
    members: [
      candidate(1, "552032534", { proofMatch: true }),
      candidate(2, "200071827"),
    ],
  });
  assert.equal(verdicts.get(1), "verified");
  assert.equal(verdicts.get(2), "ambiguous");
});

test("a checksum failure is invalid even when the name is unique", () => {
  const verdicts = auditHomonymGroup({
    identity: "org|city|dept",
    members: [candidate(1, "200058646")],
  });
  assert.equal(verdicts.get(1), "invalid");
});

test("the rate uses SIREN-bearing organizations as denominator", () => {
  assert.equal(verifiedRate({ totalWithSiren: 100, invalid: 1, ambiguous: 24 }), 0.75);
  assert.equal(formatRate(0.75), "75.00%");
});

test("an empty denominator yields zero instead of NaN", () => {
  assert.equal(verifiedRate({ totalWithSiren: 0, invalid: 0, ambiguous: 0 }), 0);
});
