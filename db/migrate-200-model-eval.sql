-- 200 — Évaluation des modèles : scores de calibration par modèle.
--
-- `model_eval` porte une ligne par modèle évalué : Brier, ECE, taille de
-- l'échantillon et effectif du bin le plus faible. `model_eval_bin` garde les
-- dix strates de fiabilité qui ont servi au calcul, pour qu'un résultat ne soit
-- jamais un nombre nu : on peut reconstruire l'ECE et vérifier qu'aucun bin
-- n'est sous-peuplé.
--
-- Aucune donnée d'organisation, aucun nom de victime et aucun texte libre ne
-- sont stockés ici : uniquement des agrégats numériques et des étiquettes
-- binaires agrégées par strate. Fichier rejouable, aucune donnée modifiée.

CREATE TABLE IF NOT EXISTS model_eval (
  model          text PRIMARY KEY,
  brier          double precision NOT NULL CHECK (brier >= 0 AND brier <= 1),
  ece            double precision NOT NULL CHECK (ece >= 0 AND ece <= 1),
  sample_count   integer NOT NULL CHECK (sample_count > 0),
  bin_count      integer NOT NULL CHECK (bin_count > 0),
  min_bin_count  integer NOT NULL CHECK (min_bin_count > 0),
  horizon_days   integer NOT NULL DEFAULT 90 CHECK (horizon_days > 0),
  reference_date date NOT NULL,
  prior_weight   double precision NOT NULL DEFAULT 5 CHECK (prior_weight >= 0),
  method         text NOT NULL,
  report_path    text NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_eval_bin (
  model        text NOT NULL REFERENCES model_eval(model) ON DELETE CASCADE,
  bin_index    integer NOT NULL CHECK (bin_index >= 0),
  score_min    double precision NOT NULL,
  score_max    double precision NOT NULL,
  count        integer NOT NULL CHECK (count > 0),
  positives    integer NOT NULL CHECK (positives >= 0 AND positives <= count),
  probability  double precision NOT NULL CHECK (probability >= 0 AND probability <= 1),
  observed     double precision NOT NULL CHECK (observed >= 0 AND observed <= 1),
  loo_mean     double precision NOT NULL CHECK (loo_mean >= 0 AND loo_mean <= 1),
  ece_contrib  double precision NOT NULL CHECK (ece_contrib >= 0),
  PRIMARY KEY (model, bin_index)
);

CREATE INDEX IF NOT EXISTS model_eval_bin_model_idx ON model_eval_bin (model, bin_index);
