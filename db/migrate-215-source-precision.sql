-- 215 — précision des sources sur 30 jours : brut revu contre faits admis.
--
-- Le score de santé (200) mesure le rendement de la collecte, pas la qualité
-- de ce qui est collecté. Une source peut répondre vite et n'envoyer que du
-- bruit : ses lignes finissent rejetées dans `quarantine_raw`. À l'inverse,
-- les faits admis sont les événements de `event` (hors `false_event`, qui sont
-- écartés du fil et ne sont donc pas des faits confirmés).
--
-- `source_precision` matérialise le rapport sur 30 jours :
--   revues_30d    = lignes de quarantaine tranchées (rejetées ou marquées
--                   revues, non promues) + événements admis de la source ;
--   rejets_30d    = lignes tranchées sans fait admis ;
--   valides_30d   = événements admis ;
--   precision_30d = valides_30d / revues_30d.
--
-- Une ligne promue n'est pas comptée deux fois : son événement porte la
-- validation. La date de revue est la dernière décision dans
-- `extracted->_review`, à défaut la date de réception du brut.
--
-- Le jeu semé ci-dessous est explicitement synthétique (`precision-eval-*`),
-- sans donnée personnelle ni source nationale déguisée en source locale : il
-- rend la mesure vérifiable sur une base neuve, avant toute collecte réelle.
BEGIN;

CREATE TABLE IF NOT EXISTS source_precision (
  source_id     text PRIMARY KEY REFERENCES source(id) ON DELETE CASCADE,
  revues_30d    integer NOT NULL,
  rejets_30d    integer NOT NULL,
  valides_30d   integer NOT NULL,
  precision_30d numeric(6,4) NOT NULL,
  calcule_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE source_precision DROP CONSTRAINT IF EXISTS source_precision_compteurs_check;
ALTER TABLE source_precision ADD CONSTRAINT source_precision_compteurs_check
  CHECK (revues_30d >= 0 AND rejets_30d >= 0 AND valides_30d >= 0
         AND revues_30d = rejets_30d + valides_30d);

ALTER TABLE source_precision DROP CONSTRAINT IF EXISTS source_precision_borne_check;
ALTER TABLE source_precision ADD CONSTRAINT source_precision_borne_check
  CHECK (precision_30d >= 0 AND precision_30d <= 1);

COMMENT ON TABLE source_precision IS
  'Précision par source sur 30 jours : faits admis / (brut revu + faits admis).';
COMMENT ON COLUMN source_precision.revues_30d IS
  'Lignes de quarantaine tranchées non promues plus événements admis sur 30 jours.';

CREATE OR REPLACE FUNCTION refresh_source_precision() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE total integer;
BEGIN
  DELETE FROM source_precision;

  WITH refuses AS (
    SELECT s.id AS source_id, count(*)::integer AS n
    FROM quarantine_raw q
    JOIN source s ON s.id = q.source_id OR s.id = 'quarantine:' || q.source
    WHERE q.status IN ('rejected', 'reviewed')
      AND q.promoted = false
      AND COALESCE(
            (q.extracted -> '_review' -> -1 ->> 'at')::timestamptz,
            q.received_at
          ) >= now() - interval '30 days'
    GROUP BY s.id
  ),
  valides AS (
    SELECT e.source_id AS source_id, count(*)::integer AS n
    FROM event e
    WHERE NOT EXISTS (SELECT 1 FROM false_event f WHERE f.event_id = e.id)
      AND COALESCE(e.observed_at, e.collected_at, e.at, e.created_at)
          >= now() - interval '30 days'
    GROUP BY e.source_id
  ),
  evalues AS (
    SELECT source_id FROM refuses
    UNION
    SELECT source_id FROM valides
  )
  INSERT INTO source_precision (source_id, revues_30d, rejets_30d, valides_30d, precision_30d)
  SELECT x.source_id,
         coalesce(r.n, 0) + coalesce(v.n, 0),
         coalesce(r.n, 0),
         coalesce(v.n, 0),
         round(coalesce(v.n, 0)::numeric
               / nullif(coalesce(r.n, 0) + coalesce(v.n, 0), 0), 4)
  FROM evalues x
  LEFT JOIN refuses r ON r.source_id = x.source_id
  LEFT JOIN valides v ON v.source_id = x.source_id;

  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$$;

COMMENT ON FUNCTION refresh_source_precision() IS
  'Recalcule source_precision depuis quarantine_raw et event ; idempotent.';

-- Jeu de démonstration : 18 sources, 24 décisions chacune. Les sources paires
-- produisent 20 faits admis pour 4 rejets (précision 0,8333), les impaires
-- 4 faits admis pour 20 rejets (précision 0,1667).
INSERT INTO source (id, name, family, url, license, retain_raw)
SELECT format('precision-eval-%s', lpad(i::text, 2, '0')),
       format('Source synthétique d''évaluation %s (jeu de test)', lpad(i::text, 2, '0')),
       'cti',
       format('https://example.invalid/precision/%s', lpad(i::text, 2, '0')),
       'Jeu de test synthétique — aucun tiers',
       false
FROM generate_series(1, 18) AS i
ON CONFLICT (id) DO NOTHING;

INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new, kind)
SELECT s.id,
       now() - interval '2 days',
       now() - interval '2 days' + interval '1 minute',
       'ok', 0, 0, 'backfill'
FROM source s
WHERE s.id ~ '^precision-eval-[0-9]{2}$'
  AND NOT EXISTS (
    SELECT 1 FROM collector_run cr
    WHERE cr.source_id = s.id AND cr.kind = 'backfill'
  );

WITH eval AS (
  SELECT s.id,
         CASE WHEN right(s.id, 2)::integer % 2 = 0 THEN 20 ELSE 4 END AS admis
  FROM source s
  WHERE s.id ~ '^precision-eval-[0-9]{2}$'
)
INSERT INTO quarantine_raw (
  source, source_url, content_hash, status, promoted, promoted_at, promoted_by,
  received_at, extracted, kind
)
SELECT e.id,
       format('https://example.invalid/precision/%s/%s', e.id, n),
       format('precision-eval:%s:%s', e.id, n),
       CASE WHEN n <= e.admis THEN 'promoted' ELSE 'rejected' END,
       n <= e.admis,
       CASE WHEN n <= e.admis THEN now() - interval '2 hours' END,
       CASE WHEN n <= e.admis THEN 'seed:precision-eval' END,
       now() - (n::text || ' hours')::interval,
       jsonb_build_object(
         '_review',
         jsonb_build_array(
           jsonb_build_object(
             'at', now() - (n::text || ' hours')::interval,
             'by', 'seed:precision-eval',
             'action', CASE WHEN n <= e.admis THEN 'promote' ELSE 'reject' END,
             'reason', NULL
           )
         )
       ),
       'claim'
FROM eval e
CROSS JOIN generate_series(1, 24) AS n
ON CONFLICT (source, content_hash) DO NOTHING;

WITH eval AS (
  SELECT s.id,
         CASE WHEN right(s.id, 2)::integer % 2 = 0 THEN 20 ELSE 4 END AS admis
  FROM source s
  WHERE s.id ~ '^precision-eval-[0-9]{2}$'
)
INSERT INTO event (
  dedup_key, family, assertion_type, title, observed_at, at, collected_at,
  severity, confidence, source_id, source_url, evidence, geo_type, tlp
)
SELECT format('precision-eval:%s:%s', e.id, n),
       'cti',
       'confirmed_incident',
       'Fait synthétique d''évaluation de précision',
       now() - (n::text || ' hours')::interval,
       now() - (n::text || ' hours')::interval,
       now() - (n::text || ' hours')::interval,
       3,
       'B2',
       e.id,
       format('https://example.invalid/precision/%s/%s', e.id, n),
       jsonb_build_object(
         'run_id',
         (SELECT cr.id FROM collector_run cr
          WHERE cr.source_id = e.id AND cr.kind = 'backfill'
          ORDER BY cr.id LIMIT 1)::text
       ),
       'unknown', 'RED'
FROM eval e
CROSS JOIN generate_series(1, e.admis) AS n
ON CONFLICT (dedup_key) DO NOTHING;

SELECT refresh_source_precision();

COMMIT;
