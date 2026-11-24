-- 217 — priorité CTEM par organisation, à partir de l'exposition mesurée.
--
-- `exposition_service` dit QUELS ports ont été vus ; il ne dit pas quelle
-- organisation mérite une validation humaine en premier. `org_score` porte
-- cette décision de triage, une ligne par organisation ayant au moins une
-- exposition mesurée.
--
-- Règle `ctem-priorite@1` :
--   * exposé     : service cité (source_url http(s)) et consulté il y a < 7 j ;
--   * validé     : exposition fraîche et citée — elle entre dans la bande > 0,9 ;
--   * criticité  : exposition_criticite() (migration 203), EPSS maximal des CVE
--     citées dans evidence->vulns et signal KEV éventuel ;
--   * score      : 0,91 plancher pour une organisation dont au moins une
--     exposition est validée, puis 0,09 de marge croissante avec la criticité
--     cumulée. Une organisation sans exposition validée reste sous 0,9.
--
-- Le seuil 0,9 n'est pas une probabilité de compromission : c'est la frontière
-- de la bande de validation. Les organisations au-dessus sont celles dont
-- l'exposition est réellement mesurée et citée ; le classement à l'intérieur
-- de la bande tient compte du nombre de services et de leur dangerosité.
--
-- Aucune donnée personnelle : ni nom d'organisation, ni IP, ni URL de
-- consultation ne sont copiés. Seuls des identifiants et agrégats numériques.

BEGIN;

CREATE TABLE IF NOT EXISTS org_score (
  org_id       integer PRIMARY KEY REFERENCES org(id) ON DELETE CASCADE,
  score        double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  services     integer NOT NULL CHECK (services >= 0),
  confirmees   integer NOT NULL CHECK (confirmees >= 0 AND confirmees <= services),
  criticite    double precision NOT NULL CHECK (criticite >= 0),
  regle        text NOT NULL DEFAULT 'ctem-priorite@1',
  calcule_le   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_score_score_idx ON org_score (score DESC, org_id);

COMMENT ON TABLE org_score IS
  'Priorité de validation CTEM par organisation : score 0-1 issu de l''exposition_service mesurée, citée et récente.';
COMMENT ON COLUMN org_score.score IS
  'Score de triage : > 0,9 si au moins une exposition est validée (citée et < 7 j), croissant avec la criticité cumulée.';
COMMENT ON COLUMN org_score.confirmees IS
  'Nombre de services exposés dont la citation et la fraîcheur ont été vérifiées.';

CREATE OR REPLACE FUNCTION refresh_org_score() RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  total integer;
BEGIN
  DELETE FROM org_score;

  WITH service AS (
    SELECT e.org_id,
           (e.source_url ~ '^https?://' AND e.consulted_at >= now() - interval '7 days') AS valide,
           COALESCE(v.epss_max, 0) AS epss_max,
           COALESCE(v.kev, false) AS kev,
           e.category
      FROM exposition_service e
      LEFT JOIN LATERAL (
        SELECT max(p.score) AS epss_max,
               bool_or(EXISTS (SELECT 1 FROM event k WHERE k.dedup_key = 'kev:' || x.value)) AS kev
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(e.evidence->'vulns') = 'array'
                 THEN e.evidence->'vulns'
                 ELSE '[]'::jsonb END
          ) AS x(value)
          LEFT JOIN epss p ON p.cve = x.value
      ) v ON true
  ),
  agr AS (
    SELECT org_id,
           count(*)::integer AS services,
           count(*) FILTER (WHERE valide)::integer AS confirmees,
           COALESCE(sum(exposition_criticite(category, epss_max, kev)) FILTER (WHERE valide), 0)
             AS criticite
      FROM service
     GROUP BY org_id
  )
  INSERT INTO org_score (org_id, score, services, confirmees, criticite, regle, calcule_le)
  SELECT org_id,
         CASE
           WHEN confirmees = 0
             THEN round((0.30 * (1 - exp(-services::double precision / 5)))::numeric, 6)::double precision
           ELSE round(least(1, 0.91 + 0.09 * (1 - exp(-criticite / 60.0)))::numeric, 6)::double precision
         END AS score,
         services,
         confirmees,
         criticite,
         'ctem-priorite@1',
         now()
    FROM agr;

  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$fn$;

COMMENT ON FUNCTION refresh_org_score() IS
  'Recalcule org_score depuis exposition_service, epss et event ; renvoie le nombre d''organisations classées.';

SELECT refresh_org_score();

COMMIT;
