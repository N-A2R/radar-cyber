import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSharedInfrastructure,
  type InfrastructureObservation,
} from "../src/analyse/shared-infrastructure.js";
import {
  buildInfrastructureTimeline,
  type DatedInfrastructureObservation,
} from "../src/analyse/shared-infrastructure-timeline.js";

const observation = (
  orgId: number,
  value: string,
  observedAt: string | null,
): DatedInfrastructureObservation => ({
  orgId,
  kind: "leak_site",
  value,
  observedAt,
});

const timelineFor = (observations: readonly DatedInfrastructureObservation[]) =>
  buildInfrastructureTimeline(detectSharedInfrastructure(observations), observations);

test("dates a cluster from the first and last observation of its anchor", () => {
  const result = timelineFor([
    observation(1, "http://alphaaaaa.onion/post/1", "2025-01-01T10:00:00Z"),
    observation(2, "http://alphaaaaa.onion/post/2", "2025-02-01T10:00:00Z"),
  ]);
  assert.equal(result.datedClusters, 1);
  assert.equal(result.clusterTimelines[0]?.reuseDays, 31);
  assert.equal(result.clusterTimelines[0]?.firstSeen, "2025-01-01T10:00:00.000Z");
  assert.equal(result.clusterTimelines[0]?.lastSeen, "2025-02-01T10:00:00.000Z");
});

test("ignores observations with no usable date", () => {
  const result = timelineFor([
    observation(1, "http://bravobbbb.onion/post/1", null),
    observation(2, "http://bravobbbb.onion/post/2", "not-a-date"),
  ]);
  assert.equal(result.clusterTimelines[0]?.datedObservations, 0);
  assert.equal(result.clusterTimelines[0]?.dated, false);
  assert.equal(result.clusterTimelines[0]?.firstSeen, null);
  assert.equal(result.clusterTimelines[0]?.reuseDays, 0);
});

test("does not date a cluster observed on a single UTC day", () => {
  const result = timelineFor([
    observation(1, "http://charliccc.onion/post/1", "2025-03-10T08:00:00Z"),
    observation(2, "http://charliccc.onion/post/2", "2025-03-10T22:00:00Z"),
  ]);
  assert.equal(result.clusterTimelines[0]?.dated, false);
  assert.equal(result.clusterTimelines[0]?.reuseDays, 0);
});

test("ignores observations outside the detected cluster and its anchors", () => {
  const clusterObservations = [
    observation(1, "http://deltaaaaa.onion/post/1", "2025-01-01T10:00:00Z"),
    observation(2, "http://deltaaaaa.onion/post/2", "2025-01-11T10:00:00Z"),
  ];
  const detection = detectSharedInfrastructure(clusterObservations);
  const result = buildInfrastructureTimeline(detection, [
    ...clusterObservations,
    observation(99, "http://deltaaaaa.onion/post/99", "2030-01-01T10:00:00Z"),
    observation(1, "http://epsilonbb.onion/post/1", "2031-01-01T10:00:00Z"),
  ]);
  assert.equal(result.clusterTimelines[0]?.reuseDays, 10);
});

test("computes the median reuse delay across dated clusters", () => {
  const result = timelineFor([
    observation(1, "http://alphaaaaa.onion/post/1", "2025-01-01T00:00:00Z"),
    observation(2, "http://alphaaaaa.onion/post/2", "2025-01-11T00:00:00Z"),
    observation(3, "http://bravobbbb.onion/post/1", "2025-01-01T00:00:00Z"),
    observation(4, "http://bravobbbb.onion/post/2", "2025-01-21T00:00:00Z"),
    observation(5, "http://charliccc.onion/post/1", "2025-01-01T00:00:00Z"),
    observation(6, "http://charliccc.onion/post/2", "2025-04-11T00:00:00Z"),
  ]);
  assert.equal(result.datedClusters, 3);
  assert.equal(result.medianReuseDays, 20);
  assert.equal(result.longestReuseDays, 100);
});

test("does not depend on observation order", () => {
  const observations = [
    observation(1, "http://alphaaaaa.onion/post/1", "2025-01-01T00:00:00Z"),
    observation(2, "http://alphaaaaa.onion/post/2", "2025-01-11T00:00:00Z"),
    observation(3, "http://bravobbbb.onion/post/1", "2025-01-01T00:00:00Z"),
    observation(4, "http://bravobbbb.onion/post/2", "2025-01-21T00:00:00Z"),
  ];
  assert.deepEqual(timelineFor(observations), timelineFor([...observations].reverse()));
});
