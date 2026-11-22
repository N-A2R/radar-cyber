-- 209 : mesure de référence des changements de régime (fixture 460 jours).
--
-- Valeurs produites par `scripts/mesure-changements-regime.mts` sur
-- `bench/changepoints/serie-460j.json`. La migration stocke la vérité terrain
-- (annotations) et les détections confirmées ; `changepoint_eval` est dérivé
-- par jointure, jamais recopié à la main. Le script met les mêmes lignes à jour
-- de façon idempotente et `scripts/verifie-changements-regime.mts` rejoue le
-- backtest puis contrôle ces valeurs.
--
-- 30 changements annotés, 6 familles, 460 jours. Aucun fait réel, aucune
-- organisation, aucune donnée personnelle.

BEGIN;

DELETE FROM changepoint_metric WHERE model = 'weekly-z@1';
DELETE FROM changepoint_eval WHERE model = 'weekly-z@1';
DELETE FROM changepoint_detection WHERE model = 'weekly-z@1';
DELETE FROM changepoint_annotation WHERE model = 'weekly-z@1';

INSERT INTO changepoint_annotation
  (model, family, changepoint_day, direction, multiplier, rationale, source)
VALUES
  ('weekly-z@1', 'vuln', '2025-11-15', 'up', 1.600, 'vuln : palier simulé ×1.6 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2025-11-18', 'up', 1.700, 'cti : palier simulé ×1.7 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2025-11-20', 'up', 2.200, 'ransomware : palier simulé ×2.2 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2025-11-25', 'up', 1.900, 'cert_fr : palier simulé ×1.9 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2025-11-30', 'up', 2.200, 'leaks : palier simulé ×2.2 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2025-12-05', 'up', 1.800, 'press : palier simulé ×1.8 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'vuln', '2026-01-24', 'down', 0.600, 'vuln : palier simulé ×0.6 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2026-01-29', 'down', 0.500, 'ransomware : palier simulé ×0.5 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2026-02-06', 'down', 0.550, 'cti : palier simulé ×0.55 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2026-02-13', 'down', 0.500, 'cert_fr : palier simulé ×0.5 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2026-02-18', 'down', 0.500, 'leaks : palier simulé ×0.5 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2026-02-23', 'down', 0.500, 'press : palier simulé ×0.5 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'vuln', '2026-04-14', 'up', 1.450, 'vuln : palier simulé ×1.45 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2026-04-19', 'up', 1.700, 'ransomware : palier simulé ×1.7 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2026-04-27', 'up', 1.500, 'cti : palier simulé ×1.5 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2026-05-04', 'up', 1.600, 'cert_fr : palier simulé ×1.6 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2026-05-09', 'up', 2.000, 'leaks : palier simulé ×2 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2026-05-14', 'up', 1.600, 'press : palier simulé ×1.6 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'vuln', '2026-07-03', 'down', 0.600, 'vuln : palier simulé ×0.6 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2026-07-08', 'down', 0.550, 'ransomware : palier simulé ×0.55 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2026-07-16', 'down', 0.600, 'cti : palier simulé ×0.6 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2026-07-23', 'down', 0.550, 'cert_fr : palier simulé ×0.55 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2026-07-28', 'down', 0.550, 'leaks : palier simulé ×0.55 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2026-08-02', 'down', 0.550, 'press : palier simulé ×0.55 — baisse durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'vuln', '2026-09-21', 'up', 1.800, 'vuln : palier simulé ×1.8 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2026-09-26', 'up', 2.000, 'ransomware : palier simulé ×2 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2026-10-04', 'up', 1.900, 'cti : palier simulé ×1.9 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2026-10-11', 'up', 2.100, 'cert_fr : palier simulé ×2.1 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2026-10-16', 'up', 2.200, 'leaks : palier simulé ×2.2 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2026-10-21', 'up', 2.000, 'press : palier simulé ×2 — montée durable du flux, sans victime ni source réelle', 'benchmark-changepoints-460j')
ON CONFLICT (model, family, changepoint_day) DO UPDATE SET
  direction = EXCLUDED.direction,
  multiplier = EXCLUDED.multiplier,
  rationale = EXCLUDED.rationale,
  source = EXCLUDED.source;

INSERT INTO changepoint_detection
  (model, family, detected_on, confirmed_on, direction, score,
   baseline_weekly, level_weekly, ratio, source)
VALUES
  ('weekly-z@1', 'vuln', '2025-11-18', '2025-12-02', 'up', 3.11, 1725, 2272, 1.317, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2025-11-20', '2025-12-04', 'up', 4.64, 777.5, 1125, 1.447, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2025-11-21', '2025-12-05', 'up', 3.29, 238.5, 340, 1.426, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2025-11-27', '2025-12-11', 'up', 4.77, 376, 648, 1.723, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2025-12-02', '2025-12-16', 'up', 3.2, 141, 217, 1.539, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2025-12-07', '2025-12-21', 'up', 3.64, 566, 739, 1.306, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'vuln', '2026-01-28', '2026-02-11', 'down', 4.24, 2675, 1924, 0.719, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2026-02-04', '2026-02-18', 'down', 3.3, 522, 199, 0.381, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2026-02-11', '2026-02-25', 'down', 7.56, 1455.5, 738, 0.507, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2026-02-18', '2026-03-04', 'down', 4.8, 752, 489, 0.65, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2026-02-22', '2026-03-08', 'down', 3.37, 262, 153, 0.584, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2026-03-02', '2026-03-16', 'down', 6.19, 1062.5, 659, 0.62, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'vuln', '2026-04-19', '2026-05-03', 'up', 6.43, 1477, 1971, 1.334, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2026-04-22', '2026-05-06', 'up', 3.15, 268, 371, 1.384, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2026-04-28', '2026-05-12', 'up', 10.71, 741, 1324, 1.787, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2026-05-05', '2026-05-19', 'up', 3.03, 376.5, 494, 1.312, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2026-05-14', '2026-05-28', 'up', 3.23, 156, 271, 1.737, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2026-05-21', '2026-06-04', 'up', 3.44, 599, 933, 1.558, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'vuln', '2026-07-10', '2026-07-24', 'down', 8.59, 2401, 1216, 0.506, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2026-07-15', '2026-07-29', 'down', 4.35, 414, 237, 0.572, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2026-07-22', '2026-08-05', 'down', 3.86, 1001, 757, 0.756, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2026-08-03', '2026-08-17', 'down', 3.22, 279.5, 172, 0.615, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'vuln', '2026-09-26', '2026-10-10', 'up', 4.42, 1331, 1990, 1.495, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'ransomware', '2026-09-29', '2026-10-13', 'up', 3.73, 255.5, 377, 1.476, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cti', '2026-10-09', '2026-10-23', 'up', 6.13, 706.5, 1138, 1.611, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'cert_fr', '2026-10-14', '2026-10-28', 'up', 3.47, 391, 597, 1.527, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'leaks', '2026-10-17', '2026-10-31', 'up', 3.7, 175, 273, 1.56, 'benchmark-changepoints-460j'),
  ('weekly-z@1', 'press', '2026-10-24', '2026-11-07', 'up', 4.08, 487, 741, 1.522, 'benchmark-changepoints-460j')
ON CONFLICT (model, family, detected_on) DO UPDATE SET
  confirmed_on = EXCLUDED.confirmed_on,
  direction = EXCLUDED.direction,
  score = EXCLUDED.score,
  baseline_weekly = EXCLUDED.baseline_weekly,
  level_weekly = EXCLUDED.level_weekly,
  ratio = EXCLUDED.ratio,
  source = EXCLUDED.source;

-- Rattache chaque détection à l'annotation de la même famille la plus récente
-- dans les 21 jours précédents. Une détection avant toute annotation est un
-- faux positif ; une détection tardive reste rattachée au vrai régime.
UPDATE changepoint_detection AS detection
   SET matched_annotation_day = match.changepoint_day,
       delay_days = CASE
         WHEN match.changepoint_day IS NULL THEN NULL
         ELSE detection.detected_on - match.changepoint_day
       END,
       false_positive = match.changepoint_day IS NULL
  FROM (
    SELECT detection.id,
           (SELECT annotation.changepoint_day
              FROM changepoint_annotation AS annotation
             WHERE annotation.model = detection.model
               AND annotation.family = detection.family
               AND annotation.changepoint_day BETWEEN detection.detected_on - 21 AND detection.detected_on
             ORDER BY annotation.changepoint_day DESC
             LIMIT 1) AS changepoint_day
      FROM changepoint_detection AS detection
     WHERE detection.model = 'weekly-z@1'
  ) AS match
 WHERE detection.id = match.id;

-- `changepoint_eval` : une ligne par annotation, détectée au plus tard à J+7.
INSERT INTO changepoint_eval
  (model, family, annotated_day, direction, detected, detected_on, delay_days, score, source)
SELECT annotation.model,
       annotation.family,
       annotation.changepoint_day,
       annotation.direction,
       detection.detected_on IS NOT NULL,
       detection.detected_on,
       detection.delay_days,
       detection.score,
       annotation.source
  FROM changepoint_annotation AS annotation
  LEFT JOIN LATERAL (
    SELECT detection.detected_on, detection.delay_days, detection.score
      FROM changepoint_detection AS detection
     WHERE detection.model = annotation.model
       AND detection.family = annotation.family
       AND detection.detected_on BETWEEN annotation.changepoint_day AND annotation.changepoint_day + 7
     ORDER BY detection.detected_on
     LIMIT 1
  ) AS detection ON true
 WHERE annotation.model = 'weekly-z@1';

INSERT INTO changepoint_metric
  (model, annotated, detected_within_7, detection_rate, false_positives, evaluated_days,
   false_positives_per_year, late_detections, median_delay_days, average_delay_days,
   baseline_weeks, z_threshold, confirm_days, source)
SELECT 'weekly-z@1',
       count(*),
       count(*) FILTER (WHERE detected AND delay_days <= 7),
       count(*) FILTER (WHERE detected AND delay_days <= 7)::float / count(*),
       (SELECT count(*) FROM changepoint_detection WHERE model = 'weekly-z@1' AND false_positive),
       2760,
       (SELECT count(*) FROM changepoint_detection WHERE model = 'weekly-z@1' AND false_positive) * 365.0 / 2760,
       (SELECT count(*) FROM changepoint_detection
         WHERE model = 'weekly-z@1' AND NOT false_positive AND delay_days > 7),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY delay_days)
         FILTER (WHERE detected AND delay_days IS NOT NULL),
       avg(delay_days) FILTER (WHERE detected AND delay_days IS NOT NULL),
       6, 3, 14, 'benchmark-changepoints-460j'
  FROM changepoint_eval
 WHERE model = 'weekly-z@1';

DO $guard$
DECLARE
  n_annotations integer;
  n_evaluated integer;
  n_detected integer;
BEGIN
  SELECT count(*) INTO n_annotations FROM changepoint_annotation WHERE model = 'weekly-z@1';
  SELECT count(*), count(*) FILTER (WHERE changepoint_eval.detected AND delay_days <= 7)
    INTO n_evaluated, n_detected
    FROM changepoint_eval WHERE model = 'weekly-z@1';
  IF n_annotations <> 30 OR n_evaluated <> 30 THEN
    RAISE EXCEPTION 'changepoint : attendu 30 annotations / 30 évaluations, trouvé % / %',
      n_annotations, n_evaluated;
  END IF;
  IF n_detected < 24 THEN
    RAISE EXCEPTION 'changepoint : critère manqué, % détections sur % (attendu >= 24)', n_detected, n_evaluated;
  END IF;
END
$guard$;

COMMIT;
