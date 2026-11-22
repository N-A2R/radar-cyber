#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of bitemporal coverage in Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-bitemporal-coverage.mts
 *
 * Coverage = share of scoped rows (organisations, aliases) with at least one
 * version in the corresponding history table, plus the structural check that
 * both write paths are guarded by the migration triggers. Read-only except for
 * the optional --out JSON file. No network, no personal data.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { naDepartmentsIn } from "../apps/api/src/geo/na-departments.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const args = process.argv.slice(2);
const check = args.includes("--check");
const outArg = args.find((arg) => arg.startsWith("--out="));
const outPath = outArg ? fileURLToPath(new URL(`../${outArg.slice("--out=".length)}`, import.meta.url)) : null;

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const client = new Client({ connectionString: url, statement_timeout: 55_000, application_name: "radar-bitemporal-measure" });
const pct = (covered: number, total: number): number =>
  total === 0 ? 0 : Math.round((10000 * covered) / total) / 100;

try {
  await client.connect();
  const { rows: found } = await client.query<{ dept: string }>("SELECT DISTINCT dept FROM org WHERE dept IS NOT NULL");
  const depts = naDepartmentsIn(found.map((row) => row.dept));
  if (depts.length === 0) throw new Error("no Nouvelle-Aquitaine department found");

  const { rows: orgRows } = await client.query<{
    total: number; covered: number; open: number; invalid: number; versions: number;
  }>(
    `WITH scoped AS (SELECT id FROM org WHERE dept = ANY($1::text[]))
     SELECT (SELECT count(*)::int FROM scoped) AS total,
            (SELECT count(DISTINCT h.org_id)::int FROM org_history h JOIN scoped s ON s.id = h.org_id) AS covered,
            (SELECT count(DISTINCT h.org_id)::int FROM org_history h JOIN scoped s ON s.id = h.org_id
              WHERE h.superseded_at IS NULL) AS open,
            (SELECT count(*)::int FROM org_history h JOIN scoped s ON s.id = h.org_id
              WHERE h.valid_from IS NULL OR h.recorded_at IS NULL) AS invalid,
            (SELECT count(*)::int FROM org_history) AS versions`,
    [depts],
  );
  const { rows: aliasRows } = await client.query<{
    total: number; covered: number; open: number; versions: number;
  }>(
    `WITH scoped AS (SELECT a.id FROM org_alias a JOIN org o ON o.id = a.org_id WHERE o.dept = ANY($1::text[]))
     SELECT (SELECT count(*)::int FROM scoped) AS total,
            (SELECT count(DISTINCT h.org_alias_id)::int FROM org_alias_history h JOIN scoped s ON s.id = h.org_alias_id) AS covered,
            (SELECT count(DISTINCT h.org_alias_id)::int FROM org_alias_history h JOIN scoped s ON s.id = h.org_alias_id
              WHERE h.superseded_at IS NULL) AS open,
            (SELECT count(*)::int FROM org_alias_history) AS versions`,
    [depts],
  );
  const { rows: triggerRows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid IN ('org'::regclass, 'org_alias'::regclass)
        AND tgname IN ('radar_org_bitemporal_sync', 'radar_alias_bitemporal_sync')`,
  );

  const o = orgRows[0]!;
  const a = aliasRows[0]!;
  const result = {
    scope: "Nouvelle-Aquitaine (12 departments)",
    departments: depts,
    organisations: {
      total: o.total, withVersion: o.covered, withOpenVersion: o.open,
      coveragePct: pct(o.covered, o.total),
    },
    aliases: {
      total: a.total, withVersion: a.covered, withOpenVersion: a.open,
      coveragePct: pct(a.covered, a.total),
    },
    historyVersions: { organisations: o.versions, aliases: a.versions },
    versionsWithoutBothClocks: o.invalid,
    guardedWritePaths: triggerRows[0]!.n,
    complete: o.total > 0 && o.covered === o.total && o.open === o.total && o.invalid === 0 &&
      a.total > 0 && a.covered === a.total && a.open === a.total && triggerRows[0]!.n === 2,
  };
  console.log(JSON.stringify(result, null, 2));
  console.log(`coverage: ${result.organisations.coveragePct}% (${o.covered}/${o.total} organisations NA), ` +
    `aliases ${result.aliases.coveragePct}% (${a.covered}/${a.total})`);
  if (outPath) writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  if (check && !result.complete) process.exitCode = 1;
} finally {
  await client.end();
}
