/**
 * Tests for the continuous model benchmark (src/eval).
 *
 * One behaviour per test. All cases are local fixtures: no database write, no
 * network call and no victim data is needed to exercise the bench engine.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools } from "../src/db.js";
import {
  compareWithBaseline,
  corpusFingerprint,
  runBinaryBench,
  validateCases,
  type BinaryModel,
  type EvalCase,
} from "../src/eval/binary-bench.js";
import { buildCases, hasNaAnchor, parseCorpus } from "../src/eval/corpus.js";
import { falseEventGateModel, relevanceGateModel } from "../src/eval/models.js";
import { loadRelevanceConfig } from "../src/collectors/pertinence.js";

after(async () => {
  await closePools();
});

function model(name: string, predictions: Record<string, boolean | null>): BinaryModel<{ text: string }> {
  return {
    name,
    version: "test-1",
    predict: (input) => (input.text in predictions ? predictions[input.text] : false),
  };
}

function cases(entries: ReadonlyArray<[string, "positive" | "negative"]>): EvalCase<{ text: string }>[] {
  return entries.map(([id, expected]) => ({ id, input: { text: id }, expected }));
}

test("scores every outcome of the confusion matrix", () => {
  const result = runBinaryBench(
    cases([["tp", "positive"], ["fp", "negative"], ["tn", "negative"], ["fn", "positive"]]),
    model("four-outcomes", { tp: true, fp: true, tn: false, fn: false }),
  );
  assert.deepEqual(
    [result.metrics.truePositives, result.metrics.falsePositives, result.metrics.trueNegatives, result.metrics.falseNegatives],
    [1, 1, 1, 1],
  );
  assert.equal(result.metrics.cases, 4);
  assert.equal(result.metrics.evaluated, 4);
  assert.equal(result.metrics.accuracy, 0.5);
  assert.equal(result.metrics.precision, 0.5);
  assert.equal(result.metrics.recall, 0.5);
  assert.equal(result.metrics.falsePositiveRate, 0.5);
});

test("counts abstentions outside the rate denominators", () => {
  const result = runBinaryBench(
    cases([["answered", "positive"], ["skipped", "negative"]]),
    model("abstaining", { answered: true, skipped: null }),
  );
  assert.equal(result.metrics.cases, 2);
  assert.equal(result.metrics.evaluated, 1);
  assert.equal(result.metrics.abstained, 1);
  assert.equal(result.metrics.accuracy, 1);
  assert.deepEqual(result.verdicts.map((verdict) => verdict.predicted), [true, null]);
});

test("publishes null rates instead of inventing 0/0", () => {
  const result = runBinaryBench(
    cases([["item", "positive"]]),
    model("reject-all", { item: false }),
  );
  assert.equal(result.metrics.precision, null);
  assert.equal(result.metrics.falsePositiveRate, null);
  assert.equal(result.metrics.recall, 0);
});

test("rejects duplicate case ids before scoring", () => {
  assert.throws(() => validateCases(cases([["same", "positive"], ["same", "negative"]])), /Duplicate bench case id/);
});

test("rejects unknown expected labels", () => {
  const broken: EvalCase<{ text: string }>[] = [{ id: "a", input: { text: "a" }, expected: "maybe" as never }];
  assert.throws(() => validateCases(broken), /Invalid expected label/);
});

test("fingerprint does not depend on case order", () => {
  const input = cases([["a", "positive"], ["b", "negative"]]);
  assert.equal(corpusFingerprint(input), corpusFingerprint([...input].reverse()));
});

test("fingerprint changes when a label changes", () => {
  assert.notEqual(
    corpusFingerprint(cases([["a", "positive"]])),
    corpusFingerprint(cases([["a", "negative"]])),
  );
});

test("published verdicts never carry input text", () => {
  const result = runBinaryBench(
    [{ id: "event-1", input: { text: "Victim Dupont, 12 rue des Fleurs" }, expected: "positive" }],
    model("privacy", { "Victim Dupont, 12 rue des Fleurs": true }),
  );
  assert.equal(JSON.stringify(result).includes("Dupont"), false);
  assert.deepEqual(result.verdicts, [{ id: "event-1", expected: "positive", predicted: true }]);
});

test("baseline comparison flags a recall drop and a false-positive rise", () => {
  const baseline = runBinaryBench(
    cases([["a", "positive"], ["b", "negative"]]),
    model("baseline", { a: true, b: false }),
  ).metrics;
  const current = runBinaryBench(
    cases([["a", "positive"], ["b", "negative"]]),
    model("current", { a: false, b: true }),
  ).metrics;
  const problems = compareWithBaseline(current, baseline);
  assert.equal(problems.some((text) => text.startsWith("recall regressed")), true);
  assert.equal(problems.some((text) => text.startsWith("falsePositiveRate regressed")), true);
});

test("baseline comparison accepts an improvement", () => {
  const baseline = runBinaryBench(cases([["a", "negative"]]), model("old", { a: true })).metrics;
  const current = runBinaryBench(cases([["a", "negative"]]), model("new", { a: false })).metrics;
  assert.deepEqual(compareWithBaseline(current, baseline), []);
});

test("relevance adapter predicts with the real scoring engine", () => {
  const adapter = relevanceGateModel(loadRelevanceConfig({}));
  assert.equal(adapter.predict({ title: "Cyberattaque et ransomware en Gironde" }), true);
  assert.equal(adapter.predict({ title: "Agenda culturel de la semaine" }), false);
});

test("false-event adapter keeps an NA-anchored item without cyber text", () => {
  const adapter = falseEventGateModel(loadRelevanceConfig({}));
  const unanchored = { id: 1, title: "Agenda culturel de la semaine", orgId: null, regional: false };
  assert.equal(adapter.predict(unanchored), false);
  assert.equal(adapter.predict({ ...unanchored, orgId: 42 }), true);
  assert.equal(adapter.predict({ ...unanchored, regional: true }), true);
});

test("corpus parser rejects an unknown label", () => {
  assert.throws(
    () => parseCorpus({ items: [{ id: 1, titre: "Titre réel", source: "gn-33", label: "inconnu" }] }),
    /unknown label/,
  );
});

test("case builder keeps real anchors and excludes absent events", () => {
  const items = parseCorpus({
    items: [
      { id: 1, titre: "Cyberattaque à Bordeaux", source: "gn-33", label: "cyber" },
      { id: 2, titre: "Fête de la commune", source: "gn-17", label: "hors_sujet" },
      { id: 3, titre: "Conseil municipal", source: "gn-79", label: "hors_sujet" },
    ],
  });
  const built = buildCases(
    items,
    new Map([
      [1, { orgId: null, regional: false }],
      [2, { orgId: 77, regional: false }],
    ]),
  );
  assert.equal(built.matched, 2);
  assert.deepEqual(built.relevance.map((item) => item.expected), ["positive", "negative"]);
  assert.deepEqual(built.falseEvents.map((item) => item.expected), ["positive", "positive"]);
  assert.equal(hasNaAnchor({ id: 2, orgId: null, regional: true }), true);
});
