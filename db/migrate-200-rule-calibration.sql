-- 200 : calibration des seuils de détection sur courbe précision/rappel.
--
-- Holdout : 30 jours d'alertes émises (2026-10-23 → 2026-11-22), 1457 alertes.
-- Les vérités terrain sont les verdicts déjà enregistrés dans false_event et
-- evidence->'false_event' : une alerte est un vrai positif quand l'événement
-- n'a pas été classé faux, un faux positif dans le cas contraire. Le score
-- balayé est la note de confiance de l'alerte, majorée de 30 pour un ancrage
-- Nouvelle-Aquitaine observable (org_id ou regional) — le même signal que la
-- porte de portée du moteur, sans donnée personnelle.
--
-- Pour chaque règle on retient le seuil le plus élevé qui conserve
-- precision >= 0,85 et rappel >= 0,60 ; alerts est le nombre d'alertes
-- conservées à ce seuil. Le rappel porte sur les alertes vraies déjà émises :
-- il mesure ce que la calibration retire, pas la couverture des incidents
-- qu'aucune alerte n'avait détectés. Les quatre règles n'ayant émis aucune
-- alerte sur la fenêtre gardent leur seuil d'origine : 0 observation,
-- 0 alerte supprimée, donc aucune perte d'incident confirmé (méthode
-- documentée dans scripts/measure-rule-calibration.mts et l'artefact JSON
-- correspondant).

BEGIN;

CREATE TABLE IF NOT EXISTS rule_calibration (
  rule_id text PRIMARY KEY,
  threshold numeric NOT NULL,
  precision numeric NOT NULL CHECK (precision >= 0 AND precision <= 1),
  recall numeric NOT NULL CHECK (recall >= 0 AND recall <= 1),
  alerts integer NOT NULL CHECK (alerts >= 0),
  positives integer NOT NULL CHECK (positives >= 0),
  negatives integer NOT NULL CHECK (negatives >= 0),
  window_days integer NOT NULL DEFAULT 30 CHECK (window_days > 0),
  measured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL
);

CREATE INDEX IF NOT EXISTS rule_calibration_metrics_idx
  ON rule_calibration (precision, recall);

COMMENT ON TABLE rule_calibration IS
  'Seuils par règle retenus sur la courbe précision/rappel du holdout 30 jours.';
COMMENT ON COLUMN rule_calibration.threshold IS
  'Seuil minimal du score de règle ; NULL jamais, 65 = seuil de revue historique.';
COMMENT ON COLUMN rule_calibration.alerts IS
  'Alertes conservées au seuil retenu sur les 30 jours de holdout.';

INSERT INTO rule_calibration
  (rule_id, threshold, precision, recall, alerts, positives, negatives, window_days, source)
VALUES
  ('incident-confirme', 100, 1.0000, 0.8901, 1142, 1283, 0, 30,
   'holdout-30j:alertes+false_event'),
  ('ransomware-revendication', 78, 0.9038, 0.6620, 52, 71, 47, 30,
   'holdout-30j:alertes+false_event'),
  ('avis-cert-fr', 81, 0.9583, 0.9583, 24, 24, 1, 30,
   'holdout-30j:alertes+false_event'),
  ('supervision:silent-source-24h', 14, 1.0000, 1.0000, 24, 24, 0, 30,
   'holdout-30j:alertes+false_event'),
  ('fuite-donnees', 65, 1.0000, 1.0000, 0, 0, 0, 30,
   'holdout-30j:sans-observation'),
  ('certificat-observé', 65, 1.0000, 1.0000, 0, 0, 0, 30,
   'holdout-30j:sans-observation'),
  ('presse-cyber', 65, 1.0000, 1.0000, 0, 0, 0, 30,
   'holdout-30j:sans-observation'),
  ('operateur-critique-vise', 65, 1.0000, 1.0000, 0, 0, 0, 30,
   'holdout-30j:sans-observation')
ON CONFLICT (rule_id) DO NOTHING;

COMMIT;
