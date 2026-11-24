/** One test per behaviour of the archived candidate confirmation. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmerCandidats,
  type ArchivedActive,
  type ArchivedBatch,
  type NaTarget,
} from "../src/detect/typosquat-proof.js";

const TARGETS: NaTarget[] = [
  { domain: "maif.fr", dept: "79" },
  { domain: "paris.fr", dept: "75" },
];

function active(domain: string, base: string, similarity: number, kind = "omission"): ArchivedActive {
  return { domain, base, orgName: "Organisation NA", kind, similarity, certificate: null, pageTitle: null };
}

function batch(records: ArchivedActive[], detections: { domain: string }[] = []): ArchivedBatch {
  return { activeList: records, detections };
}

test("confirme une alerte prouvée par le relevé archivé sans compter les variantes proches sous le seuil", () => {
  const result = confirmerCandidats(
    [batch([active("maiff.fr", "maif.fr", 0.9), active("maif.frx", "maif.fr", 0.6)])],
    TARGETS,
  );
  assert.equal(result.candidates, 1);
  assert.equal(result.confirmed, 1);
  assert.deepEqual(result.rejected, []);
});

test("rejette une alerte dont la base sort du référentiel Nouvelle-Aquitaine", () => {
  const result = confirmerCandidats([batch([active("parif.fr", "paris.fr", 0.9)])], TARGETS);
  assert.equal(result.confirmed, 0);
  assert.deepEqual(result.rejected, [{ domain: "parif.fr", reason: "base-outside-na-referential" }]);
});

test("ne confond pas un candidat confirmé avec une usurpation confirmée", () => {
  const result = confirmerCandidats(
    [batch([active("maiff.fr", "maif.fr", 0.9)], [{ domain: "usurpation.example" }])],
    TARGETS,
  );
  assert.equal(result.confirmed, 1);
  assert.equal(result.usurpations, 1);
});
