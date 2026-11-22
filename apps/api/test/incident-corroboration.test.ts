import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimTime,
  CLAIM_WINDOW_MS,
  corroborateNAIncidents,
  publisherOf,
  type CorroborationEvent,
} from "../src/analyse/incident-corroboration.js";

const RANSOMLOOK = "https://www.ransomlook.io/api/recent";
const RANSOMLOOK_FEED = "https://ransomlook.io/api/recent";
const RANSOMWARE_LIVE = "https://www.ransomware.live/rss.xml";
const CLAIM_AT = "2026-11-12T20:00:00.000Z";

function claim(id: number, overrides: Partial<CorroborationEvent> = {}): CorroborationEvent {
  return {
    id,
    sourceId: `source-${id}`,
    sourceUrl: RANSOMLOOK,
    family: "ransomware",
    assertionType: "third_party_claim",
    orgId: 42,
    orgDept: "17",
    regional: true,
    observedAt: CLAIM_AT,
    evidence: {
      group: "incransom",
      org_hint: "example-victim.fr\\$1M\\France",
      claimed_at: CLAIM_AT,
    },
    title: "example-victim.fr — revendiqué par incransom",
    ...overrides,
  };
}

function relay(id: number, overrides: Partial<CorroborationEvent> = {}): CorroborationEvent {
  return claim(id, {
    sourceId: "ransomware-live",
    sourceUrl: RANSOMWARE_LIVE,
    assertionType: "ambient_signal",
    orgDept: null,
    regional: false,
    evidence: { feed: "ransomware.live RSS" },
    title: "Incransom has just published a new victim : example-victim.fr",
    ...overrides,
  });
}

test("two independent publishers corroborate one incident", () => {
  const report = corroborateNAIncidents([claim(1), relay(2)]);
  assert.equal(report.incidentsTotal, 1);
  assert.equal(report.incidentsCorroborated, 1);
  assert.equal(report.ratePercent, 100);
  assert.deepEqual(report.clusters[0]?.publishers, ["ransomlook.io", "ransomware.live"]);
});

test("two feeds of the same publisher do not corroborate", () => {
  const report = corroborateNAIncidents([
    claim(1),
    claim(2, { sourceId: "ransomlook-recent-api", sourceUrl: RANSOMLOOK_FEED }),
  ]);
  assert.equal(report.incidentsTotal, 1);
  assert.equal(report.incidentsCorroborated, 0);
  assert.equal(report.ratePercent, 0);
});

test("a press relay from a second publisher corroborates a claim", () => {
  const report = corroborateNAIncidents([claim(1), relay(2)]);
  assert.equal(report.clusters[0]?.sourceIds.length, 2);
  assert.equal(report.clusters[0]?.incidentEvents, 1);
  assert.equal(report.clusters[0]?.corroborated, true);
});

test("incidents outside Nouvelle-Aquitaine are excluded", () => {
  const outside = (event: CorroborationEvent): CorroborationEvent => ({
    ...event, regional: false, orgDept: "75",
  });
  const report = corroborateNAIncidents([outside(claim(1)), outside(relay(2))]);
  assert.equal(report.incidentsTotal, 0);
  assert.equal(report.ratePercent, 0);
});
test("two different victims stay two separate incidents", () => {
  const other = claim(2, {
    evidence: { group: "incransom", org_hint: "another-victim.fr", claimed_at: CLAIM_AT },
    title: "another-victim.fr — revendiqué par incransom",
  });
  const report = corroborateNAIncidents([claim(1), other]);
  assert.equal(report.incidentsTotal, 2);
  assert.equal(report.incidentsCorroborated, 0);
});

test("a republished claim beyond the window is a new incident", () => {
  const late = new Date(Date.parse(CLAIM_AT) + CLAIM_WINDOW_MS + 1000).toISOString();
  const later = relay(2, {
    assertionType: "third_party_claim",
    regional: true,
    observedAt: late,
    evidence: { group: "incransom", org_hint: "example-victim.fr", claimed_at: late },
  });
  const report = corroborateNAIncidents([claim(1), later]);
  assert.equal(report.incidentsTotal, 2);
  assert.equal(report.incidentsCorroborated, 0);
});

test("publisher identity comes from the URL host, not the feed name", () => {
  assert.equal(publisherOf(RANSOMLOOK, "a"), "ransomlook.io");
  assert.equal(publisherOf(RANSOMLOOK_FEED, "b"), "ransomlook.io");
  assert.equal(publisherOf(RANSOMWARE_LIVE, "c"), "ransomware.live");
  assert.equal(publisherOf("https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json", "d"),
    "raw.githubusercontent.com/joshhighet");
  assert.equal(publisherOf(null, "offline-feed"), "offline-feed");
});

test("claim time prefers the publication date carried in evidence", () => {
  const observedAt = "2026-11-21T20:00:00.000Z";
  const event = claim(1, { observedAt });
  assert.equal(claimTime(event), Date.parse(CLAIM_AT));
  assert.equal(claimTime(claim(2, { evidence: {}, observedAt })), Date.parse(observedAt));
});

