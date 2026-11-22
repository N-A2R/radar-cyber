/**
 * Publication verdict for Nouvelle-Aquitaine incidents.
 *
 * Roadmap 3 ans, « Délai de publication » : an incident may be named once a
 * second independent source confirms it, or 48 h after the first report when
 * the delay is documented. Every incident receives an explicit verdict; the
 * decision time is computed from the claim already stored, never guessed.
 *
 * Pure, read-only and privacy-safe: only the truncated victim hash travels
 * out of the corroboration report, never a title or a victim detail.
 */
import type { CorroborationReport } from "./incident-corroboration.js";

/** 48 h after the first report, a single source may be named with a documented delay. */
export const PUBLICATION_DELAY_MS = 48 * 3_600_000;

export type VerdictKind = "second_source" | "after_delay" | "pending";

export type IncidentVerdict = {
  victimHash: string;
  verdict: VerdictKind;
  firstClaimAt: string;
  decisionAt: string;
  /** Hours elapsed since the first claim at the measurement instant. */
  ageHours: number;
  publishers: number;
};

export type VerdictSummary = {
  incidents: number;
  secondSource: number;
  afterDelay: number;
  pending: number;
  /** Median age of the incidents still waiting for the 48 h delay. */
  medianPendingAgeHours: number;
};

export type Verdicts = {
  incidents: IncidentVerdict[];
  summary: VerdictSummary;
};

function hours(milliseconds: number): number {
  return Math.round(Math.max(0, milliseconds) / 3_600_000 * 100) / 100;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2 * 100) / 100;
}

/** Assigns one verdict per incident, at an explicit and reproducible instant. */
export function publicationVerdicts(report: CorroborationReport, asOf: string | number): Verdicts {
  const now = typeof asOf === "number" ? asOf : Date.parse(asOf);
  if (!Number.isFinite(now)) throw new Error("Invalid measurement instant");

  const incidents: IncidentVerdict[] = [];
  for (const cluster of report.clusters) {
    if (!cluster.naIncident || cluster.incidentEvents === 0) continue;
    const first = Date.parse(cluster.firstClaimAt);
    if (!Number.isFinite(first)) continue;
    const ageHours = hours(now - first);
    const verdict: VerdictKind = cluster.corroborated
      ? "second_source"
      : now - first >= PUBLICATION_DELAY_MS ? "after_delay" : "pending";
    incidents.push({
      victimHash: cluster.victimHash,
      verdict,
      firstClaimAt: cluster.firstClaimAt,
      decisionAt: verdict === "second_source"
        ? cluster.firstClaimAt
        : new Date(first + PUBLICATION_DELAY_MS).toISOString(),
      ageHours,
      publishers: cluster.publishers.length,
    });
  }

  return {
    incidents,
    summary: {
      incidents: incidents.length,
      secondSource: incidents.filter((item) => item.verdict === "second_source").length,
      afterDelay: incidents.filter((item) => item.verdict === "after_delay").length,
      pending: incidents.filter((item) => item.verdict === "pending").length,
      medianPendingAgeHours: median(
        incidents.filter((item) => item.verdict === "pending").map((item) => item.ageHours),
      ),
    },
  };
}
