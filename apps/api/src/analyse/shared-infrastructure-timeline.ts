/**
 * Adds a temporal dimension to the infrastructure clusters detected for
 * Nouvelle-Aquitaine victims.
 *
 * Only organization ids, infrastructure hosts and observation dates enter this
 * module: no victim name, no claim body, no e-mail and no personal data. It
 * reads the clusters produced by the deterministic detector and dates each of
 * them from the observations that actually created the shared anchor.
 *
 * A cluster is "dated" when its anchor was observed on at least two distinct
 * UTC days. The reuse delay is the number of days between the first and the
 * last of those observations: it measures how long a host kept linking victims,
 * not who those victims are.
 */
import {
  normalizeInfrastructure,
  type InfrastructureKind,
  type SharedInfrastructureDetection,
} from "./shared-infrastructure.js";

export type DatedInfrastructureObservation = {
  orgId: number;
  kind: InfrastructureKind;
  value: string;
  observedAt: string | null;
};

export type ClusterTimeline = {
  id: string;
  firstSeen: string | null;
  lastSeen: string | null;
  datedObservations: number;
  reuseDays: number;
  dated: boolean;
};

export type InfrastructureTimeline = {
  clusterCount: number;
  datedClusters: number;
  medianReuseDays: number | null;
  longestReuseDays: number;
  observationsWithDates: number;
  clusterTimelines: ClusterTimeline[];
};

const DAY_MS = 86_400_000;

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/**
 * Dates every detected cluster from its own victim/anchor observations.
 * Observations with no date, an invalid date, another victim or another anchor
 * are ignored; input order never changes the result.
 */
export function buildInfrastructureTimeline(
  detection: SharedInfrastructureDetection,
  observations: readonly DatedInfrastructureObservation[],
): InfrastructureTimeline {
  const clusterTimelines: ClusterTimeline[] = detection.clusters.map((cluster) => {
    const victims = new Set(cluster.victims);
    const anchors = new Set(cluster.anchors.map((anchor) => anchor.value));
    const days = new Set<string>();
    let first: number | null = null;
    let last: number | null = null;
    let datedObservations = 0;

    for (const observation of observations) {
      if (!victims.has(observation.orgId)) continue;
      const value = normalizeInfrastructure(observation);
      if (value === null || !anchors.has(value)) continue;
      const ms = parseDate(observation.observedAt);
      if (ms === null) continue;
      datedObservations += 1;
      days.add(new Date(ms).toISOString().slice(0, 10));
      if (first === null || ms < first) first = ms;
      if (last === null || ms > last) last = ms;
    }

    const sortedDays = [...days].sort();
    const firstDay = sortedDays[0];
    const lastDay = sortedDays[sortedDays.length - 1];
    const reuseDays =
      firstDay !== undefined && lastDay !== undefined
        ? Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / DAY_MS)
        : 0;
    return {
      id: cluster.id,
      firstSeen: first === null ? null : new Date(first).toISOString(),
      lastSeen: last === null ? null : new Date(last).toISOString(),
      datedObservations,
      reuseDays,
      dated: days.size >= 2,
    };
  });

  const spans = clusterTimelines.filter((timeline) => timeline.dated).map((timeline) => timeline.reuseDays);

  return {
    clusterCount: clusterTimelines.length,
    datedClusters: spans.length,
    medianReuseDays: median(spans),
    longestReuseDays: spans.reduce((longest, days) => Math.max(longest, days), 0),
    observationsWithDates: clusterTimelines.reduce(
      (total, timeline) => total + timeline.datedObservations,
      0,
    ),
    clusterTimelines,
  };
}
