-- 223 — risque prospectif des organisations et courbe de calibration archivée.
--
-- Le score n'est pas un volume d'alertes : il combine des faits datés avant
-- `asOf` (incidents confirmés pondérés par âge/gravité, revendications
-- corroborées, exposition de services) et une probabilité d'incident confirmé
-- dans les 90 jours suivants. La mesure est rejouable sur un benchmark
-- déterministe de 120 organisations dont 40 ont un incident confirmé en 2026
-- (split 2024-2025 -> 2026).
--
-- Critère lu tel quel :
--   SELECT c_index FROM model_eval WHERE model='org_risk' AND horizon_days=90;
--
-- `model_eval` porte le résumé (c_index, horizon), `org_risk_calibration_curve`
-- les 10 strates de fiabilité, `org_risk_score` les 10 261 scores d'organisations.
-- Aucun nom, aucune donnée personnelle, aucun secret, aucun texte libre
-- d'événement : uniquement des identifiants numériques et des agrégats.

BEGIN;

ALTER TABLE model_eval DROP CONSTRAINT IF EXISTS model_eval_org_risk_has_metrics;
ALTER TABLE model_eval ADD CONSTRAINT model_eval_org_risk_has_metrics
  CHECK (model <> 'org_risk' OR (c_index IS NOT NULL AND horizon_days = 90));

COMMENT ON COLUMN model_eval.c_index IS
  'Concordance de Harrell (0–1) pour risk_static/risk_decay et org_risk ; NULL pour le backtest STL.';

CREATE TABLE IF NOT EXISTS org_risk_calibration_curve (
  model                text NOT NULL DEFAULT 'org_risk',
  horizon_days         integer NOT NULL DEFAULT 90 CHECK (horizon_days > 0),
  bin_index            integer NOT NULL CHECK (bin_index >= 0),
  score_min            double precision NOT NULL,
  score_max            double precision NOT NULL CHECK (score_max >= score_min),
  count                integer NOT NULL CHECK (count > 0),
  positives            integer NOT NULL CHECK (positives >= 0 AND positives <= count),
  predicted_probability double precision NOT NULL CHECK (predicted_probability >= 0 AND predicted_probability <= 1),
  observed_rate        double precision NOT NULL CHECK (observed_rate >= 0 AND observed_rate <= 1),
  ece_contrib          double precision NOT NULL CHECK (ece_contrib >= 0),
  source               text NOT NULL,
  measured_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, horizon_days, bin_index)
);

COMMENT ON TABLE org_risk_calibration_curve IS
  'Courbe de fiabilité archivée du score org_risk : 10 strates de rang à effectif égal (12 organisations).';
COMMENT ON COLUMN org_risk_calibration_curve.predicted_probability IS
  'Probabilité moyenne prédite dans la strate après mise à l''échelle logistique.';
COMMENT ON COLUMN org_risk_calibration_curve.observed_rate IS
  'Fréquence observée d''incidents confirmés à 90 jours dans la strate.';

CREATE TABLE IF NOT EXISTS org_risk_score (
  org_id               integer PRIMARY KEY,
  model                text NOT NULL,
  score                double precision NOT NULL CHECK (score >= 0),
  probability          double precision NOT NULL CHECK (probability >= 0 AND probability <= 1),
  prior_confirmed      integer NOT NULL DEFAULT 0 CHECK (prior_confirmed >= 0),
  corroborated_claims  integer NOT NULL DEFAULT 0 CHECK (corroborated_claims >= 0),
  exposed_services     integer NOT NULL DEFAULT 0 CHECK (exposed_services >= 0),
  epss_max             double precision NOT NULL DEFAULT 0 CHECK (epss_max >= 0 AND epss_max <= 1),
  prior_alert_volume   integer NOT NULL DEFAULT 0 CHECK (prior_alert_volume >= 0),
  computed_at          timestamptz NOT NULL DEFAULT now(),
  source               text NOT NULL
);

COMMENT ON TABLE org_risk_score IS
  'Scores prospectifs du référentiel : identifiants numériques et agrégats publics uniquement.';
COMMENT ON COLUMN org_risk_score.prior_alert_volume IS
  'Nombre brut de faits avant asOf : baseline « volume » que le score prospectif doit battre.';

CREATE INDEX IF NOT EXISTS org_risk_score_probability_idx
  ON org_risk_score (model, probability DESC);

COMMIT;
