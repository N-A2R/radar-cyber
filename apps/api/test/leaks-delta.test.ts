/**
 * One behavior per test for the difference between two published leak counts.
 * Fixtures only: no quarantine row, victim payload or network call is used.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { diffLeakAttachments } from "../src/leaks/delta.js";
import type { DomainAttachment } from "../src/leaks/by-domain.js";

function attachment(claimId: string, orgId: number, domain = "example.fr"): DomainAttachment {
  return { claimId, orgId, domain, source: "ransomwatch" };
}

test("reports an attachment added since the previous measurement", () => {
  const previous = [attachment("1", 10)];
  const current = [attachment("1", 10), attachment("2", 20, "new.fr")];
  assert.deepEqual(diffLeakAttachments(previous, current).added, [attachment("2", 20, "new.fr")]);
});

test("reports an attachment removed since the previous measurement", () => {
  const previous = [attachment("1", 10), attachment("2", 20, "gone.fr")];
  const current = [attachment("1", 10)];
  assert.deepEqual(diffLeakAttachments(previous, current).removed, [attachment("2", 20, "gone.fr")]);
});

test("ignores attachments present in both measurements", () => {
  const unchanged = [attachment("1", 10), attachment("2", 20)];
  assert.deepEqual(diffLeakAttachments(unchanged, unchanged), { added: [], removed: [] });
});

test("orders added and removed attachments by a stable key", () => {
  const previous = [attachment("9", 90), attachment("2", 20)];
  const current = [attachment("8", 80), attachment("1", 10)];
  const delta = diffLeakAttachments(previous, current);
  assert.deepEqual(delta.added.map((a) => a.claimId), ["1", "8"]);
  assert.deepEqual(delta.removed.map((a) => a.claimId), ["2", "9"]);
});

test("the delta carries only published identifier fields", () => {
  const delta = diffLeakAttachments([], [attachment("13322", 295426, "citebd.org")]);
  assert.deepEqual(Object.keys(delta).sort(), ["added", "removed"]);
  assert.deepEqual(Object.keys(delta.added[0]!).sort(), ["claimId", "domain", "orgId", "source"]);
  assert.doesNotMatch(JSON.stringify(delta), /body|victim|email|password|name/i);
});
