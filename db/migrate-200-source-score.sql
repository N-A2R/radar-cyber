-- 200 — score de santé par source : fraîcheur, rendement et taux d'erreur.
--
-- Une ligne par source active, calculée en direct depuis `source` et
-- `collector_run` : la vue ne peut pas être périmée par un run qui vient
-- d'arriver. `yield_30d` compte les `items_new` des runs terminés sur 30 jours.
--
-- `muette` marque une source qui ne produit rien (yield < 1) : une source
-- « fraîche » sans rendement n'est donc pas comptée comme saine. `fraicheur`
-- distingue à part une source dormante (aucun succès récent) d'une source
-- muette mais encore collectée. Le score sur 100 suit la même pondération que
-- le rapport de confiance : fraîcheur 40, fiabilité 30, volume 30.
--
-- `refresh_source_score()` recalcule l'instantané `source_score_snapshot`
-- utilisé par les tableaux de bord. Il est idempotent : deux appels laissent
-- exactement les mêmes lignes, sans doublon.

BEGIN;

CREATE OR REPLACE VIEW source_score AS
WITH runs AS (
  SELECT source_id,
         count(*)::integer AS runs_30d,
         count(*) FILTER (WHERE status = 'error')::integer AS errors_30d,
         coalesce(sum(items_in), 0)::bigint AS items_in_30d,
         coalesce(sum(items_new), 0)::bigint AS yield_30d
  FROM collector_run
  WHERE finished_at >= now() - interval '30 days'
  GROUP BY source_id
), mesure AS (
  SELECT s.id AS source_id,
         s.name,
         s.family,
         s.last_ok_at,
         CASE
           WHEN s.last_ok_at IS NULL THEN 'jamais'
           WHEN s.last_ok_at >= now() - interval '1 day' THEN 'fraiche'
           WHEN s.last_ok_at >= now() - interval '7 days' THEN 'tiede'
           WHEN s.last_ok_at >= now() - interval '30 days' THEN 'ancienne'
           ELSE 'dormante'
         END AS fraicheur,
         coalesce(r.runs_30d, 0) AS runs_30d,
         coalesce(r.errors_30d, 0) AS errors_30d,
         coalesce(r.items_in_30d, 0) AS items_in_30d,
         coalesce(r.yield_30d, 0) AS yield_30d,
         CASE WHEN coalesce(r.runs_30d, 0) = 0 THEN NULL
              ELSE round(coalesce(r.errors_30d, 0)::numeric / r.runs_30d, 4)
         END AS taux_erreur,
         coalesce(r.yield_30d, 0) < 1 AS muette
  FROM source s
  LEFT JOIN runs r ON r.source_id = s.id
  WHERE s.enabled
), note AS (
  SELECT m.*,
         (CASE
            WHEN m.last_ok_at >= now() - interval '1 day' THEN 40
            WHEN m.last_ok_at >= now() - interval '7 days' THEN 30
            WHEN m.last_ok_at >= now() - interval '30 days' THEN 15
            ELSE 0
          END
          + CASE
              WHEN m.runs_30d = 0 THEN 15
              ELSE round(30 * (1 - least(1::numeric, m.taux_erreur)))::integer
            END
          + least(30, round(30 * ln(1 + m.yield_30d::numeric) / ln(1001::numeric))::integer)
         )::integer AS score
  FROM mesure m
)
SELECT source_id,
       name,
       family,
       last_ok_at,
       fraicheur,
       runs_30d,
       errors_30d,
       items_in_30d,
       yield_30d,
       taux_erreur,
       muette,
       score,
       CASE
         WHEN muette THEN 'muette'
         WHEN fraicheur IN ('jamais', 'dormante') THEN 'dormante'
         WHEN score >= 70 THEN 'saine'
         WHEN score >= 40 THEN 'fragile'
         ELSE 'critique'
       END AS classement
FROM note;

COMMENT ON VIEW source_score IS
  'Santé des sources actives : fraîcheur, rendement 30j, taux d erreur, muette et score /100.';

CREATE TABLE IF NOT EXISTS source_score_snapshot (
  source_id     text PRIMARY KEY,
  name          text NOT NULL,
  family        text NOT NULL,
  last_ok_at    timestamptz,
  fraicheur     text NOT NULL,
  runs_30d      integer NOT NULL,
  errors_30d    integer NOT NULL,
  items_in_30d  bigint NOT NULL,
  yield_30d     bigint NOT NULL,
  taux_erreur   numeric(6,4),
  muette        boolean NOT NULL,
  score         integer NOT NULL,
  classement    text NOT NULL
);

CREATE OR REPLACE FUNCTION refresh_source_score() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE total integer;
BEGIN
  DELETE FROM source_score_snapshot;
  INSERT INTO source_score_snapshot (
    source_id, name, family, last_ok_at, fraicheur, runs_30d, errors_30d,
    items_in_30d, yield_30d, taux_erreur, muette, score, classement
  )
  SELECT source_id, name, family, last_ok_at, fraicheur, runs_30d, errors_30d,
         items_in_30d, yield_30d, taux_erreur, muette, score, classement
  FROM source_score;
  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$$;

COMMENT ON FUNCTION refresh_source_score() IS
  'Recalcule l instantané source_score_snapshot ; idempotent.';

COMMIT;
