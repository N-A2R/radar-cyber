/**
 * Calcule et écrit les scores de confiance de tous les événements.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/compute-confidence-scores.mts \
 *     --json=bench/results/confidence-scores-2026-11-21.json
 *   ... --dry-run   # mesure sans écriture en base
 *
 * Le calcul est pur : mêmes lignes + même corpus => mêmes notes. Le rapport
 * imprimé (et, si demandé, écrit en JSON) contient la distribution des scores
 * et trois exemples réels avec la décomposition complète — jamais un chiffre
 * sans ses quatre composantes.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type {
  ConfidenceBatch,
  EventForScore,
  FactScore,
} from "../apps/api/src/analyse/confidence-service.js";
import { SCORE_LEVELS, SCORE_WEIGHTS } from "../apps/api/src/analyse/confidence-score.js";
import type { ValidatedCorpus } from "../apps/api/src/analyse/validated-corpus.js";

// db.ts lit DATABASE_URL au moment de son import : on le pose avant les imports dynamiques.
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools } = await import("../apps/api/src/db.js");
const {
  loadEvents,
  computeConfidence,
  persistConfidence,
} = await import("../apps/api/src/analyse/confidence-service.js");
const { loadValidatedCorpus } = await import("../apps/api/src/analyse/validated-corpus.js");

const DRY_RUN = process.argv.includes("--dry-run");
const JSON_PATH = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7) ?? null;

export type ConfidenceReport = {
  generatedAt: string;
  method: {
    weights: typeof SCORE_WEIGHTS;
    levels: typeof SCORE_LEVELS;
    factWindowHours: number;
    corpusIncidents: number;
  };
  totals: {
    eventsLoaded: number;
    eventsScored: number;
    attachmentsScored: number;
  };
  facts: ConfidenceBatch["facts"] & {
    eventsInCorroboratedFacts: number;
    eventsInSingleSourceFacts: number;
  };
  incidents: { total: number; corroborated: number; singleSource: number };
  scoreDistribution: { score: number; events: number }[];
  levelDistribution: { level: string; events: number }[];
  examples: FactScore[];
};

/** Trois faits réels : le plus haut, le médian et le plus bas. */
export function selectExamples(facts: readonly FactScore[]): FactScore[] {
  if (facts.length === 0) return [];
  const sorted = [...facts].sort((a, b) => a.score.score - b.score.score || a.factKey.localeCompare(b.factKey));
  return [sorted[Math.floor((sorted.length - 1) / 2)], sorted[sorted.length - 1], sorted[0]];
}

export function buildReport(
  batch: ConfidenceBatch,
  events: readonly EventForScore[],
  corpus: ValidatedCorpus,
  now: Date = new Date(),
): ConfidenceReport {
  const byScore = new Map<number, number>();
  const byLevel = new Map<string, number>();
  for (const row of batch.events) {
    byScore.set(row.score.score, (byScore.get(row.score.score) ?? 0) + 1);
    byLevel.set(row.score.level, (byLevel.get(row.score.level) ?? 0) + 1);
  }
  const corroboratedKeys = new Set(batch.factScores.filter((f) => f.sourcesDistinct >= 2).map((f) => f.factKey));
  const singleKeys = new Set(batch.factScores.filter((f) => f.sourcesDistinct === 1).map((f) => f.factKey));
  const incidents = batch.factScores.filter((fact) => fact.incident);
  return {
    generatedAt: now.toISOString(),
    method: {
      weights: SCORE_WEIGHTS,
      levels: SCORE_LEVELS,
      factWindowHours: 72,
      corpusIncidents: corpus.incidents,
    },
    totals: {
      eventsLoaded: events.length,
      eventsScored: batch.events.length,
      attachmentsScored: batch.attachments.length,
    },
    facts: {
      ...batch.facts,
      eventsInCorroboratedFacts: batch.events.filter((e) => corroboratedKeys.has(e.factKey)).length,
      eventsInSingleSourceFacts: batch.events.filter((e) => singleKeys.has(e.factKey)).length,
    },
    incidents: {
      total: incidents.length,
      corroborated: incidents.filter((fact) => fact.sourcesDistinct >= 2).length,
      singleSource: incidents.filter((fact) => fact.sourcesDistinct === 1).length,
    },
    scoreDistribution: [...byScore.entries()]
      .sort(([a], [b]) => a - b)
      .map(([score, count]) => ({ score, events: count })),
    levelDistribution: [...byLevel.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([level, count]) => ({ level, events: count })),
    examples: selectExamples(batch.factScores),
  };
}

async function main(): Promise<void> {
  const corpus = loadValidatedCorpus();
  const events = await loadEvents();
  const batch = computeConfidence(events, new Date(), corpus);
  if (!DRY_RUN) await persistConfidence(batch);
  const report = buildReport(batch, events, corpus);

  console.log(`Scores de confiance — ${report.totals.eventsScored} événements, ${report.totals.attachmentsScored} rattachements${DRY_RUN ? " (dry-run, rien écrit)" : " écrits en base"}`);
  console.log(`Faits : ${report.facts.corroborated} corroborés par ≥ 2 sources, ${report.facts.singleSource} d'une seule source, ${report.facts.total} au total`);
  console.log(`Incidents : ${report.incidents.corroborated} corroborés par ≥ 2 sources, ${report.incidents.singleSource} d'une seule source, ${report.incidents.total} au total`);
  console.log(`Distribution (niveau) : ${report.levelDistribution.map((l) => `${l.level} ${l.events}`).join(" · ")}`);
  console.log(`Distribution (note) : ${report.scoreDistribution.map((s) => `${s.score}:${s.events}`).join(" ")}`);
  for (const example of report.examples) {
    console.log(`  ${example.score.score}/100 ${example.score.level} — ${example.title} (${example.sourcesDistinct} sources, ${example.eventIds.length} événements)`);
    for (const line of example.score.breakdown) {
      console.log(`    ${line.label}: ${line.value} x ${line.weight} = ${line.points} pts — ${line.reason}`);
    }
  }
  if (JSON_PATH) {
    writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`rapport publié : ${JSON_PATH}`);
  }
}

const estPrincipal = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (estPrincipal) {
  try {
    await main();
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closePools();
  }
}
