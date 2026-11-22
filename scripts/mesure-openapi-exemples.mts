/**
 * Reproducible measurement of the executable OpenAPI documentation.
 * No network, no database: examples are replayed through Fastify locally.
 *
 *   pnpm mesure:openapi-exemples
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildApp } from "../apps/api/src/app.js";
import { OPERATIONS } from "../apps/api/src/openapi/catalog.js";
import { BASELINE } from "../apps/api/src/openapi/examples.js";
import { replayAll, type ReplayResult } from "../apps/api/src/openapi/replay.js";
import { buildOpenApi, documentedRouteCount, executableExampleCount } from "../apps/api/src/openapi/spec.js";

const output =
  process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length) ??
  "bench/results/openapi-exemples.json";

const application = await buildApp();
await application.ready();
let results: ReplayResult[];
try {
  results = await replayAll({ application });
} finally {
  await application.close();
}

const spec = buildOpenApi();
const publishedState = readFileSync(new URL(`../${BASELINE.provenance}`, import.meta.url), "utf8");
const baselineMatches =
  publishedState.includes("1 673 151 organisations") &&
  publishedState.includes("312 sources") &&
  publishedState.includes("26 719 événements");

const passed = results.filter((result) => result.ok).length;
const executable = executableExampleCount(spec);
const verdict = passed === OPERATIONS.length && executable === OPERATIONS.length && baselineMatches
  ? "executable"
  : "not executable";

const report = {
  objective: "executable documentation",
  command: "pnpm mesure:openapi-exemples",
  baseline: { ...BASELINE, matchesPublishedState: baselineMatches },
  operations: OPERATIONS.length,
  documentedOperations: documentedRouteCount(spec),
  operationsWithExecutableExample: executable,
  replayed: results.length,
  passed,
  failed: results.length - passed,
  failures: results.filter((result) => !result.ok),
  verdict,
};

writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
const format = (value: number) => value.toLocaleString("en-US");
console.log(
  `${report.verdict}: ${passed}/${report.operations} examples replayed, ${report.failed} invalid ` +
  `(${format(BASELINE.sources)} sources, ${format(BASELINE.organisations)} organisations, ` +
  `${format(BASELINE.evenements)} events)`,
);
