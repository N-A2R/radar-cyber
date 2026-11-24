-- 221 — mesure d'injection contrôlée du 2026-11-23.
--
-- Valeurs produites par `scripts/mesure-injection.mts` sur la base de
-- préproduction : 30 scénarios synthétiques injectés, moteur d'alertes réel,
-- 30/30 alertes visibles en moins d'une seconde, 30 jours de contrôle sans
-- aucune alerte. Le détail par scénario et par jour est dans
-- `bench/results/injection-eval.json` ; le script rejoue la mesure et remplace
-- ces lignes de façon idempotente.
--
-- Critère :
--   SELECT count(*) FILTER (WHERE detected AND latency_s<=60)::float/count(*)
--     FROM injection_eval;                                  -- 1
--   SELECT count(*) FROM injection_eval WHERE control_period AND alerted;
--                                                           -- 0
--
-- Aucune donnée personnelle, aucun secret, aucune source nationale présentée
-- comme locale : scénarios et organisations fictifs, URL example.invalid.

BEGIN;

INSERT INTO injection_eval
  (run_id, scenario_id, control_period, family, rule_expected, injected_at,
   event_ids, alert_ids, detected, alerted, latency_s, source)
VALUES
  ('injection-eval-v1', 'SC-01', false, 'ransomware', 'ransomware-revendication', '2026-11-23 22:00:00+00', ARRAY[142874,142875,142876]::bigint[], ARRAY[2709,2710,2711,2712]::int[], true, true, 0.618, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-02', false, 'ransomware', 'ransomware-revendication', '2026-11-23 22:00:00+00', ARRAY[142877,142878,142879]::bigint[], ARRAY[2713,2714,2715,2716]::int[], true, true, 0.068, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-03', false, 'ransomware', 'ransomware-revendication', '2026-11-23 22:00:00+00', ARRAY[142880,142881,142882]::bigint[], ARRAY[2717,2718,2719,2720]::int[], true, true, 0.052, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-04', false, 'ransomware', 'ransomware-revendication', '2026-11-23 22:00:00+00', ARRAY[142883,142884,142885]::bigint[], ARRAY[2721,2722,2723,2724]::int[], true, true, 0.059, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-05', false, 'ransomware', 'ransomware-revendication', '2026-11-23 22:00:00+00', ARRAY[142886,142887,142888]::bigint[], ARRAY[2725,2726,2727,2728]::int[], true, true, 0.066, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-06', false, 'cti', 'incident-confirme', '2026-11-23 22:00:00+00', ARRAY[142889,142890,142891]::bigint[], ARRAY[2729]::int[], true, true, 0.078, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-07', false, 'cti', 'incident-confirme', '2026-11-23 22:00:00+00', ARRAY[142892,142893,142894]::bigint[], ARRAY[2730]::int[], true, true, 0.055, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-08', false, 'cti', 'incident-confirme', '2026-11-23 22:00:00+00', ARRAY[142895,142896,142897]::bigint[], ARRAY[2731]::int[], true, true, 0.060, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-09', false, 'cti', 'incident-confirme', '2026-11-23 22:00:00+00', ARRAY[142898,142899,142900]::bigint[], ARRAY[2732]::int[], true, true, 0.052, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-10', false, 'cti', 'incident-confirme', '2026-11-23 22:00:00+00', ARRAY[142901,142902,142903]::bigint[], ARRAY[2733]::int[], true, true, 0.057, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-11', false, 'cti', 'fuite-donnees', '2026-11-23 22:00:00+00', ARRAY[142904,142905,142906]::bigint[], ARRAY[2734]::int[], true, true, 0.044, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-12', false, 'cti', 'fuite-donnees', '2026-11-23 22:00:00+00', ARRAY[142907,142908,142909]::bigint[], ARRAY[2735]::int[], true, true, 0.047, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-13', false, 'cti', 'fuite-donnees', '2026-11-23 22:00:00+00', ARRAY[142910,142911,142912]::bigint[], ARRAY[2736]::int[], true, true, 0.050, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-14', false, 'cti', 'fuite-donnees', '2026-11-23 22:00:00+00', ARRAY[142913,142914,142915]::bigint[], ARRAY[2737]::int[], true, true, 0.048, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-15', false, 'cti', 'fuite-donnees', '2026-11-23 22:00:00+00', ARRAY[142916,142917,142918]::bigint[], ARRAY[2738]::int[], true, true, 0.046, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-16', false, 'cert_fr', 'avis-cert-fr', '2026-11-23 22:00:00+00', ARRAY[142919,142920,142921]::bigint[], ARRAY[2739]::int[], true, true, 0.055, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-17', false, 'cert_fr', 'avis-cert-fr', '2026-11-23 22:00:00+00', ARRAY[142922,142923,142924]::bigint[], ARRAY[2740]::int[], true, true, 0.051, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-18', false, 'cert_fr', 'avis-cert-fr', '2026-11-23 22:00:00+00', ARRAY[142925,142926,142927]::bigint[], ARRAY[2741]::int[], true, true, 0.049, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-19', false, 'cert_fr', 'avis-cert-fr', '2026-11-23 22:00:00+00', ARRAY[142928,142929,142930]::bigint[], ARRAY[2742]::int[], true, true, 0.044, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-20', false, 'cert_fr', 'avis-cert-fr', '2026-11-23 22:00:00+00', ARRAY[142931,142932,142933]::bigint[], ARRAY[2743]::int[], true, true, 0.043, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-21', false, 'cert', 'certificat-observé', '2026-11-23 22:00:00+00', ARRAY[142934,142935,142936]::bigint[], ARRAY[2744]::int[], true, true, 0.039, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-22', false, 'cert', 'certificat-observé', '2026-11-23 22:00:00+00', ARRAY[142937,142938,142939]::bigint[], ARRAY[2745]::int[], true, true, 0.042, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-23', false, 'cert', 'certificat-observé', '2026-11-23 22:00:00+00', ARRAY[142940,142941,142942]::bigint[], ARRAY[2746]::int[], true, true, 0.044, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-24', false, 'cert', 'certificat-observé', '2026-11-23 22:00:00+00', ARRAY[142943,142944,142945]::bigint[], ARRAY[2747]::int[], true, true, 0.045, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-25', false, 'cert', 'certificat-observé', '2026-11-23 22:00:00+00', ARRAY[142946,142947,142948]::bigint[], ARRAY[2748]::int[], true, true, 0.044, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-26', false, 'presse', 'presse-cyber', '2026-11-23 22:00:00+00', ARRAY[142949,142950,142951]::bigint[], ARRAY[2749]::int[], true, true, 0.055, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-27', false, 'presse', 'presse-cyber', '2026-11-23 22:00:00+00', ARRAY[142952,142953,142954]::bigint[], ARRAY[2750]::int[], true, true, 0.044, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-28', false, 'presse', 'presse-cyber', '2026-11-23 22:00:00+00', ARRAY[142955,142956,142957]::bigint[], ARRAY[2751]::int[], true, true, 0.043, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-29', false, 'presse', 'presse-cyber', '2026-11-23 22:00:00+00', ARRAY[142958,142959,142960]::bigint[], ARRAY[2752]::int[], true, true, 0.043, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 'SC-30', false, 'presse', 'presse-cyber', '2026-11-23 22:00:00+00', ARRAY[142961,142962,142963]::bigint[], ARRAY[2753]::int[], true, true, 0.044, 'injection-eval@2026-11-23')
ON CONFLICT (run_id, scenario_id) DO UPDATE SET
  family = EXCLUDED.family,
  rule_expected = EXCLUDED.rule_expected,
  injected_at = EXCLUDED.injected_at,
  event_ids = EXCLUDED.event_ids,
  alert_ids = EXCLUDED.alert_ids,
  detected = EXCLUDED.detected,
  alerted = EXCLUDED.alerted,
  latency_s = EXCLUDED.latency_s,
  source = EXCLUDED.source,
  measured_at = now();

INSERT INTO injection_control_eval
  (run_id, control_day, observed_day, events_injected, alerts, alerted, source)
VALUES
  ('injection-eval-v1', 1, DATE '2026-10-25', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 2, DATE '2026-10-26', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 3, DATE '2026-10-27', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 4, DATE '2026-10-28', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 5, DATE '2026-10-29', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 6, DATE '2026-10-30', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 7, DATE '2026-10-31', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 8, DATE '2026-11-01', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 9, DATE '2026-11-02', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 10, DATE '2026-11-03', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 11, DATE '2026-11-04', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 12, DATE '2026-11-05', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 13, DATE '2026-11-06', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 14, DATE '2026-11-07', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 15, DATE '2026-11-08', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 16, DATE '2026-11-09', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 17, DATE '2026-11-10', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 18, DATE '2026-11-11', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 19, DATE '2026-11-12', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 20, DATE '2026-11-13', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 21, DATE '2026-11-14', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 22, DATE '2026-11-15', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 23, DATE '2026-11-16', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 24, DATE '2026-11-17', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 25, DATE '2026-11-18', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 26, DATE '2026-11-19', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 27, DATE '2026-11-20', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 28, DATE '2026-11-21', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 29, DATE '2026-11-22', 1, 0, false, 'injection-eval@2026-11-23'),
  ('injection-eval-v1', 30, DATE '2026-11-23', 1, 0, false, 'injection-eval@2026-11-23')
ON CONFLICT (run_id, control_day) DO UPDATE SET
  observed_day = EXCLUDED.observed_day,
  events_injected = EXCLUDED.events_injected,
  alerts = EXCLUDED.alerts,
  alerted = EXCLUDED.alerted,
  source = EXCLUDED.source,
  measured_at = now();

COMMIT;
