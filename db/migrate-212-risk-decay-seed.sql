-- 212 — mesure de référence de la décroissance du risque (240 jours).
--
-- Valeurs produites par `scripts/mesure-risk-decay.mts` sur
-- `bench/risk-decay/params.json`. Le benchmark est déterministe : la graine,
-- les 400 entités synthétiques et les mêmes tirages reproduisent exactement
-- ces nombres. Le script met les lignes à jour de façon idempotente et
-- `scripts/verifie-risk-decay.mts` rejoue le benchmark puis contrôle ces
-- valeurs et le critère SQL.
--
-- Découpage : 2025-11-01 → 2026-06-29 (240 jours de faits), issue dans les
-- 90 jours suivants. 187 entités positives, 213 négatives, 38 043 faits.
-- Demi-vie du modèle à décroissance : 14 jours.
--
-- Aucun fait réel, aucune organisation, aucune donnée personnelle.

BEGIN;

INSERT INTO model_eval
  (model, family, eval_day, score, label, tp, detected_on, delay_days,
   window_days, source, c_index, horizon_days)
VALUES
  ('risk_static', '__overall__', '2026-06-29', 0.5526850945243654, true, false, NULL, NULL,
   240, 'benchmark-risk-decay-240j', 0.5526850945243654, 90),
  ('risk_decay', '__overall__', '2026-06-29', 0.6501217644548216, true, false, NULL, NULL,
   240, 'benchmark-risk-decay-240j', 0.6501217644548216, 90)
ON CONFLICT (model, family, eval_day) DO UPDATE SET
  score = EXCLUDED.score,
  label = EXCLUDED.label,
  tp = EXCLUDED.tp,
  detected_on = EXCLUDED.detected_on,
  delay_days = EXCLUDED.delay_days,
  window_days = EXCLUDED.window_days,
  source = EXCLUDED.source,
  c_index = EXCLUDED.c_index,
  horizon_days = EXCLUDED.horizon_days,
  measured_at = now();

INSERT INTO risk_model_metric
  (model, horizon_days, n_entities, n_positives, n_negatives, n_facts,
   c_index, pairs, half_life_days, source)
VALUES
  ('risk_static', 90, 400, 187, 213, 38043, 0.5526850945243654, 39831, NULL, 'benchmark-risk-decay-240j'),
  ('risk_decay', 90, 400, 187, 213, 38043, 0.6501217644548216, 39831, 14, 'benchmark-risk-decay-240j')
ON CONFLICT (model, horizon_days) DO UPDATE SET
  n_entities = EXCLUDED.n_entities,
  n_positives = EXCLUDED.n_positives,
  n_negatives = EXCLUDED.n_negatives,
  n_facts = EXCLUDED.n_facts,
  c_index = EXCLUDED.c_index,
  pairs = EXCLUDED.pairs,
  half_life_days = EXCLUDED.half_life_days,
  source = EXCLUDED.source,
  measured_at = now();

COMMIT;
