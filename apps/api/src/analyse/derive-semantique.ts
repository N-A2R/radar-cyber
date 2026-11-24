/**
 * Détecteur de dérive sémantique d'un flux, sans dépendance à la base.
 *
 * Chaque flux est une suite d'observations quotidiennes : un histogramme de
 * termes (vocabulaire) et un histogramme de zones (couverture). Pour un jour
 * donné on compare la fenêtre glissante des 7 derniers jours aux 28 jours
 * précédents avec la divergence de Jensen-Shannon, bornée dans [0, 1]. Le
 * score retenu est le maximum des deux divergences, ce qui détecte aussi bien
 * un changement de vocabulaire qu'un déplacement de couverture.
 *
 * Le seuil est calibré sur l'historique du flux lui-même (médiane + écart
 * absolu médian des fenêtres de préchauffage), avec un plancher absolu. Un
 * flux très bavard n'a donc pas le même seuil qu'un flux sobre. Le même écart
 * doit apparaître dans deux semaines disjointes et sur deux jours au moins :
 * un pic isolé ou un import rattrapé ne devient pas une dérive. Le détecteur
 * se réarme seulement après une période calme, pour ne pas répéter l'alerte.
 */
export const SEMANTIC_DRIFT_MODEL = "jsd-coverage@1";
export const DRIFT_MIN_LEAD_DAYS = 7;
export const DAY_MS = 86_400_000;

export type Histogram = Record<string, number>;

export type SemanticObservation = {
  day: string;
  terms: Histogram;
  coverage: Histogram;
};

export type SemanticFeed = {
  sourceId: string;
  observations: SemanticObservation[];
  /** Uniquement utilisé par l'évaluation, jamais par le détecteur. */
  expected?: "drift" | "unchanged";
};

export type DriftKind = "vocabulaire" | "couverture";

export type SemanticAlert = {
  sourceId: string;
  day: string;
  kind: DriftKind;
  score: number;
  threshold: number;
  baselineScore: number;
};

export type SemanticDriftOptions = {
  windowDays?: number;
  baselineDays?: number;
  warmupDays?: number;
  minScore?: number;
  sensitivity?: number;
  confirmDays?: number;
  rearmDays?: number;
};

type ResolvedOptions = Required<SemanticDriftOptions>;

export const DEFAULT_DRIFT_OPTIONS: ResolvedOptions = {
  windowDays: 7,
  baselineDays: 28,
  warmupDays: 42,
  minScore: 0.1,
  sensitivity: 2.5,
  confirmDays: 2,
  rearmDays: 14,
};

function resolve(options: SemanticDriftOptions = {}): ResolvedOptions {
  const merged = { ...DEFAULT_DRIFT_OPTIONS, ...options };
  if (merged.windowDays < 1 || merged.baselineDays < 1 || merged.confirmDays < 1 || merged.rearmDays < 1) {
    throw new Error("fenêtres, confirmation et réarmement doivent être >= 1");
  }
  if (merged.warmupDays < merged.windowDays + merged.baselineDays + 2) {
    throw new Error("préchauffage trop court pour calibrer le seuil");
  }
  return merged;
}

export function parseDay(day: string): number {
  const value = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(value)) throw new Error(`jour invalide: ${day}`);
  return value;
}

export function addDays(day: string, days: number): string {
  return new Date(parseDay(day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mergeHistogram(slice: readonly SemanticObservation[], key: "terms" | "coverage"): Histogram {
  const total: Histogram = {};
  for (const observation of slice) {
    for (const [name, count] of Object.entries(observation[key])) {
      if (!Number.isFinite(count) || count <= 0) continue;
      total[name] = (total[name] ?? 0) + count;
    }
  }
  return total;
}

/** Divergence de Jensen-Shannon entre deux distributions, dans [0, 1]. */
export function jensenShannon(left: Histogram, right: Histogram): number {
  const totalLeft = Object.values(left).reduce((sum, n) => sum + Math.max(0, n), 0);
  const totalRight = Object.values(right).reduce((sum, n) => sum + Math.max(0, n), 0);
  if (totalLeft <= 0 || totalRight <= 0) return 0;

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let divergence = 0;
  for (const key of keys) {
    const p = Math.max(0, left[key] ?? 0) / totalLeft;
    const q = Math.max(0, right[key] ?? 0) / totalRight;
    const m = (p + q) / 2;
    if (p > 0) divergence += 0.5 * p * Math.log2(p / m);
    if (q > 0) divergence += 0.5 * q * Math.log2(q / m);
  }
  return Math.min(1, Math.max(0, divergence));
}

type Score = { score: number; kind: DriftKind };

function scoreAt(
  observations: readonly SemanticObservation[],
  index: number,
  options: ResolvedOptions,
): Score | null {
  const recentStart = index - options.windowDays + 1;
  const referenceStart = recentStart - options.baselineDays;
  if (referenceStart < 0) return null;

  const recent = observations.slice(recentStart, index + 1);
  const reference = observations.slice(referenceStart, recentStart);
  const vocabulary = jensenShannon(mergeHistogram(recent, "terms"), mergeHistogram(reference, "terms"));
  const coverage = jensenShannon(mergeHistogram(recent, "coverage"), mergeHistogram(reference, "coverage"));
  return vocabulary >= coverage
    ? { score: vocabulary, kind: "vocabulaire" }
    : { score: coverage, kind: "couverture" };
}

function thresholdFrom(baseline: readonly number[], options: ResolvedOptions): { threshold: number; baselineScore: number } {
  const baselineScore = median(baseline);
  const deviation = median(baseline.map((value) => Math.abs(value - baselineScore)));
  // 1,4826 ramène l'écart absolu médian à l'échelle d'un écart-type gaussien.
  const spread = 1.4826 * deviation + 0.01;
  const threshold = Math.max(options.minScore, Math.min(1, baselineScore + options.sensitivity * spread));
  return { threshold, baselineScore };
}

function detectFeed(feed: SemanticFeed, options: ResolvedOptions): SemanticAlert[] {
  const observations = [...feed.observations].sort((a, b) => a.day.localeCompare(b.day));
  const firstEvaluation = options.windowDays + options.baselineDays - 1;
  const calibration: number[] = [];
  for (let index = firstEvaluation; index < options.warmupDays && index < observations.length; index++) {
    const score = scoreAt(observations, index, options);
    if (score) calibration.push(score.score);
  }
  if (calibration.length < 3) return [];

  const { threshold, baselineScore } = thresholdFrom(calibration, options);
  const alerts: SemanticAlert[] = [];
  let runStart = -1;
  let runKind: DriftKind = "vocabulaire";
  let runScore = 0;
  let armed = true;
  let quietDays = 0;

  for (let index = options.warmupDays; index < observations.length; index++) {
    const score = scoreAt(observations, index, options);
    const previousWeek = scoreAt(observations, index - options.windowDays, options);
    // Deux fenêtres qui ne se chevauchent pas : un pic d'un seul jour ne peut
    // pas franchir le seuil deux semaines de suite, même avec un seuil bas.
    if (!score || score.score < threshold || !previousWeek || previousWeek.score < threshold) {
      runStart = -1;
      quietDays++;
      if (quietDays >= options.rearmDays) armed = true;
      continue;
    }
    quietDays = 0;
    if (runStart < 0) {
      runStart = index;
      runKind = score.kind;
      runScore = score.score;
    }
    if (index - runStart + 1 < options.confirmDays) continue;
    if (armed) {
      alerts.push({
        sourceId: feed.sourceId,
        day: observations[runStart]!.day,
        kind: runKind,
        score: runScore,
        threshold,
        baselineScore,
      });
      armed = false;
    }
    runStart = -1;
  }
  return alerts;
}

/** Alertes triées par flux puis par jour, sans effet de bord. */
export function detectSemanticDrift(
  feeds: readonly SemanticFeed[],
  options: SemanticDriftOptions = {},
): SemanticAlert[] {
  const resolved = resolve(options);
  return feeds
    .flatMap((feed) => detectFeed(feed, resolved))
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.day.localeCompare(b.day));
}
