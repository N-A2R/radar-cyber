/**
 * Reproducible measurement of how long infrastructure shared by victims in
 * Nouvelle-Aquitaine kept linking them over time.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:shared-infrastructure-timeline
 *   DATABASE_URL=... pnpm measure:shared-infrastructure-timeline \
 *     --json=bench/results/shared-infrastructure-timeline.json
 *
 * The output contains organization ids, infrastructure hosts and observation
 * dates only. No victim name, no network call, no paid source.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import {
  measureSharedInfrastructureTimeline,
  SQL,
} from "../apps/api/src/analyse/shared-infrastructure-store.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/shared-infrastructure-timeline-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureSharedInfrastructureTimeline();
  const result = {
    command: "pnpm measure:shared-infrastructure-timeline",
    scope: measurement.scope,
    objective: {
      target: 2,
      comparator: ">=",
      achieved: measurement.datedClusters,
      unit: "clusters datés",
    },
    clusterCount: measurement.clusterCount,
    datedClusters: measurement.datedClusters,
    medianReuseDays: measurement.medianReuseDays,
    longestReuseDays: measurement.longestReuseDays,
    observationsWithDates: measurement.observationsWithDates,
    clusterTimelines: measurement.clusterTimelines,
    baseline: measurement.baseline,
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA shared infrastructure timeline: ${measurement.datedClusters}/${measurement.clusterCount} ` +
      `clusters dated (median=${measurement.medianReuseDays ?? 0}d, ` +
      `longest=${measurement.longestReuseDays}d, observations=${measurement.observationsWithDates}, ` +
      `orgs=${measurement.baseline.organizations}) -> ${output}`,
  );
} finally {
  await closePools();
}
