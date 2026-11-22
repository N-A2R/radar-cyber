/**
 * Reproducible measurement of shared infrastructure that is both geographic
 * (several NA departments) and temporal (several distinct UTC days).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:shared-infrastructure-persistence
 *   DATABASE_URL=... pnpm measure:shared-infrastructure-persistence \
 *     --json=bench/results/shared-infrastructure-persistence.json
 *
 * The output contains organization ids, department codes and infrastructure
 * hosts only. No victim name, no network call, no paid source.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import {
  measureSharedInfrastructurePersistence,
  SQL,
} from "../apps/api/src/analyse/shared-infrastructure-store.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/shared-infrastructure-persistence-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureSharedInfrastructurePersistence();
  const result = {
    command: "pnpm measure:shared-infrastructure-persistence",
    scope: measurement.scope,
    objective: {
      target: 2,
      comparator: ">=",
      achieved: measurement.persistentClusters,
      unit: "clusters inter-départementaux datés",
    },
    clusterCount: measurement.clusterCount,
    persistentClusters: measurement.persistentClusters,
    crossDepartmentClusters: measurement.clusterCount,
    departmentsCovered: measurement.departmentsCovered,
    datedClusters: measurement.datedClusters,
    clusterPersistences: measurement.clusterPersistences,
    baseline: measurement.baseline,
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA shared infrastructure persistence: ${measurement.persistentClusters}/${measurement.clusterCount} ` +
      `clusters cross departments and days (dated=${measurement.datedClusters}, ` +
      `departments=${measurement.departmentsCovered}, orgs=${measurement.baseline.organizations}) -> ${output}`,
  );
} finally {
  await closePools();
}
