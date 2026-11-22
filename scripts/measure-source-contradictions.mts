/**
 * Reproducible count of contradictions between sources in Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-source-contradictions.mts \
 *     --json=bench/results/source-contradictions-2026-11-22.json
 *
 * Read-only: no writes to the database, no network calls, no paid service.
 * The report contains hashed subject identifiers and internal event ids only.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { query, closePools } = await import("../apps/api/src/db.js");
const {
  detectContradictions,
  loadNAContradictionEvents,
} = await import("../apps/api/src/analyse/source-contradictions.js");

const JSON_PATH = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  ?? "bench/results/source-contradictions-2026-11-22.json";

async function organisationCount(): Promise<{ value: number; exact: boolean }> {
  try {
    const exact = await query<{ count: string }>(`SELECT count(*)::text AS count FROM org_alias`);
    return { value: Number(exact.rows[0].count), exact: true };
  } catch {
    // A busy database may exceed the statement timeout: label the catalog
    // estimate as such, never present it as an exact count.
    const estimate = await query<{ estimate: string }>(
      `SELECT reltuples::bigint::text AS estimate FROM pg_class WHERE relname = 'org_alias'`);
    return { value: Number(estimate.rows[0].estimate), exact: false };
  }
}

async function main(): Promise<void> {
  const events = await loadNAContradictionEvents();
  const report = detectContradictions(events);
  const scale = await query<{ sources: string; events: string }>(`
    SELECT (SELECT count(*) FROM source)::text AS sources,
           (SELECT count(*) FROM event)::text AS events`);
  const organisations = await organisationCount();

  const result = {
    generatedAt: new Date().toISOString(),
    method: {
      scope: "Nouvelle-Aquitaine: event flagged regional or attached to an NA department",
      grouping: "subject (organisation or victim domain) + shared topic word + 72-hour window",
      independence: "publisher host from the source URL; feeds of one publisher count once",
      disagreement: "distinct declared severity, or distinct claim nature, between publishers",
      privacy: "hashed subject identifiers and event ids only; no title, summary or personal data",
      sources: "all sources included, including gray sources; no paid service and no network call",
    },
    dataset: {
      organisations: organisations.value,
      organisationsExact: organisations.exact,
      sources: Number(scale.rows[0].sources),
      events: Number(scale.rows[0].events),
      eventsLoaded: events.length,
      subjectsScanned: report.subjectsScanned,
      eventsScanned: report.eventsScanned,
    },
    result: {
      contradictions: report.count,
      byKind: report.byKind,
    },
    contradictions: report.contradictions,
  };
  writeFileSync(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Dataset: ${result.dataset.organisations} organisations, ${result.dataset.sources} sources, ${result.dataset.events} events`);
  console.log(`NA events loaded: ${result.dataset.eventsLoaded} (scanned ${result.dataset.eventsScanned} on ${result.dataset.subjectsScanned} subjects)`);
  console.log(`Contradictions detected: ${result.result.contradictions} (severity ${result.result.byKind.severity}, nature ${result.result.byKind.nature})`);
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
