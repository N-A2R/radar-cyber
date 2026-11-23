-- 215 — Tableau de bord de couverture : mesures SQL auditées chaque nuit.
--
-- Les pourcentages approximatifs du tableau de bord sont remplacés par huit
-- indicateurs calculés par une seule requête SQL (`kpi_couverture_mesures`).
-- `kpi_couverture_releve` conserve un relevé par jour et par indicateur ;
-- `enregistrer_kpi_couverture()` (appelé au démarrage puis chaque nuit par
-- l'API) remplace le relevé du jour et purge tout point plus vieux que 90
-- jours. La vue `kpi_couverture` lit ces relevés et, si le relevé du jour
-- n'existe pas encore, calcule les huit valeurs à la volée : la vue ne peut
-- donc jamais renvoyer moins de huit lignes pour `CURRENT_DATE`.
--
-- Aucune donnée personnelle, aucune portée géographique inférée : les mesures
-- portent sur des compteurs d'objets déjà présents dans la base.

BEGIN;

CREATE TABLE IF NOT EXISTS kpi_couverture_releve (
  date_jour  date        NOT NULL,
  indicateur text        NOT NULL,
  libelle    text        NOT NULL,
  valeur     numeric     NOT NULL,
  mesure_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date_jour, indicateur)
);

CREATE INDEX IF NOT EXISTS kpi_couverture_releve_date_idx
  ON kpi_couverture_releve (date_jour DESC);

COMMENT ON TABLE kpi_couverture_releve IS
  'Relevés quotidiens des huit indicateurs de couverture ; 90 jours glissants.';

-- Source unique des huit indicateurs : la fonction est utilisée à la fois par
-- le relevé nocturne et par le repli calculé de la vue.
CREATE OR REPLACE FUNCTION kpi_couverture_mesures()
RETURNS TABLE (indicateur text, libelle text, valeur numeric)
LANGUAGE sql
STABLE
AS $$
  WITH comptes AS (
    SELECT
      (SELECT count(*)::numeric FROM source) AS sources_declarees,
      (SELECT count(*)::numeric FROM source WHERE enabled) AS sources_activees,
      (SELECT count(DISTINCT source_id)::numeric FROM collector_run) AS sources_avec_collecte,
      (SELECT count(*)::numeric FROM org) AS organisations_referencees,
      (SELECT count(DISTINCT org_id)::numeric FROM event WHERE org_id IS NOT NULL)
        AS organisations_avec_evenement,
      (SELECT count(*)::numeric FROM event) AS evenements_enregistres,
      (SELECT count(*)::numeric FROM alert) AS alertes_enregistrees
  )
  SELECT m.indicateur, m.libelle, m.valeur
    FROM comptes c
    CROSS JOIN LATERAL (VALUES
      ('sources_declarees'::text, 'Sources déclarées'::text, c.sources_declarees),
      ('sources_activees'::text, 'Sources actives'::text, c.sources_activees),
      ('sources_avec_collecte'::text, 'Sources avec collecte'::text, c.sources_avec_collecte),
      ('organisations_referencees'::text, 'Organisations au référentiel'::text, c.organisations_referencees),
      ('organisations_avec_evenement'::text, 'Organisations avec événement'::text, c.organisations_avec_evenement),
      ('evenements_enregistres'::text, 'Événements enregistrés'::text, c.evenements_enregistres),
      ('alertes_enregistrees'::text, 'Alertes enregistrées'::text, c.alertes_enregistrees),
      ('part_sources_actives_pct'::text, 'Part des sources actives (%)'::text,
        CASE WHEN c.sources_declarees > 0
             THEN round(100 * c.sources_activees / c.sources_declarees, 2)
             ELSE 0::numeric END)
    ) AS m(indicateur, libelle, valeur);
$$;

COMMENT ON FUNCTION kpi_couverture_mesures() IS
  'Les huit indicateurs audités du tableau de bord de couverture, calculés en SQL.';

-- Un relevé par jour : relancer la mesure le même jour remplace les valeurs,
-- puis la rétention ne garde que le jour courant et les 89 jours précédents.
CREATE OR REPLACE FUNCTION enregistrer_kpi_couverture(p_jour date DEFAULT current_date)
RETURNS SETOF kpi_couverture_releve
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO kpi_couverture_releve (date_jour, indicateur, libelle, valeur)
  SELECT p_jour, m.indicateur, m.libelle, m.valeur
    FROM kpi_couverture_mesures() AS m
  ON CONFLICT (date_jour, indicateur) DO UPDATE
     SET libelle = EXCLUDED.libelle,
         valeur = EXCLUDED.valeur,
         mesure_at = now();

  DELETE FROM kpi_couverture_releve
   WHERE date_jour < p_jour - 89;

  RETURN QUERY
    SELECT r.date_jour, r.indicateur, r.libelle, r.valeur, r.mesure_at
      FROM kpi_couverture_releve r
     WHERE r.date_jour = p_jour
     ORDER BY r.indicateur;
END;
$$;

COMMENT ON FUNCTION enregistrer_kpi_couverture(date) IS
  'Relevé idempotent des huit indicateurs, avec rétention glissante de 90 jours.';

-- Surface publique du tableau de bord. Les relevés sont la mesure audité ; le
-- repli `calcul_direct` ne sert que si la mesure nocturne n'a pas encore tourné.
CREATE OR REPLACE VIEW kpi_couverture AS
SELECT r.date_jour, r.indicateur, r.libelle, r.valeur, r.mesure_at,
       'releve'::text AS origine
  FROM kpi_couverture_releve r
 WHERE r.date_jour >= current_date - 89
UNION ALL
SELECT current_date, m.indicateur, m.libelle, m.valeur, now(),
       'calcul_direct'::text AS origine
  FROM kpi_couverture_mesures() m
 WHERE NOT EXISTS (
   SELECT 1 FROM kpi_couverture_releve r2 WHERE r2.date_jour = current_date
 );

COMMENT ON VIEW kpi_couverture IS
  'Huit indicateurs de couverture par jour ; 90 jours d''historique audité.';

-- Premier relevé : la vue est immédiatement éligible au contrôle après la
-- migration, sans attendre le premier tick nocturne du serveur.
SELECT enregistrer_kpi_couverture();

COMMIT;
