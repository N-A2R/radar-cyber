/**
 * Deterministic top-10 victim forecast for Nouvelle-Aquitaine organisations.
 *
 * Everything here is pure: no database, no network, no clock. The measurement
 * script supplies rows read from the referential and this module turns them
 * into a ranked forecast and a walk-forward backtest. Only organisation-level
 * fields are used; claim descriptions and victim names are never read.
 */
import { naDepartmentCode } from "../geo/na-departments.js";
import { intervalleWilson } from "../analyse/secteur.js";

export const TOP_N = 10;
export const HORIZON_DAYS = 30;
export const BACKTEST_MONTHS = 6;

const DAY_MS = 86_400_000;

export type OrgMeta = {
  orgId: number;
  name: string;
  sector: string | null;
  dept: string;
};

export type ClaimRecord = {
  orgId: number;
  publishedAt: string;
  groupName: string;
};

export type EventRecord = {
  orgId: number;
  validAt: string;
  sourceId: string;
};

export type Candidate = OrgMeta & {
  priorClaims: number;
  priorGroups: number;
  daysSinceLastClaim: number | null;
  sectorClaims: number;
  deptClaims: number;
  recentEvents: number;
  eventSources: number;
  daysSinceLastEvent: number | null;
};

export type ForecastEntry = Candidate & {
  rank: number;
  score: number;
};

export type WindowResult = {
  cutoff: string;
  horizonEnd: string;
  predicted: number[];
  actual: number[];
  hits: number[];
  precision: number;
  recall: number | null;
};

export type BacktestResult = {
  asOf: string;
  cutoffs: string[];
  windows: WindowResult[];
  forecasts: ForecastEntry[];
  predictions: number;
  hits: number;
  victims: number;
  precision: number;
  recall: number | null;
  recallInterval: [number, number] | null;
};

/** UTC day number of an ISO date; invalid input throws instead of drifting. */
export function dayNumber(isoDate: string): number {
  const parsed = Date.parse(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ISO day: ${isoDate}`);
  return Math.floor(parsed / DAY_MS);
}

export function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return isoDay(dayNumber(isoDate) + days);
}

/**
 * Six non-overlapping 30-day windows ending on `asOf`. Each cutoff is the
 * start of one window, so the whole evaluation period is exactly 6 months.
 */
export function walkForwardCutoffs(
  asOf: string,
  months = BACKTEST_MONTHS,
  stepDays = HORIZON_DAYS,
): string[] {
  const end = dayNumber(asOf);
  return Array.from({ length: months }, (_, index) =>
    isoDay(end - (months - index) * stepDays),
  );
}

function countBy(rows: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row, (counts.get(row) ?? 0) + 1);
  return counts;
}

/**
 * Builds one row per candidate organisation from facts strictly before the
 * cutoff. Claims use `published_at`, events use `valid_at`; both boundaries are
 * exclusive so the outcome window can never leak into the features.
 */
export function buildCandidates(
  orgs: readonly OrgMeta[],
  claims: readonly ClaimRecord[],
  events: readonly EventRecord[],
  cutoff: string,
): Candidate[] {
  const boundary = dayNumber(cutoff);
  const pastClaims = claims.filter((c) => dayNumber(c.publishedAt) < boundary);
  const pastEvents = events.filter((e) => dayNumber(e.validAt) < boundary);
  const claimsByOrg = new Map<number, ClaimRecord[]>();
  const eventsByOrg = new Map<number, EventRecord[]>();

  for (const claim of pastClaims) {
    const list = claimsByOrg.get(claim.orgId) ?? [];
    list.push(claim);
    claimsByOrg.set(claim.orgId, list);
  }
  for (const event of pastEvents) {
    const list = eventsByOrg.get(event.orgId) ?? [];
    list.push(event);
    eventsByOrg.set(event.orgId, list);
  }

  const orgById = new Map<number, OrgMeta>();
  for (const org of orgs) orgById.set(org.orgId, org);

  const sectorClaims = countBy(
    pastClaims
      .map((c) => orgById.get(c.orgId)?.sector ?? null)
      .filter((sector): sector is string => sector !== null),
  );
  const deptClaims = countBy(pastClaims.map((c) => orgById.get(c.orgId)?.dept ?? ""));

  return orgs
    .filter((org) => naDepartmentCode(org.dept) !== null)
    .map((org) => {
      const ownClaims = claimsByOrg.get(org.orgId) ?? [];
      const ownEvents = eventsByOrg.get(org.orgId) ?? [];
      const lastClaim = ownClaims.reduce(
        (max, c) => Math.max(max, dayNumber(c.publishedAt)),
        Number.NEGATIVE_INFINITY,
      );
      const lastEvent = ownEvents.reduce(
        (max, e) => Math.max(max, dayNumber(e.validAt)),
        Number.NEGATIVE_INFINITY,
      );
      return {
        ...org,
        priorClaims: ownClaims.length,
        priorGroups: new Set(ownClaims.map((c) => c.groupName.toLowerCase())).size,
        daysSinceLastClaim: ownClaims.length === 0 ? null : boundary - lastClaim,
        sectorClaims: sectorClaims.get(org.sector ?? "") ?? 0,
        deptClaims: deptClaims.get(org.dept) ?? 0,
        recentEvents: ownEvents.length,
        eventSources: new Set(ownEvents.map((e) => e.sourceId)).size,
        daysSinceLastEvent: ownEvents.length === 0 ? null : boundary - lastEvent,
      };
    });
}

/** Bounded contributions keep one hot source from taking the whole ranking. */
function capped(value: number, cap: number): number {
  return Math.min(Math.max(value, 0), cap);
}

/** Weighted, deterministic risk score. Weights are documented in the report. */
export function scoreCandidate(candidate: Candidate): number {
  const score =
    6 * capped(candidate.priorClaims, 3) +
    4 * capped(candidate.priorGroups, 2) +
    capped(12 - (candidate.daysSinceLastClaim ?? 365) / 30, 12) +
    1.5 * capped(candidate.sectorClaims, 8) +
    capped(candidate.deptClaims, 10) +
    3 * capped(candidate.recentEvents, 5) +
    2 * capped(candidate.eventSources, 3) +
    capped(8 - (candidate.daysSinceLastEvent ?? 365) / 15, 8);
  return Math.round(score * 100) / 100;
}

/** Ties are broken by organisation id so repeated runs give the same list. */
export function rankCandidates(
  candidates: readonly Candidate[],
  limit = TOP_N,
): ForecastEntry[] {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate) }))
    .filter((entry) => naDepartmentCode(entry.dept) !== null)
    .sort((a, b) => b.score - a.score || a.orgId - b.orgId)
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** A victim is an organisation with at least one NA claim in the window. */
export function victimsInWindow(
  claims: readonly ClaimRecord[],
  cutoff: string,
  horizonDays = HORIZON_DAYS,
): number[] {
  const start = dayNumber(cutoff);
  const end = start + horizonDays;
  return [
    ...new Set(
      claims
        .filter((claim) => {
          const day = dayNumber(claim.publishedAt);
          return day >= start && day < end;
        })
        .map((claim) => claim.orgId),
    ),
  ].sort((a, b) => a - b);
}

export function evaluateWindow(
  cutoff: string,
  predicted: readonly number[],
  actual: readonly number[],
  horizonDays = HORIZON_DAYS,
): WindowResult {
  const predictedSet = new Set(predicted);
  const actualSet = new Set(actual);
  const hits = [...actualSet].filter((id) => predictedSet.has(id)).sort((a, b) => a - b);
  return {
    cutoff,
    horizonEnd: addDays(cutoff, horizonDays),
    predicted: [...predicted],
    actual: [...actualSet],
    hits,
    precision: predicted.length === 0 ? 0 : hits.length / predicted.length,
    recall: actualSet.size === 0 ? null : hits.length / actualSet.size,
  };
}

/** Micro-averaged precision/recall over all windows, with a Wilson interval. */
export function summariseBacktest(windows: readonly WindowResult[]): BacktestResult {
  const predictions = windows.reduce((sum, w) => sum + w.predicted.length, 0);
  const hits = windows.reduce((sum, w) => sum + w.hits.length, 0);
  const victims = windows.reduce((sum, w) => sum + w.actual.length, 0);
  return {
    asOf: windows.at(-1)?.horizonEnd ?? "",
    cutoffs: windows.map((w) => w.cutoff),
    windows: [...windows],
    forecasts: [],
    predictions,
    hits,
    victims,
    precision: predictions === 0 ? 0 : Math.round((hits / predictions) * 10_000) / 10_000,
    recall: victims === 0 ? null : Math.round((hits / victims) * 10_000) / 10_000,
    recallInterval: victims === 0 ? null : intervalleWilson(hits, victims),
  };
}
