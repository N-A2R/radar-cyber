/**
 * Actor-to-group attribution — deterministic, explainable and offline.
 *
 * Claim feeds spell the same threat actor in many ways ("lockbit3",
 * "LockBit 3.0", "The Gentlemen", "thegentlemen"). This module maps a raw
 * actor label to a tracked group and returns the confidence behind that
 * decision. It never sees a victim: only actor labels, source counts and
 * public group names are used.
 */

export const NA_DEPARTMENTS = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

export type GroupCandidate = { slug: string; name: string };
export type ActorObservation = { actor: string; sources: number; claims: number };
export type ConfidenceLevel = "high" | "medium" | "low";
export type AttributionMethod = "exact" | "alias" | "prefix" | "fuzzy";

export type Attribution = {
  actor: string;
  actorKey: string;
  groupSlug: string;
  groupName: string;
  confidence: number;
  level: ConfidenceLevel;
  method: AttributionMethod;
  sources: number;
  claims: number;
};

/** Words that carry no identity and are dropped from the end of a label. */
const GENERIC_SUFFIXES: Record<string, true> = {
  ransomware: true, ransom: true, group: true, gang: true, crew: true, team: true,
  leaks: true, leak: true, blog: true, hacker: true, hackers: true, cyber: true,
};

/** Numbering variants that normalization alone cannot reconcile. */
const ALIASES: Record<string, string> = {
  lockbit3: "lockbit30",
  lockbit2: "lockbit20",
  lockbit31: "lockbit30",
  lockbit21: "lockbit20",
};

/** Strip accents, case, punctuation and generic suffixes from an actor label. */
export function normalizeActorKey(raw: string | null | undefined): string {
  const flat = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = flat.split(" ").filter(Boolean);
  while (tokens.length > 1 && GENERIC_SUFFIXES[tokens[tokens.length - 1]!] === true) {
    tokens.pop();
  }
  return tokens.join("");
}

/** A label is safe when it can only be an actor name, never a person. */
export function isSafeActorLabel(raw: string | null | undefined): boolean {
  const value = String(raw ?? "").trim();
  if (value.length < 3 || value.length > 80) return false;
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(value)) return false;
  if (/\+?\d[\d\s().-]{7,}\d/.test(value)) return false;
  return normalizeActorKey(value).length >= 3;
}

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 90) return "high";
  if (score >= 75) return "medium";
  return "low";
}

/** Bounded Levenshtein: stop as soon as the answer exceeds the threshold. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      rowMinimum = Math.min(rowMinimum, current[j]!);
    }
    if (rowMinimum > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}


/**
 * Attribute one observation to a group. A candidate is accepted only when it
 * is unique: two groups with the same normalized key are ambiguous, so neither
 * is claimed. Returns null when the evidence is too weak.
 */
export function attributeActor(
  observation: ActorObservation,
  groups: readonly GroupCandidate[],
): Attribution | null {
  const key = normalizeActorKey(observation.actor);
  if (!isSafeActorLabel(observation.actor) || key.length < 3) return null;

  const byKey = new Map<string, Set<string>>();
  const bySlug = new Map<string, GroupCandidate>();
  for (const group of groups) {
    bySlug.set(group.slug, group);
    for (const candidateKey of new Set([normalizeActorKey(group.slug), normalizeActorKey(group.name)])) {
      const slugs = byKey.get(candidateKey) ?? new Set<string>();
      slugs.add(group.slug);
      byKey.set(candidateKey, slugs);
    }
  }

  const resolve = (candidateKey: string | undefined): GroupCandidate | null => {
    const slugs = candidateKey ? byKey.get(candidateKey) : undefined;
    if (!slugs || slugs.size !== 1) return null;
    return bySlug.get([...slugs][0]!) ?? null;
  };

  let group = resolve(key);
  let method: AttributionMethod = "exact";
  let base = 95;
  if (!group) {
    group = resolve(ALIASES[key]);
    method = "alias";
    base = 90;
  }
  if (!group) {
    const matches = [...bySlug.values()].filter((candidate) =>
      [...new Set([normalizeActorKey(candidate.slug), normalizeActorKey(candidate.name)])].some((k) =>
        k.length >= 5 && (k.startsWith(key) || key.startsWith(k))),
    );
    if (matches.length === 1) {
      group = matches[0]!;
      method = "prefix";
      base = 72;
    }
  }
  if (!group) {
    // Only a single typo is safe: two edits silently join distinct group names.
    const maxDistance = 1;
    const matches = [...bySlug.values()].filter((candidate) =>
      [...new Set([normalizeActorKey(candidate.slug), normalizeActorKey(candidate.name)])].some((k) =>
        k.length >= 7 && editDistance(key, k, maxDistance) <= maxDistance),
    );
    if (matches.length === 1) {
      group = matches[0]!;
      method = "fuzzy";
      base = 62;
    }
  }
  if (!group) return null;

  // Independent sources corroborate a label; volume alone never does.
  const bonus = observation.sources >= 3 ? 5 : observation.sources >= 2 ? 3 : 0;
  const confidence = Math.min(100, base + bonus);
  return {
    actor: observation.actor.trim(),
    actorKey: key,
    groupSlug: group.slug,
    groupName: group.name,
    confidence,
    level: confidenceLevel(confidence),
    method,
    sources: observation.sources,
    claims: observation.claims,
  };
}

/** One attribution per actor key, strongest evidence first. */
export function dedupeAttributions(items: readonly Attribution[]): Attribution[] {
  const byKey = new Map<string, Attribution>();
  for (const item of items) {
    const previous = byKey.get(item.actorKey);
    if (!previous || item.confidence > previous.confidence ||
        (item.confidence === previous.confidence && item.actor.localeCompare(previous.actor, "en") < 0)) {
      byKey.set(item.actorKey, item);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.confidence - a.confidence || a.actor.localeCompare(b.actor, "en"),
  );
}
