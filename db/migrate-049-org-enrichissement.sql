<<<<<<< HEAD
-- 049 — Traçabilité des enrichissements du référentiel d'organisations.
--
-- Mesure avant enrichissement sur la base 5433 (1 673 151 orgs) :
--   domaine renseigné : 88, site web : 69, SIREN : 1 605 918, lat/lon : 1 226 538.
--
-- Les colonnes `geo_source` et `entity_source` ne portent qu'une provenance
-- grossière, sans valeur associée ni score. Cette table conserve, pour chaque
-- champ enrichi, la valeur exacte écrite, la source qui l'a produite et un
-- score de confiance dans [0,1]. `preuve` garde les éléments vérifiés
-- (statut HTTP, titre de page, nom retourné par l'API, code commune, ...).
--
-- `code_postal` est ajouté à `org` : les API publiques consultées renvoient
-- le code postal du siège, qui sert de clé au géocodage par commune. Sans
-- cette colonne, la géolocalisation « depuis le code postal quand il existe »
-- ne peut être ni tracée ni rejouée.
--
-- Idempotent : aucune donnée existante n'est modifiée.
ALTER TABLE org ADD COLUMN IF NOT EXISTS code_postal text;

CREATE TABLE IF NOT EXISTS org_enrichissement (
  org_id     integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  champ      text NOT NULL CHECK (champ IN ('domaine', 'siren', 'code_postal', 'geo')),
  valeur     text NOT NULL,
  source     text NOT NULL,
  confiance  real NOT NULL CHECK (confiance >= 0 AND confiance <= 1),
  preuve     jsonb NOT NULL DEFAULT '{}'::jsonb,
  verifie_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, champ)
);

CREATE INDEX IF NOT EXISTS org_enrichissement_source_idx ON org_enrichissement (champ, source);
=======
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
>>>>>>> 72389f2 (feat(referentiel): enrichissement tracé du domaine, SIREN, secteur et géo)
