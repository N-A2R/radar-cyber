/**
 * Reproducible measurement of infrastructure shared between victims in
 * Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:shared-infrastructure
 *   DATABASE_URL=... pnpm measure:shared-infrastructure --json=bench/results/shared-infrastructure.json
 *
 * No victim data is read or written: the output contains organization ids and
 * infrastructure hosts only. No network call, no paid service.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import { measureSharedInfrastructure, SQL } from "../apps/api/src/analyse/shared-infrastructure-store.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/shared-infrastructure-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureSharedInfrastructure();
  const result = {
    command: "pnpm measure:shared-infrastructure",
    scope: measurement.scope,
    objective: { target: 1, comparator: ">=", achieved: measurement.clusterCount, unit: "clusters" },
    clusterCount: measurement.clusterCount,
    victimOrganizations: measurement.victimOrganizations,
    victimsInClusters: measurement.victimsInClusters,
    sharedAnchors: measurement.sharedAnchors,
    normalizedObservations: measurement.normalizedObservations,
    baseline: measurement.baseline,
    clusters: measurement.clusters,
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA shared infrastructure clusters: ${measurement.clusterCount} ` +
      `(victims=${measurement.victimOrganizations}, clustered=${measurement.victimsInClusters}, ` +
      `anchors=${measurement.sharedAnchors}, observations=${measurement.normalizedObservations}, ` +
      `orgs=${measurement.baseline.organizations}, sources=${measurement.baseline.sources}, ` +
      `events=${measurement.baseline.events}) -> ${output}`,
  );
} finally {
  await closePools();
}
