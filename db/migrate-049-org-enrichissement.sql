-- Migration 049 : provenance des valeurs d'enrichissement du référentiel.
--
-- Les colonnes historiques de `org` (domain, siren, sector, naf, lat, lon)
-- ne portent ni source ni confiance. Cette table conserve UNE valeur retenue
-- par organisation et par champ, avec la source qui l'a produite, le score de
-- confiance [0,1] et les détails de vérification (code HTTP, correspondance,
-- ambiguïté...). Le mode --appliquer remplit aussi les colonnes historiques
-- lorsqu'elles sont vides ; il ne remplace jamais une valeur existante.

CREATE TABLE IF NOT EXISTS org_enrichment (
  org_id      integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  champ       text    NOT NULL CHECK (champ IN ('domain', 'siren', 'secteur', 'geo')),
  valeur      jsonb   NOT NULL,
  source      text    NOT NULL CHECK (length(btrim(source)) > 0),
  confiance   numeric(4,3) NOT NULL CHECK (confiance >= 0 AND confiance <= 1),
  details     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  verifie_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, champ)
);

CREATE INDEX IF NOT EXISTS org_enrichment_champ_idx ON org_enrichment (champ);
CREATE INDEX IF NOT EXISTS org_enrichment_source_idx ON org_enrichment (source);
