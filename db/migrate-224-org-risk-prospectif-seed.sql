-- 224 — mesure de référence du risque prospectif (split 2024-2025 → 2026).
--
-- Valeurs produites par `scripts/mesure-org-risk-prospectif.mts` sur
-- `bench/org-risk/params.json` (graine 20261123). Le benchmark est
-- déterministe : les mêmes tirages et le même score reproduisent 0,77 et la
-- courbe ci-dessous. Le script met la ligne à jour de façon idempotente et
-- `bench/results/org-risk-prospectif.json` garde les 120 prédictions.
--
-- 120 organisations, 40 incidents confirmés à 90 jours, 1 186 faits avant
-- 2026-01-01. Aucune organisation réelle, aucun nom, aucune donnée personnelle.

BEGIN;

INSERT INTO model_eval
  (model, family, eval_day, score, label, tp, detected_on, delay_days,
   window_days, source, c_index, horizon_days)
VALUES
  ('org_risk', '__overall__', '2026-01-01', 0.77, true, false, NULL, NULL,
   731, 'benchmark-org-risk-prospectif-20261123', 0.77, 90)
ON CONFLICT (model, family, eval_day) DO UPDATE SET
  score = EXCLUDED.score,
  source = EXCLUDED.source,
  c_index = EXCLUDED.c_index,
  horizon_days = EXCLUDED.horizon_days,
  measured_at = now();

INSERT INTO org_risk_calibration_curve
  (model, horizon_days, bin_index, score_min, score_max, count, positives,
   predicted_probability, observed_rate, ece_contrib, source)
VALUES
  ('org_risk', 90, 0, 0.05976069969095152, 0.21209968244094904, 12, 0, 0.12399614762657311, 0, 0.012399614762657312, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 1, 0.21821455053525085, 0.3467444784359671, 12, 3, 0.1443478226716837, 0.25, 0.01056521773283163, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 2, 0.34876623187129, 0.4147105933662002, 12, 4, 0.16011848988129734, 0.3333333333333333, 0.017321484345203596, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 3, 0.4229922413882168, 0.49059897732249913, 12, 0, 0.1716657240187726, 0, 0.01716657240187726, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 4, 0.5078727235320231, 0.8230191249014688, 12, 4, 0.21135734910044757, 0.3333333333333333, 0.012197598423288575, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 5, 0.8437055935442732, 0.9979202667643987, 12, 2, 0.265943069524983, 0.16666666666666666, 0.009927640285831632, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 6, 1.0076719853269793, 1.1616596158902983, 12, 2, 0.3081400811322723, 0.16666666666666666, 0.014147341446560567, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 7, 1.192655645746666, 1.663524586514238, 12, 7, 0.40544275473448727, 0.5833333333333334, 0.017789057859884612, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 8, 1.666141523513101, 2.924285873019084, 12, 8, 0.6260245520207438, 0.6666666666666666, 0.004064211464592282, 'benchmark-org-risk-prospectif-20261123'),
  ('org_risk', 90, 9, 2.9811877256487658, 8.154701144116531, 12, 10, 0.9162973426220732, 0.8333333333333334, 0.008296400928873982, 'benchmark-org-risk-prospectif-20261123')
ON CONFLICT (model, horizon_days, bin_index) DO UPDATE SET
  score_min = EXCLUDED.score_min,
  score_max = EXCLUDED.score_max,
  count = EXCLUDED.count,
  positives = EXCLUDED.positives,
  predicted_probability = EXCLUDED.predicted_probability,
  observed_rate = EXCLUDED.observed_rate,
  ece_contrib = EXCLUDED.ece_contrib,
  source = EXCLUDED.source,
  measured_at = now();

COMMIT;
