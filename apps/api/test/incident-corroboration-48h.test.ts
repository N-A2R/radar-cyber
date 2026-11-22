import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLICATION_DELAY_MS,
  publicationVerdicts,
} from "../src/analyse/incident-corroboration-48h.js";
import type { CorroborationReport } from "../src/analyse/incident-corroboration.js";

const FIRST = "2026-11-20T12:00:00.000Z";
const AT = "2026-11-22T12:00:00.000Z";

function report(clusters: {
  hash: string;
  firstClaimAt?: string;
  corroborated?: boolean;
  publishers?: string[];
  naIncident?: boolean;
}[]): CorroborationReport {
  return {
    incidentsTotal: clusters.length,
    incidentsCorroborated: clusters.filter((item) => item.corroborated).length,
    incidentsSingleSource: clusters.filter((item) => !item.corroborated).length,
    ratePercent: 0,
    clusters: clusters.map((item) => ({
      incidentKey: item.hash,
      victimHash: item.hash,
      eventIds: [1],
      sourceIds: [],
      publishers: item.publishers ?? ["one"],
      incidentEvents: item.incidentEvents ?? 1,
      firstClaimAt: item.firstClaimAt ?? FIRST,
      lastClaimAt: item.firstClaimAt ?? FIRST,
      corroborated: item.corroborated ?? false,
      naIncident: item.naIncident ?? true,
    })),
  };
}

test("a second independent source allows immediate publication", () => {
  const verdicts = publicationVerdicts(report([
    { hash: "aa", corroborated: true, publishers: ["a", "b"] },
  ]), AT);
  assert.deepEqual(verdicts.incidents[0], {
    victimHash: "aa",
    verdict: "second_source",
    firstClaimAt: FIRST,
    decisionAt: FIRST,
    ageHours: 48,
    publishers: 2,
  });
});

test("a single source older than 48 h is publishable with a documented delay", () => {
  const verdicts = publicationVerdicts(report([{ hash: "bb" }]), AT);
  assert.equal(verdicts.incidents[0]?.verdict, "after_delay");
  assert.equal(verdicts.incidents[0]?.decisionAt, "2026-11-22T12:00:00.000Z");
  assert.equal(verdicts.incidents[0]?.ageHours, 48);
});

test("a recent single source stays pending until the delay expires", () => {
  const verdicts = publicationVerdicts(report([
    { hash: "cc", firstClaimAt: "2026-11-22T10:00:00.000Z" },
  ]), AT);
  assert.equal(verdicts.incidents[0]?.verdict, "pending");
  assert.equal(verdicts.incidents[0]?.decisionAt, "2026-11-24T10:00:00.000Z");
  assert.equal(verdicts.incidents[0]?.ageHours, 2);
});

test("the summary counts every incident and reports the pending median", () => {
  const verdicts = publicationVerdicts(report([
    { hash: "aa", corroborated: true },
    { hash: "bb" },
    { hash: "cc", firstClaimAt: "2026-11-22T10:00:00.000Z" },
    { hash: "dd", firstClaimAt: "2026-11-22T08:00:00.000Z" },
  ]), AT);
  assert.deepEqual(verdicts.summary, {
    incidents: 4,
    secondSource: 1,
    afterDelay: 1,
    pending: 2,
    medianPendingAgeHours: 3,
  });
});

test("incidents outside Nouvelle-Aquitaine get no publication verdict", () => {
  const verdicts = publicationVerdicts(report([
    { hash: "na", corroborated: true },
    { hash: "outside", naIncident: false },
  ]), AT);
  assert.deepEqual(verdicts.incidents.map((item) => item.victimHash), ["na"]);
  assert.equal(verdicts.summary.incidents, 1);
});

test("the publication delay is 48 hours", () => {
  assert.equal(PUBLICATION_DELAY_MS, 48 * 3_600_000);
});
