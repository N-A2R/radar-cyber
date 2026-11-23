/**
 * Tableau de bord de couverture : vue SQL auditable, corpus fixe et rétention.
 *
 * Le corpus synthétique (1808 sources, 10261 organisations) est versé dans une
 * transaction annulée : aucun test ne modifie la base partagée de la suite.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { closePools, query, withClient } from "../src/db.js";

const CORPUS_SQL = fileURLToPath(
  new URL("../../../db/fixtures/kpi-couverture-corpus.sql", import.meta.url),
);
const CORPUS_ATTENDU = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../bench/fixtures/kpi-couverture-corpus.json", import.meta.url)),
    "utf8",
  ),
) as { sources: number; organisations: number; indicateurs: number };

const INDICATEURS = [
  "sources_declarees",
  "sources_activees",
  "sources_avec_collecte",
  "organisations_referencees",
  "organisations_avec_evenement",
  "evenements_enregistres",
  "alertes_enregistrees",
  "part_sources_actives_pct",
];

type LigneKpi = {
  date_jour: string;
  indicateur: string;
  libelle: string;
  valeur: string;
  mesure_at: string;
  origine: string;
};


test("la vue expose huit indicateurs non nuls pour le jour courant", async () => {
  const resultat = await query<LigneKpi>(
    "SELECT * FROM kpi_couverture WHERE date_jour = CURRENT_DATE",
  );
  assert.equal(resultat.rows.length, 8);
  assert.deepEqual(
    resultat.rows.map((ligne) => ligne.indicateur).sort(),
    [...INDICATEURS].sort(),
  );
  for (const ligne of resultat.rows) {
    assert.ok(ligne.libelle, `libelle manquant pour ${ligne.indicateur}`);
    assert.ok(ligne.valeur !== null && Number.isFinite(Number(ligne.valeur)));
    assert.ok(ligne.mesure_at, `horodatage manquant pour ${ligne.indicateur}`);
    assert.ok(ligne.origine, `origine manquante pour ${ligne.indicateur}`);
  }
});

test("sans relevé du jour, la vue calcule les huit indicateurs à la volée", async () => {
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM kpi_couverture_releve WHERE date_jour = CURRENT_DATE");
      const resultat = await client.query<LigneKpi>(
        "SELECT * FROM kpi_couverture WHERE date_jour = CURRENT_DATE",
      );
      assert.equal(resultat.rows.length, 8);
      assert.ok(resultat.rows.every((ligne) => ligne.origine === "calcul_direct"));
      assert.deepEqual(
        resultat.rows.map((ligne) => ligne.indicateur).sort(),
        [...INDICATEURS].sort(),
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

test("le relevé nocturne est idempotent : huit lignes, une seule fois par jour", async () => {
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SELECT enregistrer_kpi_couverture()");
      await client.query("SELECT enregistrer_kpi_couverture()");
      const releve = await client.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM kpi_couverture_releve WHERE date_jour = CURRENT_DATE",
      );
      assert.equal(Number(releve.rows[0].n), 8);
      const vue = await client.query<LigneKpi>(
        "SELECT * FROM kpi_couverture WHERE date_jour = CURRENT_DATE",
      );
      assert.equal(vue.rows.length, 8);
      assert.ok(vue.rows.every((ligne) => ligne.origine === "releve"));
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

test("non-régression sur le corpus fixe : 1808 sources et 10261 organisations", async () => {
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      // La base de test partagée contient des milliers de sources : on
      // repart d'un état vide dans cette transaction, annulée en fin de test.
      await client.query("TRUNCATE TABLE source, org, event, collector_run, alert CASCADE");
      await client.query(readFileSync(CORPUS_SQL, "utf8"));
      const base = await client.query<{ sources: string; organisations: string }>(
        `SELECT (SELECT count(*)::text FROM source) AS sources,
                (SELECT count(*)::text FROM org) AS organisations`,
      );
      assert.equal(Number(base.rows[0].sources), CORPUS_ATTENDU.sources);
      assert.equal(Number(base.rows[0].organisations), CORPUS_ATTENDU.organisations);

      await client.query("SELECT enregistrer_kpi_couverture()");
      const resultat = await client.query<LigneKpi>(
        "SELECT * FROM kpi_couverture WHERE date_jour = CURRENT_DATE",
      );
      assert.equal(resultat.rows.length, CORPUS_ATTENDU.indicateurs);
      const mesures = Object.fromEntries(
        resultat.rows.map((ligne) => [ligne.indicateur, Number(ligne.valeur)]),
      );
      assert.equal(mesures.sources_declarees, 1808);
      assert.equal(mesures.organisations_referencees, 10261);
      for (const indicateur of INDICATEURS) {
        assert.ok(
          Number.isFinite(mesures[indicateur]) && mesures[indicateur] > 0,
          `${indicateur} doit être renseigné sur le corpus fixe`,
        );
      }
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

test("historique glissant : 90 jours conservés, le 91e purgé", async () => {
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO kpi_couverture_releve (date_jour, indicateur, libelle, valeur)
         VALUES (CURRENT_DATE - 91, 'sources_declarees', 'Hors rétention', 1),
                (CURRENT_DATE - 89, 'sources_declarees', 'Dernier jour conservé', 2)`,
      );
      await client.query("SELECT enregistrer_kpi_couverture()");

      const perime = await client.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM kpi_couverture_releve WHERE date_jour = CURRENT_DATE - 91",
      );
      assert.equal(Number(perime.rows[0].n), 0);
      const conserve = await client.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM kpi_couverture_releve WHERE date_jour = CURRENT_DATE - 89",
      );
      assert.equal(Number(conserve.rows[0].n), 1);
      const vuePerimee = await client.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM kpi_couverture WHERE date_jour = CURRENT_DATE - 91",
      );
      assert.equal(Number(vuePerimee.rows[0].n), 0);
      const aujourdHui = await client.query<LigneKpi>(
        "SELECT * FROM kpi_couverture WHERE date_jour = CURRENT_DATE",
      );
      assert.equal(aujourdHui.rows.length, 8);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

test("la suite referme ses connexions", async () => {
  await closePools();
});
