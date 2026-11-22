/**
 * Dependency-free engine for repeatable binary model benchmarks.
 *
 * A case carries its input, but a verdict only carries the case id, the
 * expected label and the prediction: raw text (and therefore any personal
 * data) can never leak into a published result.
 */
import { createHash } from "node:crypto";

export type BinaryLabel = "positive" | "negative";

/** `null` means the model abstained: the case is counted, not scored. */
export type BinaryPrediction = boolean | null;

export interface EvalCase<Input> {
  id: string;
  input: Input;
  expected: BinaryLabel;
}

export interface BinaryModel<Input> {
  name: string;
  version: string;
  predict(input: Input): BinaryPrediction;
}

export interface EvalMetrics {
  cases: number;
  evaluated: number;
  abstained: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  falsePositiveRate: number | null;
}

export interface CaseVerdict {
  id: string;
  expected: BinaryLabel;
  predicted: BinaryPrediction;
}

export interface SuiteResult {
  model: string;
  version: string;
  corpusFingerprint: string;
  metrics: EvalMetrics;
  verdicts: CaseVerdict[];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** Rejects ambiguous corpora before a single model is called. */
export function validateCases<Input>(cases: readonly EvalCase<Input>[]): void {
  if (cases.length === 0) throw new Error("Bench corpus is empty");
  const ids = new Set<string>();
  for (const item of cases) {
    if (typeof item.id !== "string" || item.id.length === 0) {
      throw new Error("Bench case is missing an id");
    }
    if (ids.has(item.id)) throw new Error(`Duplicate bench case id: ${item.id}`);
    ids.add(item.id);
    if (item.expected !== "positive" && item.expected !== "negative") {
      throw new Error(`Invalid expected label for case ${item.id}: ${String(item.expected)}`);
    }
  }
}

/** Stable identity of a corpus: ids and labels only, never input text. */
export function corpusFingerprint(cases: readonly EvalCase<unknown>[]): string {
  const lines = cases.map((item) => `${item.id}:${item.expected}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** Scores one model over one corpus. Model exceptions are not hidden. */
export function runBinaryBench<Input>(
  cases: readonly EvalCase<Input>[],
  model: BinaryModel<Input>,
): SuiteResult {
  validateCases(cases);
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  let abstained = 0;
  const verdicts: CaseVerdict[] = [];

  for (const item of cases) {
    const predicted = model.predict(item.input);
    verdicts.push({ id: item.id, expected: item.expected, predicted });
    if (predicted === null) {
      abstained += 1;
      continue;
    }
    if (predicted && item.expected === "positive") truePositives += 1;
    else if (predicted && item.expected === "negative") falsePositives += 1;
    else if (!predicted && item.expected === "negative") trueNegatives += 1;
    else falseNegatives += 1;
  }

  const evaluated = cases.length - abstained;
  const metrics: EvalMetrics = {
    cases: cases.length,
    evaluated,
    abstained,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    accuracy: ratio(truePositives + trueNegatives, evaluated),
    precision: ratio(truePositives, truePositives + falsePositives),
    recall: ratio(truePositives, truePositives + falseNegatives),
    falsePositiveRate: ratio(falsePositives, falsePositives + trueNegatives),
  };

  return {
    model: model.name,
    version: model.version,
    corpusFingerprint: corpusFingerprint(cases),
    metrics,
    verdicts,
  };
}

const RATE_KEYS = ["accuracy", "precision", "recall", "falsePositiveRate"] as const;
type RateKey = (typeof RATE_KEYS)[number];

/** Continuous evaluation: a new run must not silently regress on a baseline. */
export function compareWithBaseline(current: EvalMetrics, baseline: EvalMetrics): string[] {
  const problems: string[] = [];
  if (current.cases !== baseline.cases) {
    problems.push(`case count changed from ${baseline.cases} to ${current.cases}`);
  }
  if (current.abstained > baseline.abstained) {
    problems.push(`abstained increased from ${baseline.abstained} to ${current.abstained}`);
  }
  for (const key of RATE_KEYS) {
    const before = baseline[key];
    const after = current[key];
    if (before === null || after === null) continue; // null is non-comparable, not zero
    const higherIsBetter = key !== "falsePositiveRate";
    if ((higherIsBetter && after < before) || (!higherIsBetter && after > before)) {
      problems.push(`${key} regressed from ${before.toFixed(4)} to ${after.toFixed(4)}`);
    }
  }
  return problems;
}

