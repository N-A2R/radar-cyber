/**
 * Independent rubric for automatic incident summaries.
 *
 * The grader never calls the generator. It receives a finished summary, the
 * verified source facts and the frozen human reference, and scores five
 * observable criteria. Scores are integers so the measurement is rewritable,
 * comparable across runs and reproducible without a network or paid service.
 */
import { naDepartmentCode } from "../geo/na-departments.js";
import {
  normaliseKey,
  redactPersonalData,
  wordCount,
  type IncidentInput,
  type IncidentSummary,
} from "./incident-summary.js";

export const QUALITY_THRESHOLD = 70;
export const CRITERIA_MAX = Object.freeze({
  coverage: 40,
  faithfulness: 25,
  privacy: 20,
  scope: 10,
  concision: 5,
});

const STOPWORDS: Readonly<Record<string, true>> = {
  les: true, des: true, une: true, dans: true, son: true, ses: true, sur: true, par: true,
  pour: true, avec: true, sans: true, est: true, sont: true, ont: true, ete: true, ait: true,
  aux: true, pas: true, plus: true, mai: true, mais: true, que: true, qui: true, quoi: true,
  dont: true, ou: true, leur: true, leurs: true, cet: true, cette: true, ces: true,
  celle: true, celui: true, puis: true, entre: true, elle: true, ils: true, elles: true,
  nous: true, vous: true, au: true, du: true, de: true, la: true, le: true, un: true,
  et: true, en: true, ne: true, se: true, ce: true, il: true, si: true, comme: true,
  fait: true, faire: true, peut: true,
};

/** Content words: accent-insensitive, lowercase, stopwords removed. Numbers count. */
export function contentTokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS[token]);
}

export type GradeReason =
  | "low-coverage"
  | "ungrounded-number"
  | "personal-data"
  | "missing-department"
  | "missing-organization"
  | "outside-na"
  | "out-of-length-range";

export type SummaryGrade = {
  incidentId: string;
  coverage: number;
  faithfulness: number;
  privacy: number;
  scope: number;
  concision: number;
  total: number;
  passed: boolean;
  reasons: GradeReason[];
};

function numbers(text: string): string[] {
  return (text.match(/\d[\d\s.,’'-]*/g) ?? [])
    .map((value) => value.replace(/[\s.,’'-]/g, ""))
    .filter(Boolean);
}

function coverageScore(summaryText: string, referenceText: string): { points: number; low: boolean } {
  const reference = new Set(contentTokens(referenceText));
  if (reference.size === 0) return { points: 0, low: true };
  const produced = new Set(contentTokens(summaryText));
  let hits = 0;
  for (const token of reference) if (produced.has(token)) hits += 1;
  const ratio = hits / reference.size;
  return { points: Math.round(ratio * CRITERIA_MAX.coverage), low: ratio < 0.5 };
}

function faithfulnessScore(summaryText: string, input: IncidentInput): { points: number; ungrounded: boolean } {
  const grounding = new Set(numbers([
    input.title,
    input.excerpt,
    input.sourceText,
    (input.incidentDate ?? "").replace(/-/g, "|"),
    (input.publishedAt ?? "").replace(/-/g, "|"),
    input.organization,
    input.department,
  ].join("|")));
  const unexpected = numbers(summaryText).filter((value) => value.length >= 2 && !grounding.has(value));
  const penalty = Math.min(unexpected.length * 5, CRITERIA_MAX.faithfulness);
  return { points: CRITERIA_MAX.faithfulness - penalty, ungrounded: unexpected.length > 0 };
}

function concisionScore(count: number): { points: number; outOfRange: boolean } {
  if (count >= 25 && count <= 80) return { points: 5, outOfRange: false };
  if (count >= 15 && count < 100) return { points: 2, outOfRange: true };
  return { points: 0, outOfRange: true };
}

/**
 * Score one summary. `referenceText` is the frozen human-verified summary;
 * it is used only here, never by the generator.
 */
export function gradeSummary(
  summary: IncidentSummary,
  input: IncidentInput,
  referenceText: string,
): SummaryGrade {
  const summaryText = `${summary.headline} ${summary.lead} ${summary.sourceLabel}`;
  const reasons: GradeReason[] = [];
  const coverage = coverageScore(summaryText, referenceText);
  if (coverage.low) reasons.push("low-coverage");
  const faithfulness = faithfulnessScore(`${summary.headline} ${summary.lead}`, input);
  if (faithfulness.ungrounded) reasons.push("ungrounded-number");

  const privacyCheck = redactPersonalData(summaryText);
  if (privacyCheck.count > 0) reasons.push("personal-data");
  const privacy = privacyCheck.count > 0 ? 0 : CRITERIA_MAX.privacy;

  const dept = normaliseKey(input.department);
  const org = normaliseKey(input.organization);
  const summaryKey = normaliseKey(summaryText);
  const hasDepartment = dept.length > 0 && summaryKey.includes(dept);
  const hasOrganization = org.length > 0 && summaryKey.includes(org);
  if (!hasDepartment) reasons.push("missing-department");
  if (!hasOrganization) reasons.push("missing-organization");
  const scope = (hasDepartment ? 6 : 0) + (hasOrganization ? 4 : 0);
  if (naDepartmentCode(input.department) !== summary.departmentCode) {
    reasons.push("outside-na");
  }

  const concision = concisionScore(summary.wordCount);
  if (concision.outOfRange) reasons.push("out-of-length-range");

  const total = coverage.points + faithfulness.points + privacy + scope + concision.points;
  return {
    incidentId: summary.incidentId,
    coverage: coverage.points,
    faithfulness: faithfulness.points,
    privacy,
    scope,
    concision: concision.points,
    total,
    passed: total >= QUALITY_THRESHOLD,
    reasons,
  };
}
