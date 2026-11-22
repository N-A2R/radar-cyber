/**
 * Marché de prédictions régionales : un pari par département et par fenêtre.
 *
 * Le pronostic est calculé uniquement avec l'histoire strictement antérieure
 * à la fenêtre : taux de base pooled (tous départements confondus) + taux
 * propre au département, lissés par un prior de Laplace. Aucun événement de la
 * fenêtre ne participe à sa propre probabilité. La résolution compare ensuite
 * cette probabilité à la présence réelle d'au moins un incident régional.
 *
 * Calcul pur et déterministe : mêmes incidents => mêmes probabilités, même
 * Brier. Aucune donnée personnelle n'entre dans le modèle (code département,
 * date, résultat binaire uniquement).
 */

export const FORECAST_MODEL = "na-fortnight-laplace-v1";
export const FORECAST_HORIZON_DAYS = 14;
/** Pseudo-observations : 8 fenêtres de passé pour éviter les probabilités à 0/1. */
export const FORECAST_PRIOR_WINDOWS = 8;

export type RegionalIncident = {
  /** Code INSEE du département (ex. "33" pour la Gironde). */
  dept: string;
  /** Date ISO de l'incident : YYYY-MM-DD, YYYY-MM ou YYYY acceptés. */
  date: string;
};

export type RegionalForecast = {
  dept: string;
  /** Début UTC de la fenêtre pronostiquée (inclus). */
  windowStart: string;
  /** Fin UTC de la fenêtre : le pari est résolu à cette date. */
  resolvedAt: string;
  horizonDays: number;
  probability: number;
  /** 1 si au moins un incident régional réel est survenu dans la fenêtre. */
  outcome: 0 | 1;
  model: string;
};

export type ForecastOptions = {
  horizonDays?: number;
  priorWindows?: number;
  model?: string;
};

const DAY_MS = 86_400_000;

/** Normalise une date partielle vers le premier jour UTC de la période. */
export function normalizeIncidentDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const time = Date.parse(`${trimmed}T00:00:00Z`);
    return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  return null;
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function isoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Construit la série complète des paris résolus, département par département.
 * Les fenêtres sont alignées sur la date du premier incident observé.
 */
export function buildRegionalForecasts(
  incidents: readonly RegionalIncident[],
  options: ForecastOptions = {},
): RegionalForecast[] {
  const horizonDays = options.horizonDays ?? FORECAST_HORIZON_DAYS;
  const priorWindows = options.priorWindows ?? FORECAST_PRIOR_WINDOWS;
  const model = options.model ?? FORECAST_MODEL;
  if (!Number.isInteger(horizonDays) || horizonDays <= 0) throw new Error("horizonDays doit être > 0");
  if (!Number.isInteger(priorWindows) || priorWindows <= 0) throw new Error("priorWindows doit être > 0");

  const normalized = incidents.map((incident) => {
    const date = normalizeIncidentDate(incident.date);
    if (!date) throw new Error(`Date d'incident invalide: ${incident.date}`);
    if (!/^\d{2}$/.test(incident.dept)) throw new Error(`Code département invalide: ${incident.dept}`);
    return { dept: incident.dept, day: dayNumber(date) };
  });
  if (normalized.length === 0) throw new Error("Aucun incident régional à pronostiquer");

  const depts = [...new Set(normalized.map((i) => i.dept))].sort();
  const first = Math.min(...normalized.map((i) => i.day));
  const last = Math.max(...normalized.map((i) => i.day));
  const binCount = Math.floor((last - first) / horizonDays) + 1;

  const perDept = new Map(depts.map((dept) => [dept, new Array<number>(binCount).fill(0)]));
  const total = new Array<number>(binCount).fill(0);
  for (const incident of normalized) {
    const bin = Math.floor((incident.day - first) / horizonDays);
    perDept.get(incident.dept)![bin] += 1;
    total[bin] += 1;
  }

  const forecasts: RegionalForecast[] = [];
  for (let bin = 0; bin < binCount; bin += 1) {
    const historyBins = bin;
    const pooled = total.slice(0, bin).reduce((sum, n) => sum + n, 0);
    const baseRate = (pooled + 1) / (historyBins * depts.length + depts.length);
    const windowStart = isoDate(first + bin * horizonDays);
    const resolvedAt = isoDate(first + (bin + 1) * horizonDays);

    for (const dept of depts) {
      const past = perDept.get(dept)!.slice(0, bin).reduce((sum, n) => sum + n, 0);
      const probability = (priorWindows * baseRate + past) / (priorWindows + historyBins);
      const outcome: 0 | 1 = perDept.get(dept)![bin] > 0 ? 1 : 0;
      forecasts.push({
        dept,
        windowStart,
        resolvedAt,
        horizonDays,
        probability,
        outcome,
        model,
      });
    }
  }
  return forecasts;
}

/** Score de Brier : moyenne des écarts quadratiques entre probabilité et résultat. */
export function brierScore(forecasts: readonly RegionalForecast[]): number {
  if (forecasts.length === 0) return Number.NaN;
  return forecasts.reduce((sum, f) => sum + (f.probability - f.outcome) ** 2, 0) / forecasts.length;
}
