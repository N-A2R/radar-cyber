-- 208 : changements de régime dans les séries OSINT — schéma d'évaluation.
--
-- Un changement de régime est un décalage durable du rythme d'arrivée d'une
-- famille, pas une journée chargée. Le détecteur `weekly-z@1` compare le total
-- d'arrivées des sept derniers jours aux six semaines complètes précédentes
-- (médiane/MAD), puis exige qu'une seconde fenêtre, deux semaines plus tard,
-- reste du côté nouveau. Un pic isolé ou un rattrapage d'import ne devient
-- donc pas une campagne.
--
-- Le critère de sortie se lit directement :
--   SELECT count(*) FILTER (WHERE detected AND delay_days <= 7)::float / count(*)
--     FROM changepoint_eval;   -- cible >= 0,80
--
-- `changepoint_eval` porte une ligne par changement annoté : `detected` est
-- vrai seulement si le détecteur a croisé le seuil au plus tard sept jours
-- après le premier jour du nouveau régime. Les détections tardives (au-delà de
-- sept jours) et les faux positifs restent dans `changepoint_detection` pour
-- l'audit ; elles ne gonflent jamais le dénominateur du critère.
--
-- Aucune donnée personnelle : la fixture est fabriquée, sans victime nommée,
-- sans organisation et sans source réelle.

BEGIN;

CREATE TABLE IF NOT EXISTS changepoint_annotation (
  id               bigserial PRIMARY KEY,
  model            text NOT NULL DEFAULT 'weekly-z@1',
  family           text NOT NULL,
  changepoint_day  date NOT NULL,
  direction        text NOT NULL CHECK (direction IN ('up', 'down')),
  multiplier       numeric(6, 3) NOT NULL CHECK (multiplier > 0),
  rationale        text NOT NULL,
  source           text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model, family, changepoint_day)
);

COMMENT ON TABLE changepoint_annotation IS
  'Changements de régime annotés qui servent de vérité terrain au backtest.';
COMMENT ON COLUMN changepoint_annotation.changepoint_day IS
  'Premier jour du nouveau régime (le palier est appliqué à partir de ce jour).';

CREATE TABLE IF NOT EXISTS changepoint_eval (
  id            bigserial PRIMARY KEY,
  model         text NOT NULL,
  family        text NOT NULL,
  annotated_day date NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('up', 'down')),
  detected      boolean NOT NULL DEFAULT false,
  detected_on   date,
  delay_days    integer,
  score         double precision,
  source        text NOT NULL,
  measured_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model, family, annotated_day),
  CONSTRAINT changepoint_eval_detected_has_date CHECK (
    NOT detected OR (detected_on IS NOT NULL AND delay_days IS NOT NULL)
  ),
  CONSTRAINT changepoint_eval_delay_bounded CHECK (
    delay_days IS NULL OR (delay_days >= 0 AND delay_days <= 7)
  )
);

COMMENT ON TABLE changepoint_eval IS
  'Backtest par changement annoté : détecté au plus tard 7 jours après, et délai.';
COMMENT ON COLUMN changepoint_eval.detected IS
  'Vrai si le seuil a été franchi dans [annotated_day, annotated_day + 7].';
COMMENT ON COLUMN changepoint_eval.delay_days IS
  'detected_on − annotated_day, borné à 0..7 ; NULL si non détecté dans la fenêtre.';

CREATE INDEX IF NOT EXISTS changepoint_eval_detected_idx
  ON changepoint_eval (model, detected) INCLUDE (delay_days);

CREATE TABLE IF NOT EXISTS changepoint_detection (
  id                      bigserial PRIMARY KEY,
  model                   text NOT NULL,
  family                  text NOT NULL,
  detected_on             date NOT NULL,
  confirmed_on            date NOT NULL,
  direction               text NOT NULL CHECK (direction IN ('up', 'down')),
  score                   double precision NOT NULL CHECK (score >= 0),
  baseline_weekly         double precision NOT NULL CHECK (baseline_weekly >= 0),
  level_weekly            double precision NOT NULL CHECK (level_weekly >= 0),
  ratio                   double precision NOT NULL CHECK (ratio >= 0),
  matched_annotation_day  date,
  delay_days              integer CHECK (delay_days IS NULL OR delay_days >= 0),
  false_positive          boolean NOT NULL DEFAULT false,
  source                  text NOT NULL,
  measured_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model, family, detected_on),
  CONSTRAINT changepoint_detection_fp_has_no_match CHECK (
    NOT false_positive OR matched_annotation_day IS NULL
  ),
  CONSTRAINT changepoint_detection_match_has_delay CHECK (
    matched_annotation_day IS NULL OR delay_days IS NOT NULL
  )
);

COMMENT ON TABLE changepoint_detection IS
  'Toutes les détections confirmées, y compris tardives et faux positifs, pour l''audit.';
COMMENT ON COLUMN changepoint_detection.detected_on IS
  'Premier jour où la fenêtre de sept jours a franchi le seuil.';
COMMENT ON COLUMN changepoint_detection.confirmed_on IS
  'Jour de la seconde fenêtre qui confirme le palier.';
COMMENT ON COLUMN changepoint_detection.false_positive IS
  'Vrai si aucune annotation de la même famille ne précède la détection de 0 à 21 jours.';

CREATE INDEX IF NOT EXISTS changepoint_detection_fp_idx
  ON changepoint_detection (model, false_positive) INCLUDE (detected_on);

CREATE TABLE IF NOT EXISTS changepoint_metric (
  model                     text PRIMARY KEY,
  annotated                 integer NOT NULL CHECK (annotated > 0),
  detected_within_7         integer NOT NULL CHECK (detected_within_7 >= 0),
  detection_rate            double precision NOT NULL CHECK (detection_rate >= 0 AND detection_rate <= 1),
  false_positives           integer NOT NULL CHECK (false_positives >= 0),
  evaluated_days            integer NOT NULL CHECK (evaluated_days > 0),
  false_positives_per_year  double precision NOT NULL CHECK (false_positives_per_year >= 0),
  late_detections           integer NOT NULL CHECK (late_detections >= 0),
  median_delay_days         double precision,
  average_delay_days        double precision,
  baseline_weeks            integer NOT NULL CHECK (baseline_weeks >= 2),
  z_threshold               double precision NOT NULL CHECK (z_threshold > 0),
  confirm_days              integer NOT NULL CHECK (confirm_days >= 1),
  source                    text NOT NULL,
  measured_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT changepoint_metric_detected_bounded CHECK (detected_within_7 <= annotated)
);

COMMENT ON TABLE changepoint_metric IS
  'Résumé du backtest : taux de détection, faux positifs par an, délais.';

COMMIT;
