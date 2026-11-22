/**
 * Mesure reproductible de la source primaire obligatoire (incidents NA).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-source-primaire.mts \
 *     --json=bench/results/source-primaire-2026-11-22.json
 *
 * Aucune écriture en base, aucun appel réseau, aucun service payant. Le rapport
 * ne contient que des URL publiques nettoyées, des empreintes tronquées, des
 * horodatages, des motifs et des compteurs.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query } = await import("../apps/api/src/db.js");
const {
  corroborateNAIncidents,
  loadCorroborationEvents,
} = await import("../apps/api/src/analyse/incident-corroboration.js");
const { publicationVerdicts } = await import("../apps/api/src/analyse/incident-corroboration-48h.js");
const {
  REFUS_SOURCE_MANCANTE,
  buildPublicationJournal,
  verifyPublicationJournal,
} = await import("../apps/api/src/analyse/publication-decisions.js");
const { sourcesParIncident } = await import("../apps/api/src/analyse/source-primaire.js");

const JSON_PATH = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  ?? "bench/results/source-primaire-2026-11-22.json";

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const events = await loadCorroborationEvents();
  const report = corroborateNAIncidents(events);
  const sources = sourcesParIncident(events, report);
  const journal = buildPublicationJournal(publicationVerdicts(report, generatedAt), generatedAt, sources);
  const verification = verifyPublicationJournal(journal);
  const scale = await query<{ sources: string; events: string }>(`
    SELECT (SELECT count(*) FROM source)::text AS sources,
           (SELECT count(*) FROM event)::text AS events`);
  const output = {
    generatedAt,
    method: {
      rule: "no organisation named without a public link to the source that asserts the incident",
      refusalMotif: REFUS_SOURCE_MANCANTE,
      scope: "Nouvelle-Aquitaine (regional flag or organisation department)",
      privacy: "truncated victim hashes, sanitised public URLs, timestamps, counts and reasons only",
      chain: "sha256/64-bit truncated, chained across every decision",
      writes: "none",
    },
    dataset: {
      sources: Number(scale.rows[0].sources),
      events: Number(scale.rows[0].events),
    },
    summary: journal.summary,
    chainHead: journal.chainHead,
    verification,
    decisions: journal.decisions,
  };
  writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`NA incidents with a public primary source: ${journal.summary.incidents - journal.summary.sansSource}/${journal.summary.incidents}`);
  console.log(`Named: ${journal.summary.nommes}, named without source: ${journal.summary.nommesSansSource}`);
  console.log(`Chain replayed: ${verification.checked}/${journal.summary.incidents} (ok=${verification.ok})`);
  console.log(`Report written to ${JSON_PATH}`);
  if (!verification.ok || journal.summary.nommesSansSource > 0) process.exitCode = 1;
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
