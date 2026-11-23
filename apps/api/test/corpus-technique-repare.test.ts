/**
 * Régression du corpus technique réparé : aucune ligne perdue, les 14 sources
 * mortes mesurées le 2026-11-21 ont chacune un sort documenté, et les 8
 * remplacements conservent l'URL d'origine pour traçabilité. Test hors ligne :
 * le corpus versionné n'est ni modifié ni rechargé ici.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const CORPUS = fileURLToPath(new URL("../../../bench/corpus/technique.jsonl", import.meta.url));
const lignes = readFileSync(CORPUS, "utf8").trim().split("\n").map((l) => JSON.parse(l)) as Record<string, any>[];

const MORTES = [
  "na-tech-002", "na-tech-004", "na-tech-012", "na-tech-015", "na-tech-016", "na-tech-020",
  "na-tech-023", "na-tech-024", "na-tech-027", "na-tech-029", "na-tech-030", "na-tech-035",
  "na-tech-039", "na-tech-047",
];
const REMPLACEES = [
  "na-tech-015", "na-tech-016", "na-tech-020", "na-tech-023", "na-tech-029", "na-tech-035",
  "na-tech-039", "na-tech-047",
];

describe("corpus technique réparé", () => {
  it("aucune ligne supprimée : 53 identifiants uniques de 001 à 053", () => {
    assert.equal(lignes.length, 53);
    const ids = lignes.map((l) => l.id);
    assert.equal(new Set(ids).size, 53);
    assert.equal(ids[0], "na-tech-001");
    assert.equal(ids[52], "na-tech-053");
  });

  it("les 14 sources mortes ont chacune un sort et une vérification datée", () => {
    const reparees = lignes.filter((l) => l.reparation);
    assert.deepEqual(reparees.map((l) => l.id), MORTES);
    for (const ligne of reparees) {
      assert.equal(ligne.verifie_le, "2026-11-21");
      assert.match(ligne.verification, /HTTP|code 000|curl=6/);
      assert.ok(["rétablie", "remplacée", "marquée"].some((sort) => ligne.reparation.startsWith(sort)));
    }
  });

  it("8 remplacements gardent l'URL d'origine et changent d'endpoint", () => {
    const remplaces = lignes.filter((l) => l.acces_original);
    assert.deepEqual(remplaces.map((l) => l.id), REMPLACEES);
    for (const ligne of remplaces) {
      assert.match(ligne.acces, /^https:\/\//);
      assert.notEqual(ligne.acces, ligne.acces_original);
      assert.equal(ligne.statut, "accessible");
    }
  });

  it("le dénominateur publié reste 50 sources, dont 40 accessibles et 3 exclues", () => {
    const comptes = lignes.reduce<Record<string, number>>((acc, l) => {
      acc[l.statut] = (acc[l.statut] ?? 0) + 1;
      return acc;
    }, {});
    assert.deepEqual(comptes, { accessible: 40, inaccessible: 10, exclu: 3 });
    assert.equal(lignes.length - comptes.exclu!, 50);
  });
});
