-- 228 — seconde victime d'une campagne déjà identifiée.
--
-- Règle `second-victim@1` :
--   1. deux événements d'une même campagne, d'organisations distinctes, forment
--      une paire s'ils partagent au moins un IOC et si le second est observé
--      au plus 30 jours après le premier ;
--   2. dès qu'un IOC est observé, toute organisation déjà exposée à cet IOC
--      (exposition connue AVANT l'événement, jamais déduite de la victime
--      suivante) reçoit une prédiction « victime probable dans les 30 jours »,
--      horodatée à l'instant où le radar a appris le premier événement ;
--   3. la paire est dite prédite si cette prédiction existe et précède
--      strictement l'`at` du second événement.
--
-- Le corpus semé est un benchmark fabriqué : clés opaques `org-sv-*`,
-- domaines `.invalid`, origine explicite `benchmark-second-victim@1`. Aucune
-- organisation réelle, aucun contact, aucune source nationale n'est présentée
-- comme locale. Ce jeu est indépendant des événements de production afin
-- d'être rejouable sur une base neuve.

BEGIN;

CREATE TABLE IF NOT EXISTS second_victim_event (
  event_key    text        PRIMARY KEY,
  campaign_key text        NOT NULL,
  org_key      text        NOT NULL,
  family       text        NOT NULL,
  at           timestamptz NOT NULL,   -- équivalent de event.at : date d'apprentissage
  ioc          text[]      NOT NULL DEFAULT '{}'::text[],
  origin       text        NOT NULL DEFAULT 'benchmark-second-victim@1',
  CONSTRAINT second_victim_event_ioc_non_vide
    CHECK (cardinality(ioc) > 0 AND array_position(ioc, '') IS NULL)
);

CREATE INDEX IF NOT EXISTS second_victim_event_campaign_idx
  ON second_victim_event (campaign_key, at);

COMMENT ON COLUMN second_victim_event.at IS
  'Instant où le radar a appris l''événement (même sémantique que event.at).';
COMMENT ON COLUMN second_victim_event.org_key IS
  'Identifiant opaque de l''organisation victime ; aucun nom n''est stocké.';

-- Connaissance disponible AVANT la prédiction (par exemple une exposition
-- d'actif observée par une source passive). Son horodatage est une preuve
-- d'antériorité : une exposition apprise après le premier événement ne doit
-- pas pouvoir servir à prédire la seconde victime.
CREATE TABLE IF NOT EXISTS second_victim_exposure (
  ioc       text        NOT NULL,
  org_key   text        NOT NULL,
  known_at  timestamptz NOT NULL,
  basis     text        NOT NULL DEFAULT 'benchmark-pdns',
  origin    text        NOT NULL DEFAULT 'benchmark-second-victim@1',
  PRIMARY KEY (ioc, org_key)
);

CREATE TABLE IF NOT EXISTS second_victim_prediction (
  prediction_key  text        PRIMARY KEY,
  first_event_key text        NOT NULL REFERENCES second_victim_event(event_key) ON DELETE CASCADE,
  target_org_key  text        NOT NULL,
  ioc             text        NOT NULL,
  predicted_at    timestamptz NOT NULL,
  horizon_days    integer     NOT NULL DEFAULT 30 CHECK (horizon_days = 30),
  rule_version    text        NOT NULL DEFAULT 'second-victim@1',
  origin          text        NOT NULL DEFAULT 'benchmark-second-victim@1'
);

CREATE TABLE IF NOT EXISTS second_victim_pair (
  first_event_key  text        NOT NULL REFERENCES second_victim_event(event_key) ON DELETE CASCADE,
  second_event_key text        NOT NULL REFERENCES second_victim_event(event_key) ON DELETE CASCADE,
  campaign_key     text        NOT NULL,
  target_org_key   text        NOT NULL,
  ioc              text        NOT NULL,
  iocs             text[]      NOT NULL,
  gap_days         numeric     NOT NULL CHECK (gap_days > 0 AND gap_days <= 30),
  prediction_key   text,
  predicted_at     timestamptz,
  lead_days        numeric,
  predicted_before boolean     NOT NULL,
  rule_version     text        NOT NULL DEFAULT 'second-victim@1',
  PRIMARY KEY (first_event_key, second_event_key)
);

CREATE OR REPLACE VIEW second_victim_score AS
SELECT count(*)::integer                                             AS paires,
       count(*) FILTER (WHERE predicted_before)::integer             AS predites_avant,
       CASE WHEN count(*) = 0 THEN 0::numeric
            ELSE round((count(*) FILTER (WHERE predicted_before))::numeric / count(*), 4)
       END                                                           AS taux
  FROM second_victim_pair;

/**
 * Recalcule prédictions et paires depuis les observations. Le SQL est la
 * source de vérité de la règle : aucun module TypeScript ne la duplique.
 */
CREATE OR REPLACE FUNCTION refresh_second_victim_predictions() RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  total integer;
BEGIN
  DELETE FROM second_victim_pair;
  DELETE FROM second_victim_prediction;

  -- Une prédiction n'utilise que l'IOC observé et les expositions déjà connues
  -- à cet instant : l'événement futur n'intervient pas dans sa fabrication.
  INSERT INTO second_victim_prediction
    (prediction_key, first_event_key, target_org_key, ioc, predicted_at, rule_version, origin)
  SELECT DISTINCT
         a.event_key || '>' || e.org_key || '>' || e.ioc,
         a.event_key, e.org_key, e.ioc, a.at, 'second-victim@1',
         'benchmark-second-victim@1'
    FROM second_victim_event a
    CROSS JOIN LATERAL unnest(a.ioc) AS signal(ioc)
    JOIN second_victim_exposure e
      ON e.ioc = signal.ioc
     AND e.org_key <> a.org_key
     AND e.known_at <= a.at;

  WITH paires AS (
    SELECT a.event_key AS first_event_key,
           b.event_key AS second_event_key,
           a.campaign_key,
           b.org_key   AS target_org_key,
           min(signal.ioc) AS ioc,
           array_agg(DISTINCT signal.ioc ORDER BY signal.ioc) AS iocs,
           extract(epoch FROM (b.at - a.at)) / 86400.0 AS gap_days
      FROM second_victim_event a
      JOIN second_victim_event b
        ON b.campaign_key = a.campaign_key
       AND b.org_key <> a.org_key
       AND b.at > a.at
       AND b.at - a.at <= interval '30 days'
      CROSS JOIN LATERAL unnest(a.ioc) AS signal(ioc)
      JOIN LATERAL unnest(b.ioc) AS cible(ioc) ON cible.ioc = signal.ioc
     GROUP BY a.event_key, b.event_key, a.campaign_key, b.org_key, a.at, b.at
  )
  INSERT INTO second_victim_pair
    (first_event_key, second_event_key, campaign_key, target_org_key, ioc, iocs,
     gap_days, prediction_key, predicted_at, lead_days, predicted_before, rule_version)
  SELECT p.first_event_key, p.second_event_key, p.campaign_key, p.target_org_key,
         p.ioc, p.iocs, p.gap_days, pr.prediction_key, pr.predicted_at,
         extract(epoch FROM (b.at - pr.predicted_at)) / 86400.0 AS lead_days,
         (pr.prediction_key IS NOT NULL AND pr.predicted_at < b.at) AS predicted_before,
         'second-victim@1'
    FROM paires p
    JOIN second_victim_event b ON b.event_key = p.second_event_key
    LEFT JOIN second_victim_prediction pr
      ON pr.first_event_key = p.first_event_key
     AND pr.target_org_key = p.target_org_key
     AND pr.ioc = p.ioc;

  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$fn$;

-- 32 paires qualifiantes : 24 avec exposition antérieure (prédictibles),
-- 8 sans exposition (échecs assumés du benchmark, taux attendu 24/32 = 75 %).
-- 4 leurres : 2 écarts > 30 j, 2 sans IOC partagé ; ils ne comptent pas.
WITH campagnes AS (
  SELECT i,
         'sv-camp-' || lpad(i::text, 2, '0') AS campaign_key,
         'org-sv-a-' || lpad(i::text, 2, '0') AS org_a,
         'org-sv-b-' || lpad(i::text, 2, '0') AS org_b,
         'ioc-sv-' || lpad(i::text, 2, '0') || '.invalid' AS ioc,
         timestamptz '2026-01-05 00:00:00+00' + (i - 1) * interval '2 days' AS premier_at,
         CASE WHEN i BETWEEN 33 AND 34 THEN 31 + (i - 32)
              ELSE 3 + (i % 12)
         END AS ecart_jours
    FROM generate_series(1, 36) i
)
INSERT INTO second_victim_event (event_key, campaign_key, org_key, family, at, ioc, origin)
SELECT campaign_key || '-first', campaign_key, org_a, 'benchmark-campagne',
       premier_at, ARRAY[ioc], 'benchmark-second-victim@1'
  FROM campagnes
UNION ALL
SELECT campaign_key || '-second', campaign_key, org_b, 'benchmark-campagne',
       premier_at + ecart_jours * interval '1 day',
       CASE WHEN i BETWEEN 35 AND 36
            THEN ARRAY['ioc-sv-x-' || lpad(i::text, 2, '0') || '.invalid']
            ELSE ARRAY[ioc]
       END,
       'benchmark-second-victim@1'
  FROM campagnes;

INSERT INTO second_victim_exposure (ioc, org_key, known_at, basis, origin)
SELECT 'ioc-sv-' || lpad(i::text, 2, '0') || '.invalid',
       'org-sv-b-' || lpad(i::text, 2, '0'),
       timestamptz '2026-01-05 00:00:00+00' + (i - 1) * interval '2 days' - interval '5 days',
       'benchmark-pdns',
       'benchmark-second-victim@1'
  FROM generate_series(1, 24) i;

SELECT refresh_second_victim_predictions() AS paires_calculees;

COMMIT;
