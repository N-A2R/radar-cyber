/**
 * Reproducible measurement of the two published counters:
 *   - technical sources (CVE, PoC, NVD, Exploit-DB, GitHub) integrated for NA;
 *   - claims attached to a Nouvelle-Aquitaine organization.
 *
 * Every number comes from measureTechnicalCoverage() on the live database.
 * The JSON artifact contains aggregates and source ids only: no victim data.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-technical-coverage.mts \
 *     --json=bench/results/technical-coverage-2026-11-21.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { measureTechnicalCoverage, SQL } from "../apps/api/src/technical/measure.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const output = argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `${ROOT}bench/results/technical-coverage-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureTechnicalCoverage();
  const report = {
    command: "tsx scripts/measure-technical-coverage.mts",
    scope: measurement.scope,
    sourceCount: measurement.sourceCount,
    sourcesByKind: measurement.sourcesByKind,
    claimsAttachedToNaOrg: measurement.claimsAttachedToNaOrg,
    organizationsWithClaim: measurement.organizationsWithClaim,
    claimsFromThisCorpus: measurement.claimsFromThisCorpus,
    sql: SQL,
    sources: measurement.sources,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Technical sources integrated: ${measurement.sourceCount} ` +
      `(${Object.entries(measurement.sourcesByKind).map(([kind, count]) => `${kind}=${count}`).join(", ")}); ` +
      `claims attached to an NA organization: ${measurement.claimsAttachedToNaOrg} ` +
      `(organizations=${measurement.organizationsWithClaim}, from corpus=${measurement.claimsFromThisCorpus}) -> ${output}`,
  );
} finally {
  await closePools();
}
