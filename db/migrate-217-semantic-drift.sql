-- 217 : dérive sémantique des flux — observations, détections et évaluation.
--
-- Un flux change de vocabulaire ou de couverture quand la distribution de ses
-- termes OU de ses zones sur une fenêtre glissante de 7 jours s'écarte de la
-- distribution de référence des 28 jours précédents. Le détecteur
-- `jsd-coverage@1` utilise la divergence de Jensen-Shannon (bornée dans [0,1])
-- et un seuil calibré sur l'historique propre à chaque flux : un flux bavard
-- n'a pas le même bruit qu'un flux sobre. Deux jours consécutifs au-dessus du
-- seuil sont nécessaires pour émettre une alerte, ce qui écarte les pics
-- isolés et les rattrapages d'import.
--
-- Le critère de sortie se lit directement dans les tables :
--   SELECT count(*) FILTER (WHERE early) AS confirmed_early, count(*) AS target
--     FROM semantic_drift_eval WHERE model = 'jsd-coverage@1';   -- cible >= 5
--   SELECT count(*) AS alerts
--     FROM semantic_drift_alert a
--     JOIN semantic_drift_feed f USING (source_id)
--    WHERE f.expected = 'unchanged';                              -- cible 0
--
-- `semantic_drift_annotation` porte le signalement manuel de l'analyste
-- (`reported_day`) et le premier jour de la dérive (`onset_day`) connu après
-- coup. Une dérive n'est comptée que si l'alerte précède le signalement
-- d'au moins 7 jours : `early` est vrai seulement dans ce cas. Les alertes sur
-- les flux synthétiques inchangés restent auditables et ne sont jamais
-- exclues du décompte des faux positifs.
--
-- Aucune donnée personnelle, aucun secret, aucune source réelle : les jeux de
-- test utilisent des identifiants `DRIFT-*`/`STABLE-*`, des termes génériques
-- et des zones `ZONE-*`. Ce schéma ne contient aucune ligne de fixture ; le
-- vérificateur insère la sienne dans une base de test éphémère.

BEGIN;

CREATE TABLE IF NOT EXISTS semantic_drift_feed (
  source_id text PRIMARY KEY,
  expected  text NOT NULL CHECK (expected IN ('drift', 'unchanged')),
  label     text NOT NULL,
  source    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE semantic_drift_feed IS
  'Flux synthétiques du jeu de test : expected=drift attend une dérive, unchanged ne doit jamais alerter.';

CREATE TABLE IF NOT EXISTS semantic_drift_observation (
  source_id text NOT NULL REFERENCES semantic_drift_feed(source_id) ON DELETE CASCADE,
  day        date NOT NULL,
  terms      jsonb NOT NULL,
  coverage   jsonb NOT NULL,
  source     text NOT NULL,
  PRIMARY KEY (source_id, day),
  CONSTRAINT semantic_drift_observation_terms_object CHECK (jsonb_typeof(terms) = 'object'),
  CONSTRAINT semantic_drift_observation_coverage_object CHECK (jsonb_typeof(coverage) = 'object')
);

COMMENT ON TABLE semantic_drift_observation IS
  'Histogramme quotidien des termes et des zones d''un flux ; aucune donnée personnelle.';

CREATE TABLE IF NOT EXISTS semantic_drift_annotation (
  source_id    text NOT NULL REFERENCES semantic_drift_feed(source_id) ON DELETE CASCADE,
  model        text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('vocabulaire', 'couverture')),
  onset_day    date NOT NULL,
  reported_day date NOT NULL,
  rationale    text NOT NULL,
  source       text NOT NULL,
  PRIMARY KEY (source_id, onset_day),
  CONSTRAINT semantic_drift_annotation_report_after_onset CHECK (reported_day > onset_day)
);

COMMENT ON COLUMN semantic_drift_annotation.reported_day IS
  'Date du signalement manuel de l''analyste, vérité terrain du délai.';

CREATE TABLE IF NOT EXISTS semantic_drift_alert (
  id              bigserial PRIMARY KEY,
  source_id       text NOT NULL REFERENCES semantic_drift_feed(source_id) ON DELETE CASCADE,
  model           text NOT NULL,
  day             date NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('vocabulaire', 'couverture')),
  score           double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  threshold       double precision NOT NULL CHECK (threshold > 0 AND threshold <= 1),
  baseline_score  double precision NOT NULL CHECK (baseline_score >= 0 AND baseline_score <= 1),
  source          text NOT NULL,
  measured_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, model, day)
);

COMMENT ON TABLE semantic_drift_alert IS
  'Alertes émises par le détecteur, y compris celles sur flux inchangés (faux positifs auditables).';

CREATE TABLE IF NOT EXISTS semantic_drift_eval (
  source_id    text NOT NULL REFERENCES semantic_drift_feed(source_id) ON DELETE CASCADE,
  model        text NOT NULL,
  onset_day    date NOT NULL,
  reported_day date NOT NULL,
  detected_on  date,
  lead_days    integer,
  early        boolean NOT NULL DEFAULT false,
  source       text NOT NULL,
  measured_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, model, onset_day),
  CONSTRAINT semantic_drift_eval_detected_has_day CHECK (
    NOT (detected_on IS NOT NULL) OR lead_days IS NOT NULL
  ),
  CONSTRAINT semantic_drift_eval_early_requires_lead CHECK (
    NOT early OR (detected_on IS NOT NULL AND lead_days >= 7 AND detected_on <= reported_day - INTERVAL '7 days')
  )
);

COMMENT ON COLUMN semantic_drift_eval.lead_days IS
  'reported_day − detected_on : nombre de jours gagnés sur le signalement manuel.';
COMMENT ON COLUMN semantic_drift_eval.early IS
  'Vrai si et seulement si l''alerte a précédé le signalement d''au moins 7 jours.';

CREATE TABLE IF NOT EXISTS semantic_drift_metric (
  model             text PRIMARY KEY,
  annotated_drifts  integer NOT NULL CHECK (annotated_drifts > 0),
  confirmed_early   integer NOT NULL CHECK (confirmed_early >= 0),
  unchanged_sources integer NOT NULL CHECK (unchanged_sources > 0),
  unchanged_alerts  integer NOT NULL CHECK (unchanged_alerts >= 0),
  median_lead_days  double precision,
  window_days       integer NOT NULL CHECK (window_days > 0),
  baseline_days     integer NOT NULL CHECK (baseline_days > 0),
  min_score         double precision NOT NULL CHECK (min_score > 0),
  sensitivity       double precision NOT NULL CHECK (sensitivity > 0),
  confirm_days      integer NOT NULL CHECK (confirm_days > 0),
  source            text NOT NULL,
  measured_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT semantic_drift_metric_early_bounded CHECK (confirmed_early <= annotated_drifts)
);

COMMENT ON TABLE semantic_drift_metric IS
  'Résumé recalculable du critère : dérives confirmées à >= 7 jours et alertes sur flux inchangés.';

CREATE INDEX IF NOT EXISTS semantic_drift_alert_model_day_idx
  ON semantic_drift_alert (model, day);
CREATE INDEX IF NOT EXISTS semantic_drift_eval_early_idx
  ON semantic_drift_eval (model, early) INCLUDE (lead_days);

COMMIT;
