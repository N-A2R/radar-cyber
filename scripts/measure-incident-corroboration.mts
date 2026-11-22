/**
 * Reproducible measurement of two-source corroboration for NA incidents.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-incident-corroboration.mts \
 *     --json=bench/results/incident-corroboration-2026-11-22.json
 *
 * Read-only: the database is never modified. The report contains hashed victim
 * identities and source/publisher names only — never victim personal data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { query, closePools } = await import("../apps/api/src/db.js");
const {
  CLAIM_WINDOW_MS,
  NA_DEPARTMENTS,
  corroborateNAIncidents,
  loadCorroborationEvents,
} = await import("../apps/api/src/analyse/incident-corroboration.js");

const JSON_PATH = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  ?? "bench/results/incident-corroboration-2026-11-22.json";
const BASELINE_PATH = "bench/results/confidence-scores-2026-11-21.json";

async function organisationCount(): Promise<{ value: number; exact: boolean }> {
  try {
    const exact = await query<{ count: string }>(`SELECT count(*)::text AS count FROM org_alias`);
    return { value: Number(exact.rows[0].count), exact: true };
  } catch {
    // A busy database can exceed the statement timeout: label the catalog
    // estimate as such, never pass it off as an exact count.
    const estimate = await query<{ estimate: string }>(
      `SELECT reltuples::bigint::text AS estimate FROM pg_class WHERE relname = 'org_alias'`);
    return { value: Number(estimate.rows[0].estimate), exact: false };
  }
}

async function main(): Promise<void> {
  const events = await loadCorroborationEvents();
  const report = corroborateNAIncidents(events);
  const scale = await query<{ sources: string; events: string }>(`
    SELECT (SELECT count(*) FROM source)::text AS sources,
           (SELECT count(*) FROM event)::text AS events`);
  const organisations = await organisationCount();
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
    incidents: { total: number; corroborated: number };
  };
  const corroborated = report.clusters.filter((cluster) => cluster.corroborated);
  const result = {
    generatedAt: new Date().toISOString(),
    method: {
      scope: "Nouvelle-Aquitaine (regional flag; department attachments accepted when supplied)",
      departments: Object.keys(NA_DEPARTMENTS),
      assertions: ["confirmed_incident", "third_party_claim"],
      matching: "same victim domain and claimant within the claim window, regardless of event family",
      independence: "distinct publisher host from the source URL (feeds of one publisher are one source)",
      claimWindowHours: CLAIM_WINDOW_MS / 3_600_000,
      privacy: "victim identities are SHA-256 truncated hashes; no title, summary or personal data exported",
    },
    dataset: {
      organisations: organisations.value,
      organisationsExact: organisations.exact,
      sources: Number(scale.rows[0].sources),
      events: Number(scale.rows[0].events),
      eventsLoaded: events.length,
    },
    baseline: {
      source: BASELINE_PATH,
      incidents: baseline.incidents.total,
      corroborated: baseline.incidents.corroborated,
      ratePercent: baseline.incidents.total === 0
        ? 0
        : Math.round((baseline.incidents.corroborated / baseline.incidents.total) * 10_000) / 100,
    },
    result: {
      incidents: report.incidentsTotal,
      corroborated: report.incidentsCorroborated,
      singleSource: report.incidentsSingleSource,
      ratePercent: report.ratePercent,
    },
    corroboratedClusters: corroborated,
  };
  writeFileSync(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Dataset: ${result.dataset.organisations} organisations, ${result.dataset.sources} sources, ${result.dataset.events} events`);
  console.log(`Baseline: ${result.baseline.corroborated}/${result.baseline.incidents} corroborated (${result.baseline.ratePercent}%)`);
  console.log(`Corroborated NA incidents: ${result.result.corroborated}/${result.result.incidents} (${result.result.ratePercent}%)`);
  console.log(`Independent publishers: ${[...new Set(corroborated.flatMap((cluster) => cluster.publishers))].sort().join(", ") || "none"}`);
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
