#!/usr/bin/env -S npx tsx
/**
 * Extract Nouvelle-Aquitaine leak-site victims and archive one claim capture
 * for each of them. Uses the real referential (1.67 M organizations) and the
 * public RansomLook / ransomwatch claim feeds. No paid service is involved.
 *
 *   pnpm leak-proofs:archive
 *   pnpm leak-proofs:archive --max-sites=80 --years=2025,2026
 *
 * Run time is bounded by the 12 s per-feed HTTP timeout and stays below 60 s.
 */
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
// Static imports are hoisted: db.ts would read the default URL before the
// assignment above. Load application modules only after setting DATABASE_URL.
const { harvest } = await import("../apps/api/src/collectors/leak-sites.js");
const { closePools, ingestQuery } = await import("../apps/api/src/db.js");
const { captureVictimProofs } = await import("../apps/api/src/leak-victim-proofs.js");

const argv = process.argv.slice(2);
const option = (name: string): string | undefined =>
  argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const years = option("years")?.split(",").map(Number).filter((year) => Number.isInteger(year) && year > 2000);
const dir = option("dir") ?? "bench/leak-victim-proofs";
const manifestPath = option("manifest") ?? "bench/results/leak-victim-proofs.json";

try {
  const harvestReport = await harvest({
    maxSites: Number(option("max-sites") ?? 80),
    ...(years && years.length > 0 ? { years } : {}),
  });
  const capture = await captureVictimProofs({ claims: harvestReport.claims, dir });
  const baseline = await ingestQuery<{ organizations: number; sources: number; events: number }>(
    `SELECT (SELECT count(*)::int FROM org) AS organizations,
            (SELECT count(*)::int FROM source) AS sources,
            (SELECT count(*)::int FROM event) AS events`,
  );
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify({
    ...capture,
    basis: baseline.rows[0],
    harvest: harvestReport.stats,
    command: "pnpm leak-proofs:archive",
  }, null, 2)}\n`);
  console.log(`NA claims extracted: ${harvestReport.stats.claimsNa}`);
  console.log(`NA leak victims with archived claim capture: ${capture.stats.archived}`);
  console.log(`Feeds used: ${capture.feeds.filter((feed) => feed.claims > 0).length}`);
  console.log(`Skipped: ${capture.stats.skipped}`);
  console.log(`Manifest: ${manifestPath}`);
} finally {
  await closePools();
}
