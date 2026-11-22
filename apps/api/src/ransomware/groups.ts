/**
 * Ransomware group tracking — naming and evidence rules.
 *
 * Group names come from our own collected claims. A victim is recorded only
 * when a claim or an event points at an organisation of the referential whose
 * department is in Nouvelle-Aquitaine. The raw hint is never persisted: the
 * victim row keeps the org id, a public source URL and the match type only.
 */
import { extractDomain, normalizeName } from "../quarantine/promote.js";

export const NA_DEPARTMENTS = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

export const TRACKED_GROUP_LIMIT = 50;
/** Minimum trigram similarity for a curated organisation name. */
export const CURATED_NAME_THRESHOLD = 0.75;

const GROUP_ALIASES: Record<string, string> = {
  lockbit2: "LockBit 2.0",
  lockbit20: "LockBit 2.0",
  lockbit3: "LockBit 3.0",
  lockbit30: "LockBit 3.0",
  ransomhub: "RansomHub",
  thegentlemen: "The Gentlemen",
  incransom: "Inc Ransom",
  alphv: "ALPHV",
  blackcat: "BlackCat",
  "8base": "8Base",
};

const GENERIC_NAME_TOKENS: Record<string, true> = {
  group: true, groupe: true, company: true, compagnie: true, corp: true,
  corporation: true, inc: true, ltd: true, limited: true, llc: true, plc: true,
  sarl: true, sas: true, sa: true, com: true, org: true, net: true,
  www: true, http: true, https: true, services: true, service: true,
  solutions: true, solution: true, technology: true, technologies: true,
  consulting: true, advisory: true, systems: true,
};

export type MatchType = "domain" | "name" | "event" | "curated";

export type VictimEvidence = {
  slug: string;

  orgId: number;
  orgName: string;
  dept: string;
  source: string;
  sourceUrl: string | null;
  claimId: number | null;
  claimedAt: string | null;
  matchType: MatchType;
  /** Trigram score, kept for curated evidence only. */
  score?: number;
};

export type Victim = Omit<VictimEvidence, "score">;

/** Canonical display name of a group, stable across source spellings. */
export function normalizeGroupName(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Unknown group";
  const key = normalizeName(value).replace(/ /g, "");
  return GROUP_ALIASES[key] ?? value.replace(/\s+/g, " ");
}

/** Stable identifier used for grouping and for the API. */
export function groupSlug(name: string): string {
  return normalizeName(name).replace(/ /g, "-") || "unknown-group";
}

/**
 * A hint is usable only when it describes an organisation, not a person.
 * E-mail addresses and phone numbers are dropped before any matching.
 */
export function safeHint(hint: string | null | undefined): string | null {
  const value = String(hint ?? "").trim();
  if (value.length < 4 || value.length > 300) return null;
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(value)) return null;
  if (/\+?\d[\d\s().-]{7,}\d/.test(value)) return null;
  return value;
}

/** Domain of a hint, or null when the hint is not a domain/URL. */
export function domainFromHint(hint: string): string | null {
  return extractDomain(hint);
}

/**
 * A name is distinctive enough for exact matching only when several long
 * tokens remain after removing legal suffixes. Two-letter acronyms such as
 * "TPI" match hundreds of unrelated organisations and are rejected.
 */
export function distinctiveNameFromHint(hint: string): string | null {
  if (domainFromHint(hint)) return null;
  const normalized = normalizeName(hint);
  const tokens = normalized.split(" ").filter(Boolean);
  if (normalized.length < 10 || tokens.length < 2) return null;
  if (tokens.some((t) => t.length < 3 || GENERIC_NAME_TOKENS[t])) return null;
  return normalized;
}

/** Public URL only: strip credentials, query strings and fragments. */
export function safeSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().slice(0, 600);
  } catch {
    return null;
  }
}

const EVIDENCE_RANK: Record<MatchType, number> = {
  curated: 4,
  domain: 3,
  event: 2,
  name: 1,
};

/** One row per group and organisation, keeping the strongest evidence. */
export function deduplicateVictims(victims: readonly VictimEvidence[]): Victim[] {
  const byKey = new Map<string, VictimEvidence>();
  for (const victim of victims) {
    const key = `${victim.slug}:${victim.orgId}`;
    const previous = byKey.get(key);
    if (!previous || EVIDENCE_RANK[victim.matchType] > EVIDENCE_RANK[previous.matchType]) {
      byKey.set(key, victim);
    }
  }
  return [...byKey.values()].map(({ score: _score, ...victim }) => victim);
}

/** Tracks every group with an NA victim first, then fills up to the limit. */
export function selectTrackedGroups(
  candidateSlugs: Iterable<string>,
  counts: readonly { slug: string; claims: number }[],
  limit = TRACKED_GROUP_LIMIT,
): string[] {
  const selected = new Set(candidateSlugs);
  const byVolume = [...counts].sort(
    (a, b) => b.claims - a.claims || a.slug.localeCompare(b.slug, "en"),
  );
  for (const group of byVolume) {
    if (selected.size >= limit) break;
    selected.add(group.slug);
  }
  return [...selected].sort((a, b) => a.localeCompare(b, "en"));
}

/** French department labels used by the curated corpus. */
export const CORPUS_DEPARTMENTS: Record<string, string> = {
  Charente: "16",
  "Charente-Maritime": "17",
  Corrèze: "19",
  Creuse: "23",
  Dordogne: "24",
  Gironde: "33",
  Landes: "40",
  "Lot-et-Garonne": "47",
  "Pyrénées-Atlantiques": "64",
  "Deux-Sèvres": "79",
  Vienne: "86",
  "Haute-Vienne": "87",
};
