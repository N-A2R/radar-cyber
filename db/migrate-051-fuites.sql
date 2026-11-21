-- Fuites documentées : métadonnées uniquement. Jamais de compte, mot de passe,
-- adresse e-mail ou toute autre donnée personnelle de victime n'est stocké ici.
CREATE TABLE IF NOT EXISTS fuite_reference (
  id text PRIMARY KEY,
  source text NOT NULL,
  name text NOT NULL,
  domain text,
  breach_date date,
  accounts bigint,
  source_url text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fuite_reference_domain_idx ON fuite_reference (lower(domain));

CREATE TABLE IF NOT EXISTS fuite_org (
  fuite_id text NOT NULL REFERENCES fuite_reference(id) ON DELETE CASCADE,
  org_id integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  domain text NOT NULL,
  matched_by text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (fuite_id, org_id)
);
CREATE INDEX IF NOT EXISTS fuite_org_org_idx ON fuite_org (org_id);

CREATE TABLE IF NOT EXISTS fuite_stat (
  source text PRIMARY KEY,
  tentatives integer NOT NULL,
  echecs integer NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at timestamptz NOT NULL DEFAULT now()
);
