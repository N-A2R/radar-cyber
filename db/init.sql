-- Radar Cyber NA — schéma MVP
-- Cible prod: PostgreSQL 17/18 + PostGIS. MVP: lat/lon simples, PostGIS ajouté en phase 2.

CREATE TABLE IF NOT EXISTS source (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  family        text NOT NULL,              -- ransomware | vuln | phishing | cert | cert_fr | reputation | cti
  url           text NOT NULL,
  license       text,
  retain_raw    boolean NOT NULL DEFAULT false,
  enabled       boolean NOT NULL DEFAULT true,
  cursor        jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_ok_at    timestamptz,
  last_error_at timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  kind       text NOT NULL,                 -- entreprise | collectivite | sante | enseignement | recherche | operateur_critique | ess
  sector     text,
  city       text,
  dept       text,
  website    text,
  domain     text,
  status     text NOT NULL DEFAULT 'confirme',  -- confirme | a_confirmer
  lat        double precision,
  lon        double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_domain_idx ON org (lower(domain));
CREATE INDEX IF NOT EXISTS org_dept_idx ON org (dept);

CREATE TABLE IF NOT EXISTS asset (
  id         serial PRIMARY KEY,
  org_id     integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  kind       text NOT NULL,                 -- domain | subdomain | ip | ip_range | asn | url
  value      text NOT NULL,
  status     text NOT NULL DEFAULT 'confirme',  -- confirme | candidat
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, value)
);

CREATE TABLE IF NOT EXISTS event (
  id             bigserial PRIMARY KEY,
  dedup_key      text NOT NULL UNIQUE,
  family         text NOT NULL,
  assertion_type text NOT NULL,             -- confirmed_incident | third_party_claim | technical_indicator | suggested_relation | ambient_signal
  title          text NOT NULL,
  summary        text,
  langue         text,                         -- fr | en ; NULL = antérieur à la migration 047
  pertinence_score smallint,                   -- 0-10 ; NULL = antérieur à la migration 049
  pertinence_rule  text,                       -- org | epss | dept ; NULL sinon
  observed_at    timestamptz,
  valid_at       timestamptz NOT NULL DEFAULT now(), -- quand le fait était vrai dans le monde
  at             timestamptz NOT NULL DEFAULT now(), -- quand le radar l'a appris
  collected_at   timestamptz NOT NULL DEFAULT now(),
  severity       smallint NOT NULL DEFAULT 3,
  confidence     text,                      -- code Admiralty A-F / 1-6, ex "B2"
  source_id      text NOT NULL REFERENCES source(id),
  source_url     text,
  evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
  geo_type       text NOT NULL DEFAULT 'unknown', -- entity_location | hosting_estimate | claimed_origin | unknown
  dept           text,                         -- code INSEE du département éditeur (presse_locale)
  lat            double precision,
  lon            double precision,
  org_id         integer REFERENCES org(id) ON DELETE SET NULL,
  asset_id       integer REFERENCES asset(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_observed_idx ON event (observed_at DESC);
CREATE INDEX IF NOT EXISTS event_org_idx ON event (org_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS event_family_idx ON event (family, observed_at DESC);

CREATE TABLE IF NOT EXISTS relation (
  id            bigserial PRIMARY KEY,
  src_kind      text NOT NULL,              -- org | event | asset | group
  src_id        text NOT NULL,
  dst_kind      text NOT NULL,
  dst_id        text NOT NULL,
  relation_type text NOT NULL,              -- targeted_by | exploits | uses_infra | owned_by
  origin        text NOT NULL,              -- rule | analyst | llm_suggested
  confidence    text,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (src_kind, src_id, dst_kind, dst_id, relation_type)
);

CREATE TABLE IF NOT EXISTS collector_run (
  id          bigserial PRIMARY KEY,
  source_id   text NOT NULL REFERENCES source(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text NOT NULL DEFAULT 'running', -- running | ok | error
  items_in    integer NOT NULL DEFAULT 0,
  items_new   integer NOT NULL DEFAULT 0,
  error       text
);
INSERT INTO source (id, name, family, url, license, retain_raw)
VALUES
  ('cert_fr', 'CERT-FR', 'cert_fr', 'https://www.cert.ssi.gouv.fr/feed/', 'ANSSI / diffusion publique', false),
  ('cisa_kev', 'CISA KEV', 'vuln', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', 'US Government public domain', false)
ON CONFLICT (id) DO NOTHING;
