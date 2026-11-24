import assert from "node:assert/strict";
import test from "node:test";
import { detectSharedInfrastructure } from "../src/analyse/shared-infrastructure.js";
import { buildInfrastructureGeography } from "../src/analyse/shared-infrastructure-geography.js";
import {
  buildInfrastructureTimeline,
  type DatedInfrastructureObservation,
  type InfrastructureTimeline,
} from "../src/analyse/shared-infrastructure-timeline.js";
import { buildInfrastructurePersistence } from "../src/analyse/shared-infrastructure-persistence.js";

const observation = (
  orgId: number,
  value: string,
  observedAt: string,
): DatedInfrastructureObservation => ({
  orgId,
  kind: "leak_site",
  value,
  observedAt,
});

const alpha = (orgId: number, observedAt: string) =>
  observation(orgId, "http://alphaaaaa.onion/post", observedAt);

const geographyFor = (
  observations: readonly DatedInfrastructureObservation[],
  departments: ReadonlyArray<readonly [number, string]>,
) =>
  buildInfrastructureGeography(detectSharedInfrastructure(observations), new Map(departments));

const timelineFor = (observations: readonly DatedInfrastructureObservation[]) =>
  buildInfrastructureTimeline(detectSharedInfrastructure(observations), observations);

test("counts a cross-department cluster observed on two distinct days", () => {
  const observations = [alpha(1, "2025-01-01T10:00:00Z"), alpha(2, "2025-02-01T10:00:00Z")];
  const result = buildInfrastructurePersistence(
    geographyFor(observations, [[1, "16"], [2, "17"]]),
    timelineFor(observations),
  );
  assert.equal(result.persistentClusters, 1);
  assert.equal(result.clusters[0]?.persistent, true);
  assert.equal(result.clusters[0]?.reuseDays, 31);
});

test("excludes a dated cluster confined to one department", () => {
  const observations = [alpha(1, "2025-01-01T10:00:00Z"), alpha(2, "2025-02-01T10:00:00Z")];
  const result = buildInfrastructurePersistence(
    geographyFor(observations, [[1, "33"], [2, "33"]]),
    timelineFor(observations),
  );
  assert.equal(result.clusters[0]?.crossDepartment, false);
  assert.equal(result.clusters[0]?.dated, true);
  assert.equal(result.persistentClusters, 0);
});

test("excludes a cross-department cluster seen on a single day", () => {
  const observations = [alpha(1, "2025-03-10T08:00:00Z"), alpha(2, "2025-03-10T22:00:00Z")];
  const result = buildInfrastructurePersistence(
    geographyFor(observations, [[1, "16"], [2, "79"]]),
    timelineFor(observations),
  );
  assert.equal(result.clusters[0]?.crossDepartment, true);
  assert.equal(result.clusters[0]?.dated, false);
  assert.equal(result.persistentClusters, 0);
});

test("does not promote a cluster absent from the timeline", () => {
  const observations = [alpha(1, "2025-01-01T10:00:00Z"), alpha(2, "2025-02-01T10:00:00Z")];
  const geography = geographyFor(observations, [[1, "16"], [2, "17"]]);
  const empty: InfrastructureTimeline = {
    clusterCount: 0,
    datedClusters: 0,
    medianReuseDays: null,
    longestReuseDays: 0,
    observationsWithDates: 0,
    clusterTimelines: [],
  };
  const result = buildInfrastructurePersistence(geography, empty);
  assert.equal(result.clusters[0]?.reuseDays, 0);
  assert.equal(result.clusters[0]?.persistent, false);
  assert.equal(result.persistentClusters, 0);
});

test("joins timeline entries by cluster id regardless of their order", () => {
  const a = [observation(1, "http://alphaaaaa.onion/post", "2025-01-01T10:00:00Z"),
    observation(2, "http://alphaaaaa.onion/post", "2025-02-01T10:00:00Z")];
  const b = [observation(3, "http://bravobbbb.onion/post", "2025-01-01T10:00:00Z"),
    observation(4, "http://bravobbbb.onion/post", "2025-02-01T10:00:00Z")];
  const observations = [...a, ...b];
  const geography = geographyFor(observations, [[1, "16"], [2, "17"], [3, "33"], [4, "33"]]);
  const reversed = timelineFor(observations);
  reversed.clusterTimelines = [...reversed.clusterTimelines].reverse();
  const result = buildInfrastructurePersistence(geography, reversed);
  assert.equal(result.persistentClusters, 1);
  assert.equal(result.clusters.find((cluster) => cluster.id.includes("alphaaaaa"))?.persistent, true);
  assert.equal(result.clusters.find((cluster) => cluster.id.includes("bravobbbb"))?.persistent, false);
});

test("ignores timeline entries with no matching geography cluster", () => {
  const observations = [alpha(1, "2025-01-01T10:00:00Z"), alpha(2, "2025-02-01T10:00:00Z")];
  const geography = geographyFor(observations, [[1, "16"], [2, "17"]]);
  const timeline = timelineFor(observations);
  timeline.clusterTimelines.push({
    ...(timeline.clusterTimelines[0] as NonNullable<typeof timeline.clusterTimelines[0]>),
    id: "infra:absent.onion",
  });
  const result = buildInfrastructurePersistence(geography, timeline);
  assert.equal(result.clusterCount, 1);
  assert.equal(result.persistentClusters, 1);
});

test("publishes aggregates only, with no victim identifiers", () => {
  const observations = [alpha(1, "2025-01-01T10:00:00Z"), alpha(2, "2025-02-01T10:00:00Z")];
  const result = buildInfrastructurePersistence(
    geographyFor(observations, [[1, "16"], [2, "17"]]),
    timelineFor(observations),
  );
  assert.deepEqual(Object.keys(result.clusters[0] as object).sort(), [
    "crossDepartment", "dated", "departments", "id", "persistent", "reuseDays",
  ]);
  assert.equal(JSON.stringify(result).includes('"victims"'), false);
});
