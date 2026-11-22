-- 201 — fatigue d'alerte par organisation.
--
-- Une règle qui matche 600 faits de la même organisation le même jour ne
-- produit pas 600 charges d'attention distinctes : elle produit une alerte à
-- traiter et 599 doublons. La mesure retient donc une alerte présentée par
-- organisation, par jour (Europe/Paris) et par règle ; les doublons sont
-- acquittés (`status='ack'`) avec, dans `evidence.fatigue`, la trace de
-- l'alerte qui les couvre. Aucune ligne n'est supprimée : la preuve reste en
-- base et l'acquittement est auditable.
--
-- `alert_load_daily` publie la charge sur 30 jours glissants : une ligne par
-- organisation et par jour, avec le nombre de règles réellement présentées.
-- C'est la table que lit le critère de sortie :
--   SELECT count(*) FILTER (WHERE alerts_per_day<=2)::float/count(*)
--     FROM alert_load_daily;

CREATE TABLE IF NOT EXISTS alert_load_daily (
  org_id         integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  day            date NOT NULL,
  alerts_per_day integer NOT NULL CHECK (alerts_per_day >= 0),
  measured_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, day)
);

CREATE INDEX IF NOT EXISTS alert_load_daily_day_idx ON alert_load_daily (day);

-- Acquitte les doublons d'un même groupe (organisation, jour Europe/Paris,
-- règle). Idempotent : seules les alertes encore 'open' sont transformées, et
-- `covered_by_alert_id` désigne toujours la première du groupe.
CREATE OR REPLACE FUNCTION acknowledge_duplicate_alerts() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  updated integer;
BEGIN
  WITH first_alert AS (
    SELECT DISTINCT ON (org_id, (created_at AT TIME ZONE 'Europe/Paris')::date, rule_id)
           org_id,
           (created_at AT TIME ZONE 'Europe/Paris')::date AS day,
           rule_id,
           id AS first_id
    FROM alert
    WHERE org_id IS NOT NULL
    ORDER BY org_id, (created_at AT TIME ZONE 'Europe/Paris')::date, rule_id, id
  ), duplicate AS (
    SELECT a.id, f.first_id
    FROM alert a
    JOIN first_alert f
      ON f.org_id = a.org_id
     AND f.rule_id = a.rule_id
     AND f.day = (a.created_at AT TIME ZONE 'Europe/Paris')::date
    WHERE a.status = 'open'
      AND a.id > f.first_id
  )
  UPDATE alert a
     SET status = 'ack',
         acked_at = now(),
         updated_at = now(),
         evidence = COALESCE(a.evidence, '{}'::jsonb) || jsonb_build_object(
           'fatigue', jsonb_build_object(
             'reason', 'duplicate_same_org_day_rule',
             'covered_by_alert_id', duplicate.first_id,
             'acknowledged_by', 'system:alert-fatigue',
             'acknowledged_at', now()
           )
         )
    FROM duplicate
   WHERE a.id = duplicate.id;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

-- Reconstruit la mesure sur 30 jours glissants. Une ligne par organisation
-- et par jour, avec le nombre de règles distinctes présentées. Atomique : le
-- DELETE et l'INSERT vivent dans le même appel de fonction.
CREATE OR REPLACE FUNCTION refresh_alert_load_daily()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  inserted integer;
BEGIN
  -- Un seul reconstructeur à la fois : le job quotidien et un rattrapage
  -- manuel peuvent se croiser sans se marcher dessus.
  PERFORM pg_advisory_xact_lock(hashtext('alert_load_daily'));

  DELETE FROM alert_load_daily;

  INSERT INTO alert_load_daily (org_id, day, alerts_per_day, measured_at)
  SELECT org_id,
         (created_at AT TIME ZONE 'Europe/Paris')::date AS day,
         count(DISTINCT rule_id)::integer AS alerts_per_day,
         now()
    FROM alert
   WHERE org_id IS NOT NULL
     AND created_at >= now() - interval '30 days'
   GROUP BY org_id, (created_at AT TIME ZONE 'Europe/Paris')::date;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

-- Applique la politique puis republie la mesure. Un seul appel pour le job
-- périodique (`apps/api/src/server.ts`) et pour le rattrapage manuel.
CREATE OR REPLACE FUNCTION apply_alert_fatigue_policy()
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  acknowledged integer;
  published integer;
BEGIN
  acknowledged := acknowledge_duplicate_alerts();
  published := refresh_alert_load_daily();
  RETURN jsonb_build_object(
    'acknowledged_duplicates', acknowledged,
    'daily_rows', published
  );
END;
$$;

-- Rattrapage : le stock existant est traité dès l'application de la migration,
-- sans attendre le premier passage du job périodique.
SELECT apply_alert_fatigue_policy();
