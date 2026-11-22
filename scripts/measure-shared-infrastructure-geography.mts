/**
 * Reproducible measurement of the geographic spread of infrastructure shared
 * by victims in Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:shared-infrastructure-geography
 *   DATABASE_URL=... pnpm measure:shared-infrastructure-geography \
 *     --json=bench/results/shared-infrastructure-geography.json
 *
 * The output contains organization ids, department codes and infrastructure
 * hosts only. No victim name, no network call, no paid source.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import {
  measureSharedInfrastructureGeography,
  SQL,
} from "../apps/api/src/analyse/shared-infrastructure-store.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/shared-infrastructure-geography-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureSharedInfrastructureGeography();
  const result = {
    command: "pnpm measure:shared-infrastructure-geography",
    scope: measurement.scope,
    objective: {
      target: 3,
      comparator: ">=",
      achieved: measurement.crossDepartmentClusters,
      unit: "clusters inter-départementaux",
    },
    clusterCount: measurement.clusterCount,
    crossDepartmentClusters: measurement.crossDepartmentClusters,
    departmentsCovered: measurement.departmentsCovered,
    clusterGeographies: measurement.clusterGeographies,
    baseline: measurement.baseline,
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA shared infrastructure geography: ${measurement.crossDepartmentClusters}/${measurement.clusterCount} ` +
      `clusters cross departments (departments=${measurement.departmentsCovered}, ` +
      `orgs=${measurement.baseline.organizations}) -> ${output}`,
  );
} finally {
  await closePools();
}
