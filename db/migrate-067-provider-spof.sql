-- 067: observations needed to list digital single points of failure.
--
-- Idempotent by design: it coexists with any earlier provider-map migration
-- that may already have created `provider_domain` or added these suffixes.
-- Only public NS/MX records and opaque organization identifiers are stored.

BEGIN;

CREATE TABLE IF NOT EXISTS provider_domain (
  domain       text PRIMARY KEY,
  org_ids      integer[] NOT NULL DEFAULT '{}',
  ns           text[] NOT NULL DEFAULT '{}',
  mx           text[] NOT NULL DEFAULT '{}',
  observed_at  timestamptz NOT NULL DEFAULT now(),
  last_state   text NOT NULL DEFAULT 'ok' CHECK (last_state IN ('ok', 'partiel', 'erreur')),
  errors       text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS provider_domain_org_ids_idx
  ON provider_domain USING gin (org_ids);

-- Suffixes actually observed on the Nouvelle-Aquitaine domain map. A row is a
-- technical naming fact, not a claim of exclusivity.
INSERT INTO dns_fournisseur (suffix, name, category, mode) VALUES
  ('anycast.me',           'OVHcloud',          'dns',  'suffix'),
  ('hornetsecurity.com',   'Hornetsecurity',    'mail', 'suffix'),
  ('girondenumerique.net', 'Gironde Numérique', 'dns',  'suffix'),
  ('prodomaines.com',      'Prodomaines',       'dns',  'suffix'),
  ('alienor.net',          'Alienor',           'dns',  'suffix'),
  ('eolas.fr',             'Eolas',             'dns',  'suffix'),
  ('eolas-dns.eu',         'Eolas',             'dns',  'suffix'),
  ('amenworld.com',        'Amenworld',         'dns',  'suffix'),
  ('nameshield.net',       'Nameshield',        'dns',  'suffix'),
  ('infomaniak.com',       'Infomaniak',        'dns',  'suffix')
ON CONFLICT (suffix, category) DO NOTHING;

COMMIT;
