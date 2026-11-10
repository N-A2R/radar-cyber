import { test } from "node:test";
import assert from "node:assert/strict";
import { isRelevant, loadRelevanceOrgIndex } from "../src/collectors/relevance.js";

test("titre cyber FR accepté par keyword", () => {
  const r = isRelevant({ title: "Cyberattaque majeure en Nouvelle-Aquitaine" }, { orgs: [] });
  assert.equal(r.relevant, true);
  assert.equal(r.reason, "keyword");
});

test("titre people rejeté", () => {
  const r = isRelevant({ title: "Le BHV ferme ses portes" }, { orgs: [] });
  assert.equal(r.relevant, false);
  assert.equal(r.reason, "none");
});

test("mention domaine org acceptée par org", () => {
  const orgs = loadRelevanceOrgIndex([{ name: "Acme Corp", domain: "acme.fr", assets: [] }]);
  const r = isRelevant({ title: "Incident chez acme.fr signalé" }, { orgs });
  assert.equal(r.relevant, true);
  assert.equal(r.reason, "org");
});

test("accents/casse ignorés", () => {
  const r = isRelevant({ title: "RANÇONGICIEL détecté" }, { orgs: [] });
  assert.equal(r.relevant, true);
  assert.equal(r.reason, "keyword");
});
