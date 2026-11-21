/**
 * Reproducible measurement of leaks attached to a Nouvelle-Aquitaine
 * organization by registrable domain.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:leaks-by-domain
 *   DATABASE_URL=... pnpm measure:leaks-by-domain --json=bench/results/leaks-by-domain.json
 *
 * Every published counter comes from measureLeaksByDomain(); the SQL behind it
 * is exported next to the result. No victim data is read or written: the JSON
 * contains aggregate counters, organization ids and domain roots only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import { SQL, measureLeaksByDomain } from "../apps/api/src/leaks/measure.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/leaks-by-domain-${new Date().toISOString().slice(0, 10)}.json`;

try {
  const measurement = await measureLeaksByDomain();
  const result = {
    command: "pnpm measure:leaks-by-domain",
    scope: measurement.scope,
    basis: measurement.basis,
    count: measurement.count,
    claimsRead: measurement.claimsRead,
    domainOrganizationsRead: measurement.domainOrganizationsRead,
    matchedOrganizations: measurement.matchedOrganizations,
    baseline: measurement.baseline,
    attachments: measurement.attachments,
    sql: SQL,
    measuredAt: measurement.measuredAt,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `NA leaks attached by domain: ${measurement.count} ` +
      `(claims=${measurement.claimsRead}, domain orgs=${measurement.domainOrganizationsRead}, ` +
      `orgs=${measurement.baseline.organizations}, sources=${measurement.baseline.sources}, ` +
      `events=${measurement.baseline.events}) -> ${output}`,
  );
} finally {
  await closePools();
}
