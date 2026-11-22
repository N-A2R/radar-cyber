import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSharedInfrastructure,
  type InfrastructureObservation,
} from "../src/analyse/shared-infrastructure.js";
import {
  buildInfrastructureGeography,
  type InfrastructureGeography,
} from "../src/analyse/shared-infrastructure-geography.js";

const observation = (orgId: number, value: string): InfrastructureObservation => ({
  orgId,
  kind: "leak_site",
  value,
});

const geographyFor = (
  observations: readonly InfrastructureObservation[],
  departments: ReadonlyArray<readonly [number, string]>,
): InfrastructureGeography =>
  buildInfrastructureGeography(
    detectSharedInfrastructure(observations),
    new Map(departments),
  );

test("counts a cluster as cross-department when victims span two codes", () => {
  const result = geographyFor(
    [observation(1, "http://alphaaaaa.onion/a"), observation(2, "http://alphaaaaa.onion/b")],
    [[1, "16"], [2, "17"]],
  );
  assert.equal(result.crossDepartmentClusters, 1);
  assert.deepEqual(result.clusterGeographies[0]?.departments, ["16", "17"]);
});

test("does not count a cluster confined to one department", () => {
  const result = geographyFor(
    [observation(1, "http://bravobbbb.onion/a"), observation(2, "http://bravobbbb.onion/b")],
    [[1, "33"], [2, "33"]],
  );
  assert.equal(result.crossDepartmentClusters, 0);
  assert.equal(result.clusterGeographies[0]?.crossDepartment, false);
});

test("ignores clustered victims absent from the department lookup", () => {
  const result = geographyFor(
    [observation(1, "http://charliccc.onion/a"), observation(2, "http://charliccc.onion/b")],
    [[1, "23"]],
  );
  assert.deepEqual(result.clusterGeographies[0]?.departments, ["23"]);
  assert.equal(result.crossDepartmentClusters, 0);
});

test("deduplicates a department observed for several victims", () => {
  const result = geographyFor(
    [
      observation(1, "http://deltaaaaa.onion/a"),
      observation(2, "http://deltaaaaa.onion/b"),
      observation(3, "http://deltaaaaa.onion/c"),
    ],
    [[1, "33"], [2, "33"], [3, "17"]],
  );
  assert.deepEqual(result.clusterGeographies[0]?.departments, ["17", "33"]);
  assert.equal(result.clusterGeographies[0]?.crossDepartment, true);
});

test("counts distinct departments covered across all clusters", () => {
  const result = geographyFor(
    [
      observation(1, "http://alphaaaaa.onion/a"),
      observation(2, "http://alphaaaaa.onion/b"),
      observation(3, "http://bravobbbb.onion/a"),
      observation(4, "http://bravobbbb.onion/b"),
    ],
    [[1, "16"], [2, "17"], [3, "17"], [4, "19"]],
  );
  assert.equal(result.clusterCount, 2);
  assert.equal(result.departmentsCovered, 3);
});

test("does not depend on observation or lookup order", () => {
  const observations = [
    observation(1, "http://alphaaaaa.onion/a"),
    observation(2, "http://alphaaaaa.onion/b"),
    observation(3, "http://bravobbbb.onion/a"),
    observation(4, "http://bravobbbb.onion/b"),
  ];
  const departments: ReadonlyArray<readonly [number, string]> = [
    [1, "17"], [2, "16"], [3, "19"], [4, "17"],
  ];
  assert.deepEqual(
    geographyFor(observations, departments),
    geographyFor([...observations].reverse(), [...departments].reverse()),
  );
});
