/**
 * Régression de `scripts/corpus-dedup.mts` : le critère visé (deux lignes
 * identiques n'en laissent qu'une après `--appliquer`) et les deux règles de
 * détection. Les fichiers sont créés dans un dossier temporaire : jamais le
 * corpus versionné n'est modifié par ces tests.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { analyserCorpus, appliquer } from "../../../scripts/corpus-dedup.mjs";

const ligne = (champs: Record<string, unknown>): string => JSON.stringify(champs);

function corpusTemporaire(contenu: string): { dir: string; fichier: string } {
  const dir = mkdtempSync(join(tmpdir(), "corpus-dedup-"));
  const fichier = join(dir, "incidents-test.jsonl");
  writeFileSync(fichier, contenu, "utf8");
  return { dir, fichier };
}

describe("corpus-dedup", () => {
  it("deux lignes identiques → une seule après application", () => {
    const incident = {
      id: "na-test-001",
      date_publication: "2026-03-12",
      organisation: "Ville de Test",
      type: "ransomware",
      url: "https://exemple.fr/incident",
    };
    const { dir, fichier } = corpusTemporaire(`${ligne(incident)}\n${ligne(incident)}\n`);
    try {
      const analyse = analyserCorpus(dir);
      assert.equal(analyse.rapport.incidents, 2);
      assert.equal(analyse.rapport.groupes.length, 1);
      assert.equal(analyse.rapport.lignesEnTrop, 1);

      // Le mode rapport ne touche pas au fichier.
      assert.equal(readFileSync(fichier, "utf8"), `${ligne(incident)}\n${ligne(incident)}\n`);

      const resultat = appliquer(analyse);
      assert.equal(resultat.lignesSupprimees, 1);
      assert.deepEqual(resultat.fichiersModifies, ["incidents-test.jsonl"]);
      assert.equal(readFileSync(fichier, "utf8"), `${ligne(incident)}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reconnaît organisation + mois malgré la casse et les diacritiques", () => {
    const { dir } = corpusTemporaire(
      [
        ligne({
          id: "a",
          date_publication: "2026-04-02",
          organisation: "Hôpital de Poitiers",
        }),
        ligne({
          id: "b",
          date_publication: "2026-04-28",
          organisation: "hopital de poitiers",
        }),
        ligne({
          id: "c",
          date_publication: "2026-04-14",
          organisation: "Mairie de Poitiers",
        }),
      ].join("\n") + "\n",
    );
    try {
      const rapport = analyserCorpus(dir).rapport;
      assert.equal(rapport.groupes.length, 1);
      assert.equal(rapport.groupes[0].membres.length, 2);
      assert.deepEqual(
        rapport.groupes[0].membres.map((membre) => membre.id),
        ["a", "b"],
      );
      assert.equal(rapport.groupes[0].criteres[0].type, "organisation_mois");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fusionne par URL et complète les champs absents du survivant", () => {
    const { dir, fichier } = corpusTemporaire(
      [
        ligne({
          id: "a",
          date_publication: "2026-05-02",
          organisation: "Organisation A",
          url: "https://WWW.exemple.fr/article/?utm_source=news",
        }),
        ligne({
          id: "b",
          date_publication: "2026-09-11",
          organisation: "Organisation B",
          date_incident: "2026-09-01",
          url: "https://exemple.fr/article",
        }),
      ].join("\n") + "\n",
    );
    try {
      const analyse = analyserCorpus(dir);
      assert.equal(analyse.rapport.groupes.length, 1);
      assert.equal(analyse.rapport.groupes[0].criteres[0].type, "url");
      appliquer(analyse);
      const restants = readFileSync(fichier, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
      assert.equal(restants.length, 1);
      assert.equal(restants[0].id, "a");
      assert.equal(restants[0].date_incident, "2026-09-01");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
