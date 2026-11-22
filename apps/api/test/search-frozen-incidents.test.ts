/** The versioned incident corpus is read-only, regional and source-backed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NA_DEPARTMENTS } from "../src/geo/commune-index.js";
import { loadFrozenIncidents, searchFrozenIncidents } from "../src/search/frozen-incidents.js";
import { parseQuestion } from "../src/search/parse-question.js";

const STAR = "quelles attaques ont touché les hôpitaux de Gironde en 2026";

test("the loader keeps only incidents located in Nouvelle-Aquitaine", () => {
  const incidents = loadFrozenIncidents();
  assert.ok(incidents.length > 100);
  for (const incident of incidents) {
    assert.ok((NA_DEPARTMENTS as readonly string[]).includes(incident.departmentCode));
  }
});

test("the star question returns the four Gironde healthcare incidents of 2026", () => {
  const ids = searchFrozenIncidents(parseQuestion(STAR)).map((incident) => incident.id);
  assert.deepEqual(ids, ["gir-couv-014", "gir-couv-013", "gir-couv-004", "gir-couv-012"]);
});

test("a different year excludes 2026 incidents", () => {
  const ids = searchFrozenIncidents(parseQuestion(STAR.replace("2026", "2025"))).map((i) => i.id);
  assert.deepEqual(ids, []);
});

test("a different department excludes Gironde incidents", () => {
  const ids = searchFrozenIncidents(parseQuestion(STAR.replace("Gironde", "Charente"))).map((i) => i.id);
  assert.deepEqual(ids, []);
});

test("a synthetic out-of-region incident is never returned", () => {
  const outside = [{
    id: "outside", date: "2026-05-01", organisation: "Hôpital de Paris",
    department: "Paris", departmentCode: "75", type: "fuite", source: "test",
    title: "Hôpital de Paris", url: null,
  }];
  assert.deepEqual(searchFrozenIncidents(parseQuestion(STAR), outside), []);
});

test("no victim personal-data field is exposed by the loader", () => {
  const allowed = ["id", "date", "organisation", "department", "departmentCode", "type", "source", "title", "url"];
  for (const incident of loadFrozenIncidents()) {
    assert.deepEqual(Object.keys(incident).sort(), [...allowed].sort());
  }
});
