#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the verified lat/lon rate.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-geo.mts
 *
 * With `--out=bench/results/geo-verified.json` the same numbers are written
 * as JSON. The script is read-only apart from that optional local file.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { NA_BOUNDS } from "../apps/api/src/geo/commune-index.js";

const args = process.argv.slice(2);
const outArg = args.find((arg) => arg.startsWith("--out="));
const outPath = outArg
  ? fileURLToPath(new URL(`../${outArg.slice("--out=".length)}`, import.meta.url))
  : null;

interface GeoRow {
  total: number;
  present: number;
  verified: number;
  sourced: number;
  events: number;
  events_geo: number;
}

async function main(): Promise<void> {
  const { rows } = await query<GeoRow>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL)::int AS present,
            count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL
                               AND lat BETWEEN $1 AND $2
                               AND lon BETWEEN $3 AND $4)::int AS verified,
            count(*) FILTER (WHERE geo_source IS NOT NULL)::int AS sourced,
            (SELECT count(*)::int FROM event) AS events,
            (SELECT count(*)::int FROM event WHERE lat IS NOT NULL AND lon IS NOT NULL) AS events_geo
       FROM org`,
    [NA_BOUNDS.minLat, NA_BOUNDS.maxLat, NA_BOUNDS.minLon, NA_BOUNDS.maxLon],
  );
  const row = rows[0];
  if (!row) throw new Error("geo measurement returned no row");

  const result = {
    measuredAt: new Date().toISOString(),
    definition:
      "share of org rows with non-null lat/lon inside the Nouvelle-Aquitaine bounding box",
    bounds: NA_BOUNDS,
    totalOrgs: row.total,
    coordsOrgs: row.present,
    verifiedOrgs: row.verified,
    verifiedRatePct: Math.round((1000 * row.verified) / row.total) / 10,
    orgsWithGeoSource: row.sourced,
    events: row.events,
    eventsWithCoords: row.events_geo,
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
