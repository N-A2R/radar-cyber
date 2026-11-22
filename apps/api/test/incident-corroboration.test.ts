import { test } from "node:test";
import { query } from "../src/db.js";
import assert from "node:assert/strict";
import {
  claimTime,
  CLAIM_WINDOW_MS,
  corroborateNAIncidents,
  isNA,
  loadCorroborationEvents,
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

test("the loader attaches the organisation department used for NA scope", async () => {
  const tag = `corrobdept${Date.now()}`;
  const sourceId = `${tag}-source`;
  await query(
    "INSERT INTO source (id, name, family, url, enabled) VALUES ($1,$2,'cti',$3,true)",
    [sourceId, `Source ${tag}`, `https://exemple.invalid/${tag}`],
  );
  const org = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, city, dept) VALUES ($1,$2,'entreprise','Bordeaux','33') RETURNING id",
    [`Organisation ${tag}`, `org-${tag}`],
  );
  const orgId = Number(org.rows[0].id);
  const event = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at,
                        severity, confidence, source_id, source_url, org_id, regional)
     VALUES ($1,'cti','third_party_claim',$2,now(),3,'A1',$3,$4,$5,false) RETURNING id`,
    [`${tag}:event`, `Incident ${tag}`, sourceId, `https://exemple.invalid/${tag}/preuve`, orgId],
  );
  const eventId = Number(event.rows[0].id);
  try {
    const loaded = (await loadCorroborationEvents()).find((row) => row.id === eventId);
    assert.equal(loaded?.orgDept, "33");
    assert.equal(loaded === undefined ? false : isNA(loaded), true);
  } finally {
    await query("DELETE FROM event WHERE id = $1", [eventId]);
    await query("DELETE FROM org WHERE id = $1", [orgId]);
    await query("DELETE FROM source WHERE id = $1", [sourceId]);
  }
});

test("a blank organisation department is treated as absent", async () => {
  const tag = `corrobblank${Date.now()}`;
  const sourceId = `${tag}-source`;
  await query(
    "INSERT INTO source (id, name, family, url, enabled) VALUES ($1,$2,'cti',$3,true)",
    [sourceId, `Source ${tag}`, `https://exemple.invalid/${tag}`],
  );
  const org = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, city, dept) VALUES ($1,$2,'entreprise','Paris',' ') RETURNING id",
    [`Organisation ${tag}`, `org-${tag}`],
  );
  const orgId = Number(org.rows[0].id);
  const event = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at,
                        severity, confidence, source_id, source_url, org_id, regional)
     VALUES ($1,'cti','third_party_claim',$2,now(),3,'A1',$3,$4,$5,false) RETURNING id`,
    [`${tag}:event`, `Incident ${tag}`, sourceId, `https://exemple.invalid/${tag}/preuve`, orgId],
  );
  const eventId = Number(event.rows[0].id);
  try {
    const loaded = (await loadCorroborationEvents()).find((row) => row.id === eventId);
    assert.equal(loaded?.orgDept, null);
  } finally {
    await query("DELETE FROM event WHERE id = $1", [eventId]);
    await query("DELETE FROM org WHERE id = $1", [orgId]);
    await query("DELETE FROM source WHERE id = $1", [sourceId]);
  }
});

