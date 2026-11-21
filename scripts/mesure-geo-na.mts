#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the verified lat/lon rate in Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-geo-na.mts \
 *     --out=bench/results/geo-verified-na.json
 *
 * The denominator is restricted to Nouvelle-Aquitaine organisations: an org
 * whose department is Paris or Toulouse is out of scope, not a missing
 * coordinate. Both INSEE codes and French department labels are accepted.
 * The script is read-only apart from the optional local JSON output.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { NA_BOUNDS } from "../apps/api/src/geo/commune-index.js";
import { naDepartmentsIn } from "../apps/api/src/geo/na-departments.js";
/** Regional intercommunalities carry a weighted centroid but no department code. */
const NULL_DEPT_SOURCE = "centroide-pondere-membres";

const args = process.argv.slice(2);
const outArg = args.find((arg) => arg.startsWith("--out="));
const outPath = outArg
  ? fileURLToPath(new URL(`../${outArg.slice("--out=".length)}`, import.meta.url))
  : null;

interface CountRow {
  total: number;
  present: number;
  verified: number;
  sourced: number;
}

async function counts(depts: readonly string[]): Promise<CountRow> {
  const { rows } = await query<CountRow>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL)::int AS present,
            count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL
                               AND lat BETWEEN $2 AND $3
                               AND lon BETWEEN $4 AND $5)::int AS verified,
            count(*) FILTER (WHERE geo_source IS NOT NULL)::int AS sourced
       FROM org
      WHERE dept = ANY($1::text[])
         OR (dept IS NULL AND geo_source = $6)`,
    [depts, NA_BOUNDS.minLat, NA_BOUNDS.maxLat, NA_BOUNDS.minLon, NA_BOUNDS.maxLon, NULL_DEPT_SOURCE],
  );
  const row = rows[0];
  if (!row) throw new Error("geo measurement returned no row");
  return row;
}

async function main(): Promise<void> {
  const { rows } = await query<{ dept: string }>(
    `SELECT DISTINCT dept FROM org WHERE dept IS NOT NULL`,
  );
  const naDepts = naDepartmentsIn(rows.map((row) => row.dept));
  if (naDepts.length === 0) throw new Error("no Nouvelle-Aquitaine department found");

  const na = await counts(naDepts);
  const { rows: totals } = await query<{ total: number }>(`SELECT count(*)::int AS total FROM org`);
  const totalOrgs = totals[0]?.total ?? 0;

  const result = {
    measuredAt: new Date().toISOString(),
    definition:
      "share of Nouvelle-Aquitaine orgs with non-null lat/lon inside the regional bounding box",
    bounds: NA_BOUNDS,
    departmentValuesInScope: naDepts.sort(),
    nullDeptScopeSource: NULL_DEPT_SOURCE,
    totalNaOrgs: na.total,
    coordsNaOrgs: na.present,
    verifiedNaOrgs: na.verified,
    verifiedRatePct: na.total === 0 ? 0 : Math.round((10000 * na.verified) / na.total) / 100,
    orgsWithGeoSource: na.sourced,
    totalOrgs,
    outsideScopeOrgs: totalOrgs - na.total,
  };

  console.log(JSON.stringify(result, null, 2));
  if (outPath) {
    writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`written: ${outPath}`);
  }
}

try {
  await main();
} finally {
  await closePools();
}
