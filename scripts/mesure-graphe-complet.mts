/**
 * Reproducible measurement of the complete Nouvelle-Aquitaine graph.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm mesure:graphe
 *   DATABASE_URL=... pnpm mesure:graphe --json=bench/results/graphe-complet.json
 *
 * Only aggregate counters are written; the graph exposes opaque node ids and
 * never reads victim names, event titles or organisation labels.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { measureCompleteGraph } from "../apps/api/src/graph/complet-measure.js";
import { closePools } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/graphe-complet-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureCompleteGraph();
  const result = {
    command: "pnpm mesure:graphe",
    scope: "Nouvelle-Aquitaine",
    edgeTypes: Object.keys(measurement.byType).length,
    edges: measurement.edges,
    byType: measurement.byType,
    sql: measurement.sql,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `Complete NA graph: ${measurement.edges} edges across ` +
      `${Object.keys(measurement.byType).length} types -> ${output}`,
  );
} finally {
  await closePools();
}
