import { test } from "node:test";
import assert from "node:assert/strict";
import { isRelevant, loadRelevanceOrgIndex, matchOrgForTextFromList } from "../src/collectors/relevance.js";

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


test("matchOrgForText: correspondance nette (nom + domaine)", () => {
  const orgs = [
    { id: 1, name: "Acme Industries", slug: "acme-industries", domain: "acme-industries.fr" },
    { id: 2, name: "Globex", slug: "globex", domain: "globex.example" },
  ];
  const r = matchOrgForTextFromList(
    "Cyberattaque visant Acme Industries, fuite de données sur acme-industries.fr",
    orgs,
  );
  assert.ok(r);
  assert.equal(r?.orgId, 1);
  assert.ok((r?.confidence ?? 0) > 0.8);
});

test("matchOrgForText: deux candidats plausibles => null (ambigu)", () => {
  const orgs = [
    { id: 1, name: "Alpha Santé", slug: "alpha-sante", domain: null },
    { id: 2, name: "Alpha Energie", slug: "alpha-energie", domain: null },
  ];
  const r = matchOrgForTextFromList("Incident signalé chez Alpha aujourd'hui", orgs);
  assert.equal(r, null);
});

test("matchOrgForText: texte sans rapport => null", () => {
  const orgs = [
    { id: 1, name: "Université Bordeaux", slug: "universite-bordeaux", domain: "u-bordeaux.fr" },
  ];
  const r = matchOrgForTextFromList("Le BHV ferme ses portes après rénovation", orgs);
  assert.equal(r, null);
});

test("matchOrgForText: jetons trop courts/stopwords ignorés => null", () => {
  const orgs = [
    { id: 1, name: "IBM", slug: "ibm", domain: null },
    { id: 2, name: "Pour les SAS", slug: "sas", domain: null },
  ];
  const r = matchOrgForTextFromList("Incident pour les des une dans sur avec", orgs);
  assert.equal(r, null);
});
