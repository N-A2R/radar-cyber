-- Suivi du contrôle FDR en ligne sur le flux d'événements.
--
-- Chaque ligne est un point de calibration : `seuil` est le seuil de p-value
-- réellement appliqué à la décision, `tp` et `fp` le bilan cumulé des
-- anomalies annotées à cet instant. La table est volontairement minimale :
-- la requête de contrôle ne porte que sur ces trois colonnes.
--
--   SELECT max(seuil) FROM eval_fdr WHERE fp::float/(tp+fp) <= 0.05;
CREATE TABLE IF NOT EXISTS eval_fdr (
  seuil DOUBLE PRECISION NOT NULL,
  tp    INTEGER NOT NULL,
  fp    INTEGER NOT NULL
);
