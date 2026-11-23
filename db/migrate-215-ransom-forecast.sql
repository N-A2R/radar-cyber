-- 215 — prévision à 30 jours des revendications rançongiciel régionales.
--
-- `model_eval` ne portait pas encore de PR-AUC (la mesure STL la rangeait dans
-- `model_metric`). Le critère du chantier lit directement la colonne :
--
--   SELECT pr_auc FROM model_eval
--    WHERE model = 'ransom_forecast' AND horizon_days = 30;
--
-- Une seule ligne résumé porte ce modèle : `family = 'na_weekly_claims'`,
-- `eval_day` = dernier dimanche complet de la série, `score` = PR-AUC. Les
-- observations semaine par semaine (score du modèle, λ Poisson, étiquette)
-- sont détaillées dans `ransom_forecast_eval` pour rendre le chiffre auditable.
--
-- Aucune donnée personnelle : seules des agrégations de revendications déjà
-- rattachées à la Nouvelle-Aquitaine (`leak_claim.na`) et de fuites connues.

BEGIN;

ALTER TABLE model_eval ADD COLUMN IF NOT EXISTS pr_auc double precision;
ALTER TABLE model_eval ADD COLUMN IF NOT EXISTS pr_auc_baseline double precision;
ALTER TABLE model_eval ADD COLUMN IF NOT EXISTS pr_auc_gain double precision;

COMMENT ON COLUMN model_eval.pr_auc IS
  'Average precision (PR-AUC) sur le jeu de test temporel ; NULL pour les autres modèles.';
COMMENT ON COLUMN model_eval.pr_auc_baseline IS
  'PR-AUC du modèle de Poisson de référence sur le même jeu de test.';
COMMENT ON COLUMN model_eval.pr_auc_gain IS
  'pr_auc - pr_auc_baseline, sur le même jeu de test.';

ALTER TABLE model_eval DROP CONSTRAINT IF EXISTS model_eval_pr_auc_range;
ALTER TABLE model_eval ADD CONSTRAINT model_eval_pr_auc_range
  CHECK (
    (pr_auc IS NULL OR (pr_auc >= 0 AND pr_auc <= 1))
    AND (pr_auc_baseline IS NULL OR (pr_auc_baseline >= 0 AND pr_auc_baseline <= 1))
    AND (pr_auc_gain IS NULL OR (pr_auc_gain >= -1 AND pr_auc_gain <= 1))
  );

ALTER TABLE model_eval DROP CONSTRAINT IF EXISTS model_eval_forecast_has_pr_auc;
ALTER TABLE model_eval ADD CONSTRAINT model_eval_forecast_has_pr_auc
  CHECK (
    model <> 'ransom_forecast'
    OR (pr_auc IS NOT NULL AND pr_auc_baseline IS NOT NULL AND pr_auc_gain IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS ransom_forecast_eval (
  origin_week      date NOT NULL,
  split            text NOT NULL CHECK (split IN ('train', 'test')),
  claims_next_30d  integer NOT NULL CHECK (claims_next_30d >= 0),
  label            boolean NOT NULL,
  model_score      double precision NOT NULL CHECK (model_score >= 0 AND model_score <= 1),
  poisson_lambda   double precision NOT NULL CHECK (poisson_lambda >= 0),
  poisson_score    double precision NOT NULL CHECK (poisson_score >= 0 AND poisson_score <= 1),
  source           text NOT NULL,
  measured_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origin_week, source)
);

COMMENT ON TABLE ransom_forecast_eval IS
  'Backtest hebdomadaire ransom_forecast : une ligne par origine, split temporel inclus.';
COMMENT ON COLUMN ransom_forecast_eval.claims_next_30d IS
  'Nombre de leak_claim.na publiés dans les 30 jours suivant la fin de origin_week.';
COMMENT ON COLUMN ransom_forecast_eval.poisson_lambda IS
  'Espérance Poisson estimée sur les 364 jours précédant l''origine (52 semaines).';

CREATE INDEX IF NOT EXISTS ransom_forecast_eval_split_idx
  ON ransom_forecast_eval (source, split, origin_week);

COMMIT;
