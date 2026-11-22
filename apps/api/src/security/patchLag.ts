/**
 * Patch-lag proxy from the frozen, free NVD corpus.
 *
 * No per-organisation patch telemetry exists in the region. The measurable
 * proxy is the delay between public disclosure of a CVE relevant to an
 * observed Nouvelle-Aquitaine technology and the regional corpus capture.
 * It is reported as a proxy, never as a claim about installed versions.
 */
import {
  alertNamesTechnology,
  checkCveRelevance,
  type NvdCveRecord,
  type TechnologyObservation,
} from "../cveNa/index.js";

type AlertCorpus = { certfr?: { items?: { title?: string; cveIds?: string[] }[] } };

export type PatchLagMeasurement = { days: number; relevantCves: number };

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Median disclosure-to-capture delay in days for relevant CVEs. */
export function measurePatchLagDays(
  cves: readonly NvdCveRecord[],
  technologies: readonly TechnologyObservation[],
  alerts: AlertCorpus,
  capturedAt: string,
): PatchLagMeasurement {
  const relevant = new Set<string>();
  for (const cve of cves) {
    if (checkCveRelevance(cve, technologies).relevant) relevant.add(cve.id);
  }
  for (const item of alerts.certfr?.items ?? []) {
    for (const name of alertNamesTechnology(item.title ?? "", technologies)) {
      if (name.length === 0) continue;
      for (const id of item.cveIds ?? []) relevant.add(id);
    }
  }
  const captured = new Date(capturedAt).getTime();
  const lags: number[] = [];
  for (const cve of cves) {
    if (!relevant.has(cve.id)) continue;
    const published = Date.parse(cve.published ?? "");
    if (!Number.isFinite(published)) continue;
    lags.push((captured - published) / 86_400_000);
  }
  return { days: Math.round(median(lags)), relevantCves: relevant.size };
}
