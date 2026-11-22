/** One test per facet of the offline natural-language question parser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuestion } from "../src/search/parse-question.js";

test("a Gironde question is scoped to department 33", () => {
  assert.deepEqual(parseQuestion("quelles attaques en Gironde ?").departments, ["33"]);
});

test("a department code is accepted only inside Nouvelle-Aquitaine", () => {
  assert.deepEqual(parseQuestion("incidents dans le 33 et le 75").departments, ["33"]);
});

test("a year phrase becomes a time filter", () => {
  assert.deepEqual(parseQuestion("attaques de 2025 à 2026").years, [2025, 2026]);
});

test("attack wording selects the attack intent", () => {
  assert.equal(parseQuestion("quelles cyberattaques ?").intent, "attacks");
  assert.equal(parseQuestion("quelles failles CVE ?").intent, "vulnerabilities");
});

test("hospital wording selects the health sector", () => {
  assert.equal(parseQuestion("les hôpitaux de Gironde").sector, "health");
  assert.equal(parseQuestion("les écoles de Gironde").sector, "education");
});

test("English questions are understood", () => {
  const parsed = parseQuestion("Which attacks hit hospitals in Gironde in 2026?");
  assert.equal(parsed.sector, "health");
  assert.equal(parsed.intent, "attacks");
  assert.deepEqual(parsed.departments, ["33"]);
  assert.deepEqual(parsed.years, [2026]);
});

test("out-of-region departments never enter the filters", () => {
  assert.deepEqual(parseQuestion("attaques à Paris en 2026").departments, []);
});

test("an unrecognised question keeps every facet open but stays regional", () => {
  const parsed = parseQuestion("que se passe-t-il ?");
  assert.equal(parsed.intent, "all");
  assert.equal(parsed.sector, null);
  assert.deepEqual(parsed.departments, []);
  assert.deepEqual(parsed.years, []);
  assert.equal(parsed.regionOnly, true);
});
