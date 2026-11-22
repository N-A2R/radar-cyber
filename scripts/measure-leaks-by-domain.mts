/**
 * Reproducible measurement of leaks attached to a Nouvelle-Aquitaine
 * organization by registrable domain.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm measure:leaks-by-domain
 *   DATABASE_URL=... pnpm measure:leaks-by-domain --json=out.json --compare=previous.json
 *
 * Every published counter comes from measureLeaksByDomain(); the SQL behind it
 * is exported next to the result. No victim data is read or written: the JSON
 * contains aggregate counters, organization ids and domain roots only.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import type { DomainAttachment } from "../apps/api/src/leaks/by-domain.js";
import { diffLeakAttachments } from "../apps/api/src/leaks/delta.js";
import { SQL, measureLeaksByDomain } from "../apps/api/src/leaks/measure.js";

const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/leaks-by-domain-${new Date().toISOString().slice(0, 10)}.json`;

function isAttachment(value: unknown): value is DomainAttachment {
  return typeof value === "object" && value !== null &&
    "claimId" in value && typeof value.claimId === "string" &&
    "orgId" in value && typeof value.orgId === "number" &&
    "domain" in value && typeof value.domain === "string" &&
    "source" in value && typeof value.source === "string";
}

/** Validates the published snapshot before using it as a comparison baseline. */
function publishedAttachments(raw: string): DomainAttachment[] {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null ||
      !("attachments" in value) || !Array.isArray(value.attachments) ||
      !value.attachments.every(isAttachment)) {
    throw new Error("invalid published measurement in --compare file");
  }
  return value.attachments;
}

const compare =
  argv.find((a) => a.startsWith("--compare="))?.slice("--compare=".length) ?? null;

try {
  const measurement = await measureLeaksByDomain();
  const previous = compare === null ? null : publishedAttachments(readFileSync(compare, "utf8"));
  const delta = previous === null ? null : diffLeakAttachments(previous, measurement.attachments);
  const result = {
    command: "pnpm measure:leaks-by-domain",
    scope: measurement.scope,
    basis: measurement.basis,
    count: measurement.count,
    claimsRead: measurement.claimsRead,
    domainOrganizationsRead: measurement.domainOrganizationsRead,
    matchedOrganizations: measurement.matchedOrganizations,
    summary: measurement.summary,
    baseline: measurement.baseline,
    attachments: measurement.attachments,
    ...(delta === null ? {} : { delta }),
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
  console.log(
    `By department: ${JSON.stringify(measurement.summary.byDepartment)} ` +
      `by source: ${JSON.stringify(measurement.summary.bySource)}`,
  );
  if (delta !== null) {
    console.log(
      `Change since ${compare}: added=${delta.added.length} removed=${delta.removed.length} ` +
        `(count now ${measurement.count})`,
    );
  }
} finally {
  await closePools();
}
