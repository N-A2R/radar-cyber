-- 216 — mesure de référence de la prévision rançongiciel à 30 jours.
--
-- Valeurs produites par `scripts/mesure-ransom-forecast.mts` sur les
-- revendications NA et les fuites présentes dans le corpus au 2026-11-23 :
--   354 semaines, apprentissage avant 2025-01-01, test de 2025-01-06 au
--   2026-10-12 (93 origines, 81 positives).
--
-- Le script rejoue le backtest et met cette ligne à jour de façon idempotente.
-- Le détail des 354 origines est écrit dans `ransom_forecast_eval` ; cette
-- migration ne sème que la ligne résumé lue par le critère.
--
-- Critère : SELECT pr_auc FROM model_eval
--            WHERE model = 'ransom_forecast' AND horizon_days = 30;
--
-- Aucune donnée personnelle, aucun secret, aucune source nationale présentée
-- comme locale : seules des agrégations de `leak_claim.na` sont utilisées.

BEGIN;

INSERT INTO model_eval
  (model, family, eval_day, score, label, tp, detected_on, delay_days,
   window_days, source, horizon_days, pr_auc, pr_auc_baseline, pr_auc_gain)
VALUES
  ('ransom_forecast', 'na_weekly_claims', '2026-10-12',
   0.9392569031986007, true, false, NULL, NULL,
   364, 'ransom-forecast-30j-v1', 30,
   0.9392569031986007, 0.83789128649141, 0.10136561670719069)
ON CONFLICT (model, family, eval_day) DO UPDATE SET
  score = EXCLUDED.score,
  label = EXCLUDED.label,
  tp = EXCLUDED.tp,
  detected_on = EXCLUDED.detected_on,
  delay_days = EXCLUDED.delay_days,
  window_days = EXCLUDED.window_days,
  source = EXCLUDED.source,
  horizon_days = EXCLUDED.horizon_days,
  pr_auc = EXCLUDED.pr_auc,
  pr_auc_baseline = EXCLUDED.pr_auc_baseline,
  pr_auc_gain = EXCLUDED.pr_auc_gain,
  measured_at = now();

COMMIT;
