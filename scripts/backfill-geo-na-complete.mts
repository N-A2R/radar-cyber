#!/usr/bin/env -S npx tsx
/**
 * Final-mile geocoding of Nouvelle-Aquitaine organisations.
 *
 *   DATABASE_URL=... tsx scripts/backfill-geo-na-complete.mts --dry-run
 *   DATABASE_URL=... tsx scripts/backfill-geo-na-complete.mts --limit=20000
 *
 * Uses only the versioned local reference and complement files: no network,
 * no paid service, no personal data. Existing valid coordinates are untouched.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import {
  backfillRemainingGeo,
  buildGeoLookup,
  type GeoComplementEntry,
  type ReferenceCommune,
} from "../apps/api/src/geo/complete.js";

const log = (msg: string): void => console.log(`[geo-complete] ${msg}`);

function usage(): never {
  console.error("usage: backfill-geo-na-complete.mts [--dry-run] [--limit=<positive integer>]");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
let limit: number | undefined;
if (limitArg) {
  limit = Number(limitArg.slice("--limit=".length));
  if (!Number.isInteger(limit) || limit <= 0) usage();
}
if (args.some((arg) => arg !== "--dry-run" && !arg.startsWith("--limit="))) usage();

const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8")) as T;

const reference = readJson<{ communes: ReferenceCommune[] }>("db/data/referentiel-na.json");
const complementFile = readJson<{ entrees?: GeoComplementEntry[] }>("db/data/referentiel-complement-geo-na.json");
const lookup = buildGeoLookup(reference.communes, complementFile.entrees ?? []);

try {
  const summary = await backfillRemainingGeo(log, { lookup, limit, dryRun });
  log(`summary: ${summary.updated} written, ${summary.resolved}/${summary.candidateOrgs} resolved`);
} finally {
  await closePools();
}
