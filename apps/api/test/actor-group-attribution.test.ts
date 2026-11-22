import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributeActor,
  dedupeAttributions,
  isSafeActorLabel,
  normalizeActorKey,
  type GroupCandidate,
} from "../src/attribution/actor-group.js";

const GROUPS: GroupCandidate[] = [
  { slug: "lockbit-3-0", name: "LockBit 3.0" },
  { slug: "lockbit-2-0", name: "LockBit 2.0" },
  { slug: "the-gentlemen", name: "The Gentlemen" },
  { slug: "inc-ransom", name: "Inc Ransom" },
  { slug: "ransomhouse", name: "ransomhouse" },
  { slug: "vexy", name: "vexy" },
];

test("normalization strips accents, punctuation and generic suffixes", () => {
  assert.equal(normalizeActorKey("  Vexy Ransomware "), "vexy");
  assert.equal(normalizeActorKey("L’Étranger Group"), "letranger");
  assert.equal(normalizeActorKey("LockBit 3.0"), "lockbit30");
});

test("an exact group label gives a high-confidence attribution", () => {
  const result = attributeActor({ actor: "The Gentlemen", sources: 1, claims: 22 }, GROUPS);
  assert.ok(result);
  assert.equal(result.groupSlug, "the-gentlemen");
  assert.equal(result.method, "exact");
  assert.equal(result.confidence, 95);
  assert.equal(result.level, "high");
});

test("a numbering alias points to the tracked group", () => {
  const result = attributeActor({ actor: "lockbit3", sources: 2, claims: 2054 }, GROUPS);
  assert.ok(result);
  assert.equal(result.groupSlug, "lockbit-3-0");
  assert.equal(result.method, "alias");
  assert.equal(result.confidence, 93);
});

test("a unique variant gets a lower-confidence prefix attribution", () => {
  const result = attributeActor({ actor: "RansomHouse v2", sources: 1, claims: 3 }, GROUPS);
  assert.ok(result);
  assert.equal(result.groupSlug, "ransomhouse");
  assert.equal(result.method, "prefix");
  assert.equal(result.confidence, 72);
  assert.equal(result.level, "low");
});

test("ambiguous and distant labels are not attributed", () => {
  const ambiguous = [...GROUPS, { slug: "samegroup", name: "Same Group" }, { slug: "same-group", name: "Samegroup" }];
  assert.equal(attributeActor({ actor: "Same Group", sources: 1, claims: 1 }, ambiguous), null);
  assert.equal(attributeActor({ actor: "totally different label", sources: 1, claims: 1 }, GROUPS), null);
});

test("a two-edit near miss is not silently attributed", () => {
  assert.equal(attributeActor({ actor: "lockbit3 fs", sources: 2, claims: 113 }, GROUPS), null);
});

test("independent sources corroborate a label and raise its level", () => {
  const once = attributeActor({ actor: "RansomHouse v2", sources: 1, claims: 1 }, GROUPS);
  const thrice = attributeActor({ actor: "RansomHouse v2", sources: 3, claims: 1 }, GROUPS);
  assert.ok(once);
  assert.ok(thrice);
  assert.equal(thrice.confidence, once.confidence + 5);
  assert.equal(once.level, "low");
  assert.equal(thrice.level, "medium");
});

test("personal-looking labels are rejected before attribution", () => {
  assert.equal(isSafeActorLabel("marie.dupont@example.fr"), false);
  assert.equal(attributeActor({ actor: "marie.dupont@example.fr", sources: 1, claims: 1 }, GROUPS), null);
  assert.equal(attributeActor({ actor: "+33 6 12 34 56 78", sources: 1, claims: 1 }, GROUPS), null);
});

test("one attribution is kept per actor, strongest evidence first", () => {
  const weak = attributeActor({ actor: "lockbit3", sources: 1, claims: 1 }, GROUPS);
  const strong = attributeActor({ actor: "LockBit 3", sources: 3, claims: 2 }, GROUPS);
  const other = attributeActor({ actor: "thegentlemen", sources: 1, claims: 1 }, GROUPS);
  assert.ok(weak);
  assert.ok(strong);
  assert.ok(other);
  const result = dedupeAttributions([weak, strong, other]);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.actor, "LockBit 3");
  assert.equal(result[0]!.confidence, 95);
});
