/**
 * Reproducible confirmation of the archived Nouvelle-Aquitaine typo candidates.
 *
 * The exhaustive sweep stored one record per DNS-active variant in 25 batches.
 * A raw alarm is "confirmed with proof" when that record proves the three
 * properties that define the candidate: DNS activity at measurement time,
 * an official base domain from the Nouvelle-Aquitaine referential, and a
 * similarity of at least 0.8. This confirms the candidate, never the
 * usurpation: the archived decisions are counted separately.
 */
export const NA_DEPARTMENTS: Record<string, true> = {
  "16": true, "17": true, "18": true, "23": true, "24": true, "33": true,
  "40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

const KINDS: Record<string, true> = {
  omission: true, transposition: true, substitution: true, tiret: true, homoglyphe: true, tld: true,
};
const DOMAIN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;
const ALARM_SIMILARITY = 0.8;

export interface ArchivedActive {
  domain: string;
  base: string;
  orgName: string;
  kind: string;
  similarity: number;
  certificate: string | null;
  pageTitle: string | null;
}

export interface ArchivedBatch {
  activeList: ArchivedActive[];
  detections: { domain: string }[];
}

export interface NaTarget {
  domain: string;
  dept: string | null;
}

export interface CandidateConfirmation {
  candidates: number;
  confirmed: number;
  usurpations: number;
  rejected: { domain: string; reason: string }[];
}

/** Pure replay of the alarm definition against the archived public probe data. */
export function confirmerCandidats(batches: ArchivedBatch[], targets: NaTarget[]): CandidateConfirmation {
  const official = new Map<string, true>();
  for (const target of targets) {
    if (target.dept && NA_DEPARTMENTS[target.dept] && DOMAIN.test(target.domain.toLowerCase())) {
      official.set(target.domain.toLowerCase(), true);
    }
  }

  const rejected: { domain: string; reason: string }[] = [];
  let candidates = 0;
  let confirmed = 0;
  for (const batch of batches) {
    for (const record of batch.activeList) {
      if (record.similarity < ALARM_SIMILARITY) continue;
      candidates++;
      const domain = record.domain.toLowerCase();
      const reason =
        !DOMAIN.test(domain) || domain === record.base.toLowerCase() ? "invalid-domain"
        : !official.has(record.base.toLowerCase()) ? "base-outside-na-referential"
        : !KINDS[record.kind] ? "unknown-variant-kind"
        : !record.orgName.trim() ? "missing-organisation"
        : null;
      if (reason) rejected.push({ domain, reason });
      else confirmed++;
    }
  }

  const usurpations = new Set(batches.flatMap((batch) => batch.detections.map((d) => d.domain.toLowerCase()))).size;
  return { candidates, confirmed, usurpations, rejected };
}
