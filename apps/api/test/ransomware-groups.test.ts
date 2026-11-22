/**
 * One behaviour per test: the rules that decide which ransomware groups are
 * tracked and which organisation-level victims may be published.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deduplicateVictims,
  distinctiveNameFromHint,
  groupSlug,
  normalizeGroupName,
  safeHint,
  safeSourceUrl,
  selectTrackedGroups,
  type VictimEvidence,
} from "../src/ransomware/groups.js";

function victim(slug: string, orgId: number, matchType: VictimEvidence["matchType"]): VictimEvidence {
  return {
    slug, orgId, orgName: "Organisation", dept: "33", source: "test",
    sourceUrl: null, claimId: null, claimedAt: null, matchType,
  };
}

test("source spellings of a group resolve to one canonical name", () => {
  assert.equal(normalizeGroupName("lockbit3"), "LockBit 3.0");
  assert.equal(normalizeGroupName(" lockbit 3.0 "), "LockBit 3.0");
  assert.equal(normalizeGroupName("thegentlemen"), "The Gentlemen");
  assert.equal(groupSlug("LockBit 3.0"), "lockbit-3-0");
});

test("hints carrying personal data are never matched", () => {
  assert.equal(safeHint("jean.dupont@exemple.fr"), null);
  assert.equal(safeHint("06 12 34 56 78"), null);
  assert.equal(safeHint("citebd.org"), "citebd.org");
});

test("only distinctive organisation names are accepted for matching", () => {
  assert.equal(distinctiveNameFromHint("Esc Pau Etudes Conseils"), "esc pau etudes conseils");
  assert.equal(distinctiveNameFromHint("La Providence"), null);
  assert.equal(distinctiveNameFromHint("TPI"), null);
  assert.equal(distinctiveNameFromHint("citebd.org"), null);
});

test("source URLs are stripped of credentials and query data", () => {
  assert.equal(
    safeSourceUrl("https://user:secret@ransomware.live/id/abc?token=private#x"),
    "https://ransomware.live/id/abc",
  );
  assert.equal(safeSourceUrl("mailto:someone@example.fr"), null);
});

test("a victim seen by two claims is published once", () => {
  const rows = [victim("qilin", 42, "name"), victim("qilin", 42, "domain")];
  const unique = deduplicateVictims(rows);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].matchType, "domain");
  assert.equal("score" in unique[0], false);
});

test("groups with NA victims are tracked before filler groups", () => {
  const tracked = selectTrackedGroups(
    ["rhysida"],
    [
      { slug: "lockbit-3-0", claims: 900 },
      { slug: "rhysida", claims: 1 },
      { slug: "play", claims: 800 },
    ],
    2,
  );
  assert.deepEqual(tracked, ["lockbit-3-0", "rhysida"]);
});
