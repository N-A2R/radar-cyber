-- 060 : campagnes regroupées à partir d'incidents, avec preuve et confiance.
CREATE TABLE IF NOT EXISTS campaign (
  cle text PRIMARY KEY, label text NOT NULL, family text NOT NULL,
  debut timestamptz NOT NULL, fin timestamptz NOT NULL, incidents bigint[] NOT NULL,
  taille integer NOT NULL CHECK (taille >= 2), confiance text NOT NULL CHECK (confiance IN ('eleve','moyen','faible')),
-  score integer NOT NULL, preuve jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_debut_idx ON campaign (debut DESC);
CREATE INDEX IF NOT EXISTS campaign_incidents_idx ON campaign USING GIN (incidents);
