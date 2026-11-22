/**
 * Freshness guard for series anomalies.
 *
 * A burst built from records that were collected long after they were
 * observed is a historical import, not a new signal. Emitting it would report
 * an import batch as a live anomaly. This module is pure: it only uses the
 * timing supplied by the caller, never the clock or the database.
 */
export const DAY_MS = 86_400_000;
/** A feed may be a few days late without turning its burst into an import. */
export const DEFAULT_MAX_LAG_DAYS = 7;
/** At least half of the evidence must be freshly collected to keep an alert. */
export const DEFAULT_MIN_FRESH_SHARE = 0.5;

export type EvidenceTiming = {
  observedAt: string | number | Date;
  collectedAt: string | number | Date;
};

export type FreshnessOptions = {
  maxLagDays?: number;
  minFreshShare?: number;
};

export type FreshnessVerdict = {
  keep: boolean;
  fresh: number;
  total: number;
  maxLagDays: number | null;
  reason: string;
};

export type AlertWithEvidence = {
  cle: string;
  faits: readonly (string | number)[];
};

export type RejectedAlert = {
  cle: string;
  verdict: FreshnessVerdict;
};

function instant(value: string | number | Date): number | null {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/** Collection delay in days; null when timing is unusable. Skew counts as fresh. */
export function collectionLagDays(evidence: EvidenceTiming): number | null {
  const observed = instant(evidence.observedAt);
  const collected = instant(evidence.collectedAt);
  if (observed === null || collected === null) return null;
  return Math.max(0, (collected - observed) / DAY_MS);
}

/** Decide whether a burst is current enough to be reported as an anomaly. */
export function assessFreshness(
  evidence: readonly EvidenceTiming[],
  options: FreshnessOptions = {},
): FreshnessVerdict {
  const maxLagDays = options.maxLagDays ?? DEFAULT_MAX_LAG_DAYS;
  const minFreshShare = options.minFreshShare ?? DEFAULT_MIN_FRESH_SHARE;
  if (!Number.isFinite(maxLagDays) || maxLagDays < 0) throw new RangeError("maxLagDays must be >= 0");
  if (!Number.isFinite(minFreshShare) || minFreshShare <= 0 || minFreshShare > 1) {
    throw new RangeError("minFreshShare must be in (0, 1]");
  }

  const lags = evidence
    .map(collectionLagDays)
    .filter((lag): lag is number => lag !== null);
  if (lags.length === 0) {
    return {
      keep: true,
      fresh: 0,
      total: 0,
      maxLagDays: null,
      reason: "no usable timing; keeping the alert rather than hiding a signal",
    };
  }

  const fresh = lags.filter((lag) => lag <= maxLagDays).length;
  const worst = Math.round(Math.max(...lags) * 100) / 100;
  const keep = fresh / lags.length >= minFreshShare;
  return {
    keep,
    fresh,
    total: lags.length,
    maxLagDays: worst,
    reason: keep
      ? `${fresh}/${lags.length} records collected within ${maxLagDays} day(s); oldest delay ${worst} day(s)`
      : `${fresh}/${lags.length} records collected within ${maxLagDays} day(s); oldest delay ${worst} day(s): historical import`,
  };
}

/** Drop alerts whose evidence is mostly backfilled, keeping the rest in order. */
export function filterFreshAlerts<T extends AlertWithEvidence>(
  alerts: readonly T[],
  timingsById: ReadonlyMap<string, EvidenceTiming>,
  options: FreshnessOptions = {},
): { alerts: T[]; rejected: RejectedAlert[] } {
  const alertsKept: T[] = [];
  const rejected: RejectedAlert[] = [];
  for (const alert of alerts) {
    const evidence = alert.faits
      .map((id) => timingsById.get(String(id)))
      .filter((timing): timing is EvidenceTiming => timing !== undefined);
    const verdict = assessFreshness(evidence, options);
    if (verdict.keep) alertsKept.push(alert);
    else rejected.push({ cle: alert.cle, verdict });
  }
  return { alerts: alertsKept, rejected };
}
