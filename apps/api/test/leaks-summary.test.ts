/**
 * One behavior per test for the publishable breakdown of NA leak attachments.
 * Fixtures only: no quarantine row, victim payload or network call is used.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  summarizeLeaksByDomain,
  type DomainAttachment,
  type DomainOrganization,
} from "../src/leaks/by-domain.js";

function org(id: number, department: string | null, domain: string): DomainOrganization {
  return { id, department, domain, website: null };
}

function attachment(claimId: string, orgId: number, source = "ransomwatch"): DomainAttachment {
  return { claimId, orgId, domain: "example.fr", source };
}

test("groups counted leaks by NA department code and source", () => {
  const organizations = [
    org(1, "33", "a.fr"),
    org(2, "Gironde", "b.fr"),
    org(3, "17", "c.fr"),
    org(4, "75", "d.fr"),
  ];
  const attachments = [
    attachment("1", 1),
    attachment("2", 2, "ransomware.live"),
    attachment("3", 3),
    attachment("4", 4),
  ];
  assert.deepEqual(summarizeLeaksByDomain(attachments, organizations), {
    byDepartment: { "17": 1, "33": 2 },
    bySource: { ransomwatch: 2, "ransomware.live": 1 },
  });
});

test("an attachment without an NA organization is not summarized", () => {
  assert.deepEqual(summarizeLeaksByDomain([attachment("5", 999)], [org(1, "33", "a.fr")]), {
    byDepartment: {},
    bySource: {},
  });
});

test("breakdown keys are sorted for reproducible publication", () => {
  const organizations = [org(1, "86", "a.fr"), org(2, "16", "b.fr")];
  const attachments = [attachment("6", 1, "zsource"), attachment("7", 2, "asource")];
  const summary = summarizeLeaksByDomain(attachments, organizations);
  assert.deepEqual(Object.keys(summary.byDepartment), ["16", "86"]);
  assert.deepEqual(Object.keys(summary.bySource), ["asource", "zsource"]);
});

test("the summary contains only counters and category keys", () => {
  const summary = summarizeLeaksByDomain([attachment("8", 1)], [org(1, "33", "a.fr")]);
  assert.deepEqual(Object.keys(summary).sort(), ["byDepartment", "bySource"]);
  assert.doesNotMatch(JSON.stringify(summary), /claim|raw|victim|email|password|body/i);
});
