#!/usr/bin/env -S npx tsx
/**
 * Backfills missing Nouvelle-Aquitaine organisation coordinates offline.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/backfill-geo-na.mts --dry-run
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/backfill-geo-na.mts --limit=1000
 *
 * The default run processes every remaining organisation in bounded batches.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { backfillOrgGeo } from "../apps/api/src/geo/backfill.js";
import type { CommuneRecord } from "../apps/api/src/geo/commune-index.js";

const log = (msg: string): void => console.log(`[geo-backfill] ${msg}`);

function usage(): never {
  console.error("usage: backfill-geo-na.mts [--dry-run] [--limit=<positive integer>]");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();
const dryRun = args.includes("--dry-run");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
let limit: number | undefined;
if (limitArg) {
  limit = Number(limitArg.slice("--limit=".length));
  if (!Number.isInteger(limit) || limit <= 0) usage();
}
const unknown = args.filter((arg) => !arg.startsWith("--limit=") && arg !== "--dry-run");
if (unknown.length > 0) usage();

const referencePath = fileURLToPath(new URL("../db/data/referentiel-na.json", import.meta.url));
const reference = JSON.parse(readFileSync(referencePath, "utf8")) as { communes?: CommuneRecord[] };
if (!Array.isArray(reference.communes)) throw new Error("invalid commune reference file");

try {
  const summary = await backfillOrgGeo(log, { communes: reference.communes, limit, dryRun });
  log(
    `summary: ${summary.updated} written, ${summary.pairsMatched} city-department pairs matched, ` +
      `${summary.unresolvedOrgs} organisations without a commune match`,
  );
} finally {
  await closePools();
}
