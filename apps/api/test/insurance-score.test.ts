/**
 * One behaviour per test: the published insurance score formula.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeInsuranceScore,
  INSURANCE_SCORE_VERSION,
  insuranceMethodology,
  SCORE_WEIGHTS,
  type InsuranceInput,
} from "../src/insurance/score.js";

function input(overrides: Partial<InsuranceInput> = {}): InsuranceInput {
  return {
    sirenPresent: true,
    nafPresent: true,
    coordinatesPresent: true,
    registryIdentifierPresent: true,
    workforce: 100000,
    incidentCount: 0,
    maxIncidentSeverity: 0,
    ambientCount: 0,
    distinctSources: 4,
    sectorClaimRate: 0.00001,
    overallClaimRate: 0.00002,
    ...overrides,
  };
}

test("the same inputs give the same score and the same breakdown", () => {
  const first = computeInsuranceScore(input());
  const second = computeInsuranceScore(input());
  assert.deepEqual(first, second);
});

test("a complete organization with no observed signal reaches 100", () => {
  const scored = computeInsuranceScore(input({ sectorClaimRate: 0, overallClaimRate: 0 }));
  assert.equal(scored.score, 100);
  assert.equal(scored.band, "A");
});

test("each missing registry field removes exactly five points", () => {
  const scored = computeInsuranceScore(input({ sirenPresent: false, nafPresent: false }));
  const integrity = scored.components.find((component) => component.key === "recordIntegrity");
  assert.deepEqual(integrity, {
    key: "recordIntegrity",
    points: 10,
    weight: 20,
    reason: "2 of 4 registry fields present (5 points each)",
  });
});

test("an unpublished workforce earns no transparency points", () => {
  const scored = computeInsuranceScore(input({ workforce: null }));
  assert.equal(scored.components.find((c) => c.key === "workforceTransparency")?.points, 0);
});

test("workforce points follow the log formula and never exceed the weight", () => {
  const hundred = computeInsuranceScore(input({ workforce: 100 }));
  const million = computeInsuranceScore(input({ workforce: 1_000_000 }));
  assert.equal(hundred.components.find((c) => c.key === "workforceTransparency")?.points, 5);
  assert.equal(million.components.find((c) => c.key === "workforceTransparency")?.points, 10);
});

test("one confirmed incident removes twenty points", () => {
  const scored = computeInsuranceScore(input({ incidentCount: 1, maxIncidentSeverity: 2 }));
  assert.equal(scored.components.find((c) => c.key === "incidentFreeHistory")?.points, 15);
});

test("severity above two removes three points per level", () => {
  const scored = computeInsuranceScore(input({ incidentCount: 1, maxIncidentSeverity: 4 }));
  assert.equal(scored.components.find((c) => c.key === "incidentFreeHistory")?.points, 9);
});

test("an extreme incident history is capped at the component weight", () => {
  const scored = computeInsuranceScore(input({ incidentCount: 50, maxIncidentSeverity: 5 }));
  assert.equal(scored.components.find((c) => c.key === "incidentFreeHistory")?.points, 0);
  assert.ok(scored.score >= 0);
});

test("each ambient signal removes five pressure points, capped at fifteen", () => {
  const one = computeInsuranceScore(input({ ambientCount: 1 }));
  const many = computeInsuranceScore(input({ ambientCount: 10 }));
  assert.equal(one.components.find((c) => c.key === "ambientPressure")?.points, 10);
  assert.equal(many.components.find((c) => c.key === "ambientPressure")?.points, 0);
});

test("a sector at twice the regional claim rate loses its peer points", () => {
  const scored = computeInsuranceScore(input({ sectorClaimRate: 0.00004, overallClaimRate: 0.00002 }));
  assert.equal(scored.components.find((c) => c.key === "sectorPeerPosition")?.points, 0);
});

test("peer points follow the sector-to-regional claim ratio", () => {
  const scored = computeInsuranceScore(input({ sectorClaimRate: 0.00001 }));
  assert.equal(scored.components.find((c) => c.key === "sectorPeerPosition")?.points, 7.5);
});

test("no regional claim at all gives full peer points to everyone", () => {
  const scored = computeInsuranceScore(input({ sectorClaimRate: 0.5, overallClaimRate: 0 }));
  assert.equal(scored.components.find((c) => c.key === "sectorPeerPosition")?.points, 10);
});

test("distinct sources build evidence breadth up to ten points", () => {
  const one = computeInsuranceScore(input({ distinctSources: 1 }));
  const many = computeInsuranceScore(input({ distinctSources: 9 }));
  assert.equal(one.components.find((c) => c.key === "evidenceBreadth")?.points, 3);
  assert.equal(many.components.find((c) => c.key === "evidenceBreadth")?.points, 10);
});

test("bands stay comparable across the whole scale", () => {
  assert.equal(computeInsuranceScore(input()).band, "A");
  assert.equal(computeInsuranceScore(input({ incidentCount: 1, maxIncidentSeverity: 2 })).band, "B");
  assert.equal(computeInsuranceScore(input({ incidentCount: 2, maxIncidentSeverity: 2, ambientCount: 3 })).band, "C");
  assert.equal(computeInsuranceScore(input({ incidentCount: 3, maxIncidentSeverity: 2, ambientCount: 3, sirenPresent: false, nafPresent: false })).band, "D");
});

test("invalid counts and rates cannot inflate a score", () => {
  const scored = computeInsuranceScore(input({
    workforce: -5,
    incidentCount: -2,
    maxIncidentSeverity: Number.NaN,
    ambientCount: -1,
    distinctSources: Number.POSITIVE_INFINITY,
    sectorClaimRate: Number.NaN,
    overallClaimRate: -1,
  }));
  assert.equal(scored.inputs.workforce, null);
  assert.equal(scored.inputs.incidentCount, 0);
  assert.equal(scored.inputs.maxIncidentSeverity, 0);
  assert.equal(scored.inputs.ambientCount, 0);
  assert.equal(scored.inputs.distinctSources, 0);
  assert.equal(scored.score, computeInsuranceScore(input({
    workforce: null, distinctSources: 0, sectorClaimRate: 0, overallClaimRate: 0,
  })).score);
});

test("each component stays within its published weight", () => {
  for (const variant of [input(), input({ workforce: null, distinctSources: 0 }), input({ incidentCount: 9 })]) {
    const scored = computeInsuranceScore(variant);
    for (const component of scored.components) {
      assert.ok(component.points >= 0 && component.points <= component.weight, component.key);
    }
  }
});

test("the published methodology declares the weights used by the formula", () => {
  const method = insuranceMethodology();
  assert.equal(method.version, INSURANCE_SCORE_VERSION);
  assert.deepEqual(
    Object.fromEntries(method.components.map((component) => [component.key, component.weight])),
    SCORE_WEIGHTS,
  );
});
