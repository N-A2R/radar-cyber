/**
 * Admission rules for messages coming from public forums.
 *
 * A message enters the observatory only when all three conditions hold:
 *  1. it is cyber-relevant (shared relevance engine, frozen config);
 *  2. it is scoped to Nouvelle-Aquitaine, either by its NA-scoped feed or by
 *     naming an NA department or prefecture in the text;
 *  3. it carries no victim personal data. Author names are never ingested.
 *
 * Gray sources are allowed: the source type is not a criterion.
 */
import { createHash } from "node:crypto";
import { CYBER_KEYWORDS, evaluatePertinence, type RelevanceConfig } from "../collectors/pertinence.js";
import { DEPT_LABELS, PREFECTURES } from "../collectors/relevance.js";
import type { ForumSource } from "./sources.js";

export type ForumMessage = {
  id: string;
  sourceId: string;
  title: string;
  summary?: string | null;
  url?: string | null;
  observedAt?: string | null;
};

export type ForumReason =
  | "relevant"
  | "empty"
  | "personal-data"
  | "outside-na"
  | "no-cyber-signal";

export type ForumVerdict = {
  relevant: boolean;
  reason: ForumReason;
  score: number;
  place: string | null;
  sourceId: string;
  dedupKey: string;
};

/** Fixed config: a measurement must not depend on the operator's environment. */
export const FORUM_RELEVANCE: RelevanceConfig = {
  keywords: [
    ...CYBER_KEYWORDS,
    "cyber", "cybersecurity", "cyberattaque", "security", "breach", "data breach",
    "hacked", "malware", "exploit", "vulnerability", "intrusion", "botnet",
  ],
  exclusions: [],
  minScore: 2,
  warnings: [],
};

const NA_PLACES: readonly string[] = [
  ...Object.values(DEPT_LABELS),
  ...PREFECTURES.filter((place) => place.length >= 5),
];

const VICTIM_DATA: readonly RegExp[] = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
  /\b(?:\+33|0)[ .-]?[1-9](?:[ .-]?\d{2}){4}\b/,
  /\b(?:victime|victim)\b[^.!?\n]{0,40}\b[A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?/,
  /\b(?:n[ée]e?|born)\s+le\s+\d{1,2}\/\d{1,2}\/\d{4}/i,
];

function normalize(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Word-boundary match on normalized text, including hyphenated places. */
function mentions(text: string, place: string): boolean {
  const needle = normalize(place).replace(/[\s-]+/g, "[\\s-]+");
  return new RegExp(`(?:^|[^a-z0-9])${needle}(?:[^a-z0-9]|$)`).test(text);
}

export function containsVictimPersonalData(text: string): boolean {
  return VICTIM_DATA.some((pattern) => pattern.test(String(text ?? "")));
}

export function findNaPlace(text: string): string | null {
  const normalized = normalize(text);
  return NA_PLACES.find((place) => mentions(normalized, place)) ?? null;
}

export function dedupKey(message: ForumMessage): string {
  const identity = `${message.sourceId}|${String(message.url ?? "").trim() || message.title.trim()}`;
  return createHash("sha256").update(identity).digest("base64url").slice(0, 32);
}

export function classifyForumMessage(message: ForumMessage, source: ForumSource): ForumVerdict {
  const key = dedupKey(message);
  const title = String(message.title ?? "").trim();
  const summary = String(message.summary ?? "").trim();
  if (title.length === 0) {
    return { relevant: false, reason: "empty", score: 0, place: null, sourceId: message.sourceId, dedupKey: key };
  }
  const text = `${title} ${summary}`;
  if (containsVictimPersonalData(text)) {
    return { relevant: false, reason: "personal-data", score: 0, place: null, sourceId: message.sourceId, dedupKey: key };
  }
  const place = source.scope.kind === "department" ? source.scope.value : findNaPlace(text);
  if (place === null) {
    return { relevant: false, reason: "outside-na", score: 0, place: null, sourceId: message.sourceId, dedupKey: key };
  }
  const verdict = evaluatePertinence(
    { title, summary, url: message.url ?? null },
    { config: FORUM_RELEVANCE },
  );
  if (!verdict.relevant) {
    return { relevant: false, reason: "no-cyber-signal", score: verdict.score, place, sourceId: message.sourceId, dedupKey: key };
  }
  return { relevant: true, reason: "relevant", score: verdict.score, place, sourceId: message.sourceId, dedupKey: key };
}

export type ForumSummary = {
  followedForums: number;
  relevantMessages: number;
  rejected: Record<ForumReason, number>;
};

export function summarizeForumVerdicts(verdicts: readonly ForumVerdict[]): ForumSummary {
  const rejected: Record<ForumReason, number> = {
    relevant: 0, empty: 0, "personal-data": 0, "outside-na": 0, "no-cyber-signal": 0,
  };
  let relevantMessages = 0;
  for (const verdict of verdicts) {
    if (verdict.relevant) relevantMessages++;
    else rejected[verdict.reason]++;
  }
  return {
    followedForums: new Set(verdicts.map((v) => v.sourceId)).size,
    relevantMessages,
    rejected,
  };
}
