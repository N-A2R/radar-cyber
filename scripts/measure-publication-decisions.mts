/**
 * Reproducible measurement of the publication-decision journal (NA incidents).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-publication-decisions.mts \
 *     --json=bench/results/publication-decisions-2026-11-22.json
 *
 * The decisions are appended once to the audit journal (migration 027), then
 * the hash chain is replayed. The report carries only truncated victim hashes,
 * timestamps, counts and reasons — no title, no organisation name, no personal
 * data, no network call, no paid service.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query } = await import("../apps/api/src/db.js");
const {
  corroborateNAIncidents,
  loadCorroborationEvents,
} = await import("../apps/api/src/analyse/incident-corroboration.js");
const { publicationVerdicts } = await import("../apps/api/src/analyse/incident-corroboration-48h.js");
const {
  REFUS_PUBLICATION,
  buildPublicationJournal,
  verifyPublicationJournal,
} = await import("../apps/api/src/analyse/publication-decisions.js");
const { enregistrerDecisionsPublication } = await import("../apps/api/src/journal/publication.js");

const JSON_PATH = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  ?? "bench/results/publication-decisions-2026-11-22.json";
const BASELINE_PATH = "bench/results/corroboration-48h-2026-11-22.json";

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const report = corroborateNAIncidents(await loadCorroborationEvents());
  const verdicts = publicationVerdicts(report, generatedAt);
  const journal = buildPublicationJournal(verdicts, generatedAt);
  const verification = verifyPublicationJournal(journal);
  const recording = await enregistrerDecisionsPublication(journal);
  const scale = await query<{ sources: string; events: string }>(`
    SELECT (SELECT count(*) FROM source)::text AS sources,
           (SELECT count(*) FROM event)::text AS events`);
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
    summary: { incidents: number };
  };
  const output = {
    generatedAt,
    method: {
      rule: journal.rule,
      refusalMotif: REFUS_PUBLICATION,
      scope: "Nouvelle-Aquitaine (regional flag or organisation department)",
      privacy: "truncated SHA-256 victim hashes, timestamps, counts and reasons only",
      appendOnly: "one decision per incident and measurement instant, journal migration 027",
      chain: "sha256/64-bit truncated, chained across every decision",
    },
    dataset: {
      sources: Number(scale.rows[0].sources),
      events: Number(scale.rows[0].events),
    },
    baseline: {
      source: BASELINE_PATH,
      incidents: baseline.summary.incidents,
    },
    summary: journal.summary,
    chainHead: journal.chainHead,
    verification,
    recording,
    decisions: journal.decisions,
  };
  writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`NA incidents with a journalised decision: ${journal.summary.incidents}/${verdicts.summary.incidents}`);
  console.log(`Named: ${journal.summary.nommes}, refused ${REFUS_PUBLICATION}: ${journal.summary.publicationRisquee}`);
  console.log(`Chain replayed: ${verification.checked}/${journal.summary.incidents} (ok=${verification.ok})`);
  console.log(`Journal written: ${recording.ecrits}, already recorded: ${recording.dejaJournalises}, lacunes: ${recording.lacunes}`);
  console.log(`Report written to ${JSON_PATH}`);
  if (!verification.ok || recording.lacunes > 0 || recording.erreurs.length > 0) {
    process.exitCode = 1;
  }
  if (journal.summary.incidents !== baseline.summary.incidents) {
    console.warn(`Scope changed: ${journal.summary.incidents} incidents vs ${baseline.summary.incidents} in baseline`);
  }
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
