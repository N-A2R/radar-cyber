/**
 * Évaluation du détecteur de dérive sémantique contre les signalements
 * humains. Le détecteur ne connaît ni les annotations ni l'issue : il ne voit
 * que les observations des flux. Le rapprochement se fait ensuite, en
 * n'autorisant qu'une alerte comprise dans [onset − 2 jours, signalement].
 *
 * Une dérive n'est dite « confirmée tôt » que si cette alerte précède le
 * signalement manuel d'au moins 7 jours. Les alertes sur flux inchangés sont
 * comptées telles quelles, sans exclusion ni seuil spécifique.
 */
import {
  addDays,
  daysBetween,
  detectSemanticDrift,
  DEFAULT_DRIFT_OPTIONS,
  DRIFT_MIN_LEAD_DAYS,
  SEMANTIC_DRIFT_MODEL,
  type SemanticAlert,
  type SemanticDriftOptions,
  type SemanticFeed,
} from "./derive-semantique.js";
import type { DriftAnnotation } from "./derive-semantique-fixture.js";

export type DriftEvalRow = {
  sourceId: string;
  model: string;
  onsetDay: string;
  reportedDay: string;
  detectedOn: string | null;
  leadDays: number | null;
  early: boolean;
};

export type DriftMetrics = {
  model: string;
  annotatedDrifts: number;
  confirmedEarly: number;
  unchangedSources: number;
  unchangedAlerts: number;
  medianLeadDays: number | null;
  windowDays: number;
  baselineDays: number;
  minScore: number;
  sensitivity: number;
  confirmDays: number;
  source: string;
};

export type SemanticDriftBacktest = {
  alerts: SemanticAlert[];
  evals: DriftEvalRow[];
  metrics: DriftMetrics;
};

/** Une alerte jusqu'à deux jours avant l'onset annoté peut être la même dérive. */
export const DRIFT_MATCH_BEFORE_DAYS = 2;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function evaluateSemanticDrift(
  feeds: readonly SemanticFeed[],
  annotations: readonly DriftAnnotation[],
  options: SemanticDriftOptions = {},
  source = "semantic-drift-backtest",
): SemanticDriftBacktest {
  const resolved = { ...DEFAULT_DRIFT_OPTIONS, ...options };
  // Le détecteur ne reçoit volontairement aucune annotation.
  const alerts = detectSemanticDrift(feeds, resolved);
  const bySource = new Map(feeds.map((feed) => [feed.sourceId, feed]));

  const evals = annotations.map<DriftEvalRow>((annotation) => {
    const earliest = addDays(annotation.onsetDay, -DRIFT_MATCH_BEFORE_DAYS);
    const matched = alerts
      .filter((alert) =>
        alert.sourceId === annotation.sourceId &&
        alert.day >= earliest &&
        alert.day <= annotation.reportedDay)
      .sort((a, b) => a.day.localeCompare(b.day))[0];
    const leadDays = matched ? daysBetween(matched.day, annotation.reportedDay) : null;
    return {
      sourceId: annotation.sourceId,
      model: SEMANTIC_DRIFT_MODEL,
      onsetDay: annotation.onsetDay,
      reportedDay: annotation.reportedDay,
      detectedOn: matched?.day ?? null,
      leadDays,
      early: leadDays !== null && leadDays >= DRIFT_MIN_LEAD_DAYS,
    };
  });

  const unchangedSources = feeds.filter((feed) => feed.expected === "unchanged").length;
  const unchangedAlerts = alerts.filter((alert) =>
    bySource.get(alert.sourceId)?.expected === "unchanged").length;

  return {
    alerts,
    evals,
    metrics: {
      model: SEMANTIC_DRIFT_MODEL,
      annotatedDrifts: annotations.length,
      confirmedEarly: evals.filter((row) => row.early).length,
      unchangedSources,
      unchangedAlerts,
      medianLeadDays: median(evals.filter((row) => row.early).map((row) => row.leadDays!)),
      windowDays: resolved.windowDays,
      baselineDays: resolved.baselineDays,
      minScore: resolved.minScore,
      sensitivity: resolved.sensitivity,
      confirmDays: resolved.confirmDays,
      source,
    },
  };
}

