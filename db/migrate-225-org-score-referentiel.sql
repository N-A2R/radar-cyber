-- La migration 222 a rendu (org_id, referentiel) clé primaire de org_score,
-- mais refresh_org_score() (217) insère encore sans referentiel : le recalcul
-- échoue sur NOT NULL. On redéfinit la fonction avec son référentiel explicite.

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
  INSERT INTO org_score (org_id, score, services, confirmees, criticite, regle, referentiel, calcule_le)
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
         'ctem-priorite@1',
         now()
    FROM agr;

  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$fn$;

SELECT refresh_org_score();
