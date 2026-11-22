-- 207 : mesure de référence du backtest STL (180 jours, fixture versionnée).
--
-- Valeurs produites par `scripts/mesure-stl-pics.mts` sur
-- `bench/stl/serie-180j.json` et reportées ici pour qu'une base neuve porte
-- la mesure sans rejouer la fixture. Le script met les mêmes lignes à jour
-- de façon idempotente (`ON CONFLICT`), et `scripts/verifie-stl-pics.mts`
-- rejoue le backtest depuis la fixture puis contrôle ces valeurs.
--
-- Rappel de lecture : `model_eval` ne stocke que les pics annotés et les
-- jours au-dessus du seuil. L'average precision publiée porte sur la grille
-- complète des famille-jours (script de mesure et vérificateur partagent
-- `runBacktest`), la table porte la trace auditable des décisions et le délai.

BEGIN;

INSERT INTO peak_annotation (model, family, peak_day, volume, source, rationale)
VALUES
  ('stl', 'vuln', '2026-07-26', 185, 'benchmark-stl-180j', 'vague simulée : pic 4.2× la ligne de base'),
  ('stl', 'ransomware', '2026-07-31', 50, 'benchmark-stl-180j', 'vague simulée : pic 5.5× la ligne de base'),
  ('stl', 'cti', '2026-08-06', 72, 'benchmark-stl-180j', 'vague simulée : pic 4× la ligne de base'),
  ('stl', 'leaks', '2026-08-09', 5, 'benchmark-stl-180j', 'vague simulée : pic 5× la ligne de base'),
  ('stl', 'cert_fr', '2026-08-14', 27, 'benchmark-stl-180j', 'vague simulée : pic 4.5× la ligne de base'),
  ('stl', 'vuln', '2026-08-22', 156, 'benchmark-stl-180j', 'vague simulée : pic 3.8× la ligne de base'),
  ('stl', 'ransomware', '2026-08-29', 30, 'benchmark-stl-180j', 'vague simulée : pic 6× la ligne de base'),
  ('stl', 'cti', '2026-09-02', 82, 'benchmark-stl-180j', 'vague simulée : pic 4.3× la ligne de base'),
  ('stl', 'leaks', '2026-09-07', 20, 'benchmark-stl-180j', 'vague simulée : pic 4× la ligne de base'),
  ('stl', 'cert', '2026-09-14', 11, 'benchmark-stl-180j', 'vague simulée : pic 5.5× la ligne de base'),
  ('stl', 'vuln', '2026-09-20', 207, 'benchmark-stl-180j', 'vague simulée : pic 4.5× la ligne de base'),
  ('stl', 'ransomware', '2026-09-26', 25, 'benchmark-stl-180j', 'vague simulée : pic 5× la ligne de base'),
  ('stl', 'cti', '2026-10-01', 55, 'benchmark-stl-180j', 'vague simulée : pic 3.9× la ligne de base'),
  ('stl', 'leaks', '2026-10-05', 37, 'benchmark-stl-180j', 'vague simulée : pic 4.6× la ligne de base'),
  ('stl', 'cert_fr', '2026-10-11', 4, 'benchmark-stl-180j', 'vague simulée : pic 4.2× la ligne de base'),
  ('stl', 'vuln', '2026-10-17', 180, 'benchmark-stl-180j', 'vague simulée : pic 4.1× la ligne de base'),
  ('stl', 'ransomware', '2026-10-24', 17, 'benchmark-stl-180j', 'vague simulée : pic 5.8× la ligne de base'),
  ('stl', 'cti', '2026-10-30', 52, 'benchmark-stl-180j', 'vague simulée : pic 4.7× la ligne de base'),
  ('stl', 'leaks', '2026-11-05', 30, 'benchmark-stl-180j', 'vague simulée : pic 4.3× la ligne de base'),
  ('stl', 'ransomware', '2026-11-13', 47, 'benchmark-stl-180j', 'vague simulée : pic 5.2× la ligne de base')
ON CONFLICT (family, peak_day) DO NOTHING;

INSERT INTO model_eval (model, family, eval_day, score, label, tp, detected_on, delay_days, window_days, source)
VALUES
  ('stl', 'cert', '2026-09-14', 1.620650058924061, true, false, NULL, NULL, 180, 'benchmark-stl-180j'),
  ('stl', 'cert_fr', '2026-08-14', 6.35520023581201, true, true, '2026-08-15', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'cert_fr', '2026-10-11', 1.5571473522375037, true, false, NULL, NULL, 180, 'benchmark-stl-180j'),
  ('stl', 'cti', '2026-08-06', 6.223486997044545, true, true, '2026-08-07', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'cti', '2026-09-02', 6.901688616638266, true, true, '2026-09-03', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'cti', '2026-10-01', 3.5872685227703833, true, false, NULL, NULL, 180, 'benchmark-stl-180j'),
  ('stl', 'cti', '2026-10-30', 5.375673942699429, true, true, '2026-10-31', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'leaks', '2026-08-09', 0.7206094420661658, true, false, NULL, NULL, 180, 'benchmark-stl-180j'),
  ('stl', 'leaks', '2026-09-07', 2.8424189569481237, true, false, NULL, NULL, 180, 'benchmark-stl-180j'),
  ('stl', 'leaks', '2026-10-05', 5.842183318338836, true, true, '2026-10-06', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'leaks', '2026-11-05', 7.3155692445342435, true, true, '2026-11-06', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'leaks', '2026-11-21', 4.9417443765794555, false, false, NULL, NULL, 180, 'benchmark-stl-180j'),
  ('stl', 'ransomware', '2026-07-31', 10.693261554379848, true, true, '2026-08-01', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'ransomware', '2026-08-29', 7.975638060369649, true, true, '2026-08-30', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'ransomware', '2026-09-26', 5.956763132579713, true, true, '2026-09-27', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'ransomware', '2026-10-24', 6.766238178782007, true, true, '2026-10-25', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'ransomware', '2026-11-13', 6.164731892922759, true, true, '2026-11-14', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'vuln', '2026-07-26', 19.964707631001655, true, true, '2026-07-27', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'vuln', '2026-08-22', 15.705411608308506, true, true, '2026-08-23', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'vuln', '2026-09-20', 19.42508464518654, true, true, '2026-09-21', 1, 180, 'benchmark-stl-180j'),
  ('stl', 'vuln', '2026-10-17', 16.262110586537126, true, true, '2026-10-18', 1, 180, 'benchmark-stl-180j')
ON CONFLICT (model, family, eval_day) DO NOTHING;

INSERT INTO model_metric
  (model, window_days, pr_auc, pr_auc_trapezoid, annotated_peaks, detected_peaks,
   false_positives, median_delay_days, average_delay_days, source)
VALUES
  ('stl', 180, 0.8785213151662813, 0.8772668222761544, 20, 15, 1, 1, 1, 'benchmark-stl-180j')
ON CONFLICT (model, window_days) DO NOTHING;

COMMIT;
