/** One behaviour per test: the MISP importer rejects anything it cannot prove. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importMispEvents, regionFromTags } from "../src/connectors/misp.js";

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uuid: "11111111-1111-5111-a111-111111111111",
    info: "Ransomware claim in Gironde",
    date: "2026-11-20",
    Tag: [{ name: "na:33" }],
    Attribute: [
      { type: "domain", value: "hopital-bordeaux.fr" },
      { type: "url", value: "https://example.fr/article?id=7" },
    ],
    ...overrides,
  };
}

describe("MISP import connector", () => {
  it("imports allow-listed indicators from a MISP response", () => {
    const result = importMispEvents({ response: { Event: [event()] } });
    assert.equal(result.accepted.length, 1);
    assert.equal(result.rejected.length, 0);
    assert.deepEqual(result.accepted[0]?.indicators, [
      { type: "domain", value: "hopital-bordeaux.fr" },
      { type: "url", value: "https://example.fr/article" },
    ]);
    assert.equal(result.accepted[0]?.department, "33");
    assert.equal(result.accepted[0]?.observedAt, "2026-11-20T00:00:00.000Z");
  });

  it("rejects events with no Nouvelle-Aquitaine tag", () => {
    const result = importMispEvents([
      event({ uuid: "outside", Tag: [{ name: "region:occitanie" }] }),
      event({ uuid: "untagged", Tag: [] }),
    ]);
    assert.equal(result.accepted.length, 0);
    assert.deepEqual(result.rejected.map((r) => r.reason), [
      "outside-nouvelle-aquitaine",
      "outside-nouvelle-aquitaine",
    ]);
    assert.equal(regionFromTags(["na:75"]), null);
  });

  it("drops personal identifiers and URL query strings", () => {
    const result = importMispEvents([event({
      Attribute: [
        { type: "email", value: "victim@example.fr" },
        { type: "phone-number", value: "01 23 45 67 89" },
        { type: "domain", value: "jean.dupont@example.fr" },
        { type: "url", value: "https://example.fr/a?token=private" },
        { type: "sha256", value: "a".repeat(64) },
      ],
    })]);
    assert.equal(result.accepted.length, 1);
    assert.deepEqual(result.accepted[0]?.indicators, [
      { type: "url", value: "https://example.fr/a" },
      { type: "sha256", value: "a".repeat(64) },
    ]);
    assert.equal(result.attributesDropped, 3);
    const json = JSON.stringify(result.accepted);
    assert.ok(!json.includes("victim@example.fr"));
    assert.ok(!json.includes("01 23 45 67 89"));
    assert.ok(!json.includes("token=private"));
  });

  it("keeps gray-source events with their trust marker", () => {
    const result = importMispEvents([event({
      Tag: [{ name: "na:33" }, { name: "source-trust:gray" }],
      Attribute: [],
    })]);
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0]?.sourceTrust, "gray");
  });

  it("deduplicates repeated MISP uuids", () => {
    const result = importMispEvents([event(), event()]);
    assert.equal(result.accepted.length, 1);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.reason, "duplicate-uuid");
  });

  it("handles malformed payloads without throwing", () => {
    assert.deepEqual(importMispEvents(null), { accepted: [], rejected: [], attributesDropped: 0 });
    assert.deepEqual(importMispEvents({ unrelated: true }), { accepted: [], rejected: [], attributesDropped: 0 });
    const result = importMispEvents([42, event({ info: "" })]);
    assert.deepEqual(result.rejected.map((r) => r.reason), ["invalid-event", "missing-title"]);
  });
});
