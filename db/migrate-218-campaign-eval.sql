-- 218 : mesure de qualité du regroupement des campagnes multi-organismes.
-- Une ligne par modèle évalué : les compteurs tp/fp/fn servent directement au
-- critère précision/rappel (p = tp/(tp+fp), r = tp/(tp+fn)).
CREATE TABLE IF NOT EXISTS campaign_eval (
  id bigserial PRIMARY KEY,
  model text NOT NULL UNIQUE,
  dataset text NOT NULL,
  annotated integer NOT NULL CHECK (annotated >= 0),
  tp integer NOT NULL CHECK (tp >= 0),
  fp integer NOT NULL CHECK (fp >= 0),
  fn integer NOT NULL CHECK (fn >= 0),
  measured_at timestamptz NOT NULL DEFAULT now()
);
