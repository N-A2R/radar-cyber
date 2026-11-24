/**
 * Persistance et exécution de la détection de dérive sémantique.
 *
 * `runSemanticDriftCheck` lit les observations et les signalements manquels
 * depuis PostgreSQL, appelle l'évaluation pure, puis remplace les alertes,
 * l'évaluation et la métrique du modèle dans une seule transaction. Le
 * détecteur lui-même ne dépend pas de la base et ne lit aucune annotation.
 *
 * Le vérificateur du critère appelle ce point d'entrée sur une base de test
 * éphémère remplie par `insertSemanticFixture` : aucune donnée de production
 * n'est lue ni modifiée, aucun flux réel n'est présenté comme local.
 */
import { withTransaction, query } from "../db.js";
import {
  evaluateSemanticDrift,
  type DriftEvalRow,
  type DriftMetrics,
  type SemanticDriftBacktest,
} from "./derive-semantique-backtest.js";
import type { DriftAnnotation, SemanticFixture } from "./derive-semantique-fixture.js";
import type { SemanticAlert, SemanticFeed, SemanticObservation } from "./derive-semantique.js";

type ObservationRow = {
  source_id: string;
  expected: "drift" | "unchanged";
  day: string | Date;
  terms: Record<string, number>;
  coverage: Record<string, number>;
};

type AnnotationRow = {
  source_id: string;
  kind: "vocabulaire" | "couverture";
  onset_day: string | Date;
  reported_day: string | Date;
  rationale: string;
};

function iso(value: string | Date): string {
  if (typeof value === "string") return value;
  // pg renvoie un `date` comme minuit local : toISOString() reculerait d'un
  // jour sous Europe/Paris. On lit donc les composants calendaires tels quels.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Charge le jeu synthétique dans la base courante ; idempotent. */
export async function insertSemanticFixture(fixture: SemanticFixture): Promise<number> {
  return withTransaction(async (client) => {
    for (const feed of fixture.feeds) {
      await client.query(
        `INSERT INTO semantic_drift_feed (source_id, expected, label, source)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_id) DO UPDATE SET expected = EXCLUDED.expected,
           label = EXCLUDED.label, source = EXCLUDED.source`,
        [feed.sourceId, feed.expected ?? "unchanged", feed.sourceId, fixture.source],
      );
    }

    const observations = fixture.feeds.flatMap((feed) =>
      feed.observations.map((observation) => [feed.sourceId, observation] as const));
    for (let offset = 0; offset < observations.length; offset += 500) {
      const batch = observations.slice(offset, offset + 500);
      await client.query(
        `INSERT INTO semantic_drift_observation (source_id, day, terms, coverage, source)
         SELECT * FROM unnest($1::text[], $2::date[], $3::jsonb[], $4::jsonb[], $5::text[])
         ON CONFLICT (source_id, day) DO UPDATE SET terms = EXCLUDED.terms,
           coverage = EXCLUDED.coverage, source = EXCLUDED.source`,
        [
          batch.map(([sourceId]) => sourceId),
          batch.map(([, observation]) => observation.day),
          batch.map(([, observation]) => JSON.stringify(observation.terms)),
          batch.map(([, observation]) => JSON.stringify(observation.coverage)),
          batch.map(() => fixture.source),
        ],
      );
    }

    await client.query(
      `INSERT INTO semantic_drift_annotation (source_id, model, kind, onset_day, reported_day, rationale, source)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::date[],
         $5::date[], $6::text[], $7::text[])
       ON CONFLICT (source_id, onset_day) DO NOTHING`,
      [
        fixture.annotations.map((annotation) => annotation.sourceId),
        fixture.annotations.map(() => fixture.model),
        fixture.annotations.map((annotation) => annotation.kind),
        fixture.annotations.map((annotation) => annotation.onsetDay),
        fixture.annotations.map((annotation) => annotation.reportedDay),
        fixture.annotations.map((annotation) => annotation.rationale),
        fixture.annotations.map(() => fixture.source),
      ],
    );
    return observations.length;
  });
}

async function replaceAlerts(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  alerts: readonly SemanticAlert[],
  source: string,
  model: string,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_drift_alert (source_id, model, day, kind, score, threshold, baseline_score, source)
     SELECT * FROM unnest($1::text[], $2::text[], $3::date[], $4::text[],
       $5::double precision[], $6::double precision[], $7::double precision[], $8::text[])`,
    [
      alerts.map((alert) => alert.sourceId),
      alerts.map(() => model),
      alerts.map((alert) => alert.day),
      alerts.map((alert) => alert.kind),
      alerts.map((alert) => alert.score),
      alerts.map((alert) => alert.threshold),
      alerts.map((alert) => alert.baselineScore),
      alerts.map(() => source),
    ],
  );
}

async function replaceEvals(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  evals: readonly DriftEvalRow[],
  source: string,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_drift_eval
       (source_id, model, onset_day, reported_day, detected_on, lead_days, early, source)
     SELECT * FROM unnest($1::text[], $2::text[], $3::date[], $4::date[],
       $5::date[], $6::integer[], $7::boolean[], $8::text[])`,
    [
      evals.map((row) => row.sourceId),
      evals.map((row) => row.model),
      evals.map((row) => row.onsetDay),
      evals.map((row) => row.reportedDay),
      evals.map((row) => row.detectedOn),
      evals.map((row) => row.leadDays),
      evals.map((row) => row.early),
      evals.map(() => source),
    ],
  );
}

async function upsertMetric(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  metric: DriftMetrics,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_drift_metric
       (model, annotated_drifts, confirmed_early, unchanged_sources, unchanged_alerts,
        median_lead_days, window_days, baseline_days, min_score, sensitivity, confirm_days, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (model) DO UPDATE SET
       annotated_drifts = EXCLUDED.annotated_drifts,
       confirmed_early = EXCLUDED.confirmed_early,
       unchanged_sources = EXCLUDED.unchanged_sources,
       unchanged_alerts = EXCLUDED.unchanged_alerts,
       median_lead_days = EXCLUDED.median_lead_days,
       window_days = EXCLUDED.window_days,
       baseline_days = EXCLUDED.baseline_days,
       min_score = EXCLUDED.min_score,
       sensitivity = EXCLUDED.sensitivity,
       confirm_days = EXCLUDED.confirm_days,
       source = EXCLUDED.source,
       measured_at = now()`,
    [
      metric.model,
      metric.annotatedDrifts,
      metric.confirmedEarly,
      metric.unchangedSources,
      metric.unchangedAlerts,
      metric.medianLeadDays,
      metric.windowDays,
      metric.baselineDays,
      metric.minScore,
      metric.sensitivity,
      metric.confirmDays,
      metric.source,
    ],
  );
}

/** Remplace toutes les lignes du modèle par le backtest fourni. */
export async function storeSemanticDriftBacktest(backtest: SemanticDriftBacktest): Promise<void> {
  const model = backtest.metrics.model;
  await withTransaction(async (client) => {
    await client.query("DELETE FROM semantic_drift_alert WHERE model = $1", [model]);
    await client.query("DELETE FROM semantic_drift_eval WHERE model = $1", [model]);
    await client.query("DELETE FROM semantic_drift_metric WHERE model = $1", [model]);
    await replaceAlerts(client, backtest.alerts, backtest.metrics.source, model);
    await replaceEvals(client, backtest.evals, backtest.metrics.source);
    await upsertMetric(client, backtest.metrics);
  });
}

/** Lecture des flux + exécution + persistance : point d'entrée automatique. */
export async function runSemanticDriftCheck(
  options: { sourceIds?: readonly string[]; source?: string } = {},
): Promise<SemanticDriftBacktest> {
  const sourceIds = options.sourceIds ? [...options.sourceIds] : null;
  const observationRows = await query<ObservationRow>(
    `SELECT f.source_id, f.expected, o.day::text AS day, o.terms, o.coverage
       FROM semantic_drift_observation o
       JOIN semantic_drift_feed f ON f.source_id = o.source_id
      WHERE ($1::text[] IS NULL OR f.source_id = ANY($1::text[]))
      ORDER BY f.source_id, o.day`,
    [sourceIds],
  );
  const annotationRows = await query<AnnotationRow>(
    `SELECT source_id, kind, onset_day::text AS onset_day, reported_day::text AS reported_day, rationale
       FROM semantic_drift_annotation
      WHERE ($1::text[] IS NULL OR source_id = ANY($1::text[]))
      ORDER BY source_id, onset_day`,
    [sourceIds],
  );

  const feedMap = new Map<string, SemanticFeed>();
  for (const row of observationRows.rows) {
    let feed = feedMap.get(row.source_id);
    if (!feed) {
      feed = { sourceId: row.source_id, expected: row.expected, observations: [] };
      feedMap.set(row.source_id, feed);
    }
    const observation: SemanticObservation = {
      day: iso(row.day),
      terms: row.terms,
      coverage: row.coverage,
    };
    feed.observations.push(observation);
  }

  const annotations: DriftAnnotation[] = annotationRows.rows.map((row) => ({
    sourceId: row.source_id,
    kind: row.kind,
    onsetDay: iso(row.onset_day),
    reportedDay: iso(row.reported_day),
    rationale: row.rationale,
  }));

  const feeds = [...feedMap.values()];
  const backtest = evaluateSemanticDrift(
    feeds,
    annotations,
    {},
    options.source ?? "semantic-drift-check",
  );
  await storeSemanticDriftBacktest(backtest);
  return backtest;
}
