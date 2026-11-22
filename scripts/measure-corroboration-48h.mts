/**
 * Reproducible measurement of the 48 h publication verdict for NA incidents.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-corroboration-48h.mts \
 *     --json=bench/results/corroboration-48h-2026-11-22.json
 *
 * Read-only: the database is never modified and the report contains only
 * truncated SHA-256 victim hashes, timestamps and publisher counts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query } = await import("../apps/api/src/db.js");
const {
  corroborateNAIncidents,
  loadCorroborationEvents,
} = await import("../apps/api/src/analyse/incident-corroboration.js");
const {
  PUBLICATION_DELAY_MS,
  publicationVerdicts,
} = await import("../apps/api/src/analyse/incident-corroboration-48h.js");

const JSON_PATH = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  ?? "bench/results/corroboration-48h-2026-11-22.json";
const BASELINE_PATH = "bench/results/incident-corroboration-2026-11-22.json";

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const report = corroborateNAIncidents(await loadCorroborationEvents());
  const verdicts = publicationVerdicts(report, generatedAt);
  const scale = await query<{ sources: string; events: string }>(`
    SELECT (SELECT count(*) FROM source)::text AS sources,
           (SELECT count(*) FROM event)::text AS events`);
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
    result: { incidents: number; corroborated: number };
  };
  const output = {
    generatedAt,
    method: {
      rule: "second independent source, or 48 h after the first claim with the delay recorded",
      delayHours: PUBLICATION_DELAY_MS / 3_600_000,
      scope: "Nouvelle-Aquitaine (regional flag or organisation department)",
      privacy: "truncated SHA-256 victim hashes only; no title, summary or personal data",
    },
    dataset: {
      sources: Number(scale.rows[0].sources),
      events: Number(scale.rows[0].events),
    },
    baseline: {
      source: BASELINE_PATH,
      incidents: baseline.result.incidents,
      corroborated: baseline.result.corroborated,
    },
    summary: verdicts.summary,
    incidents: verdicts.incidents,
  };
  writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`NA incidents: ${verdicts.summary.incidents}`);
  console.log(`Second source: ${verdicts.summary.secondSource}, after 48 h: ${verdicts.summary.afterDelay}, pending: ${verdicts.summary.pending}`);
  console.log(`Median pending age: ${verdicts.summary.medianPendingAgeHours} h`);
  console.log(`Report written to ${JSON_PATH}`);
}

const isMain = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closePools();
  }
}
