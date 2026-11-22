-- 065: digital provider inventory for Nouvelle-Aquitaine organizations.
--
-- Goal: name the DNS and mail providers behind the institutional domains
-- already present in `org`, then count how many organizations depend on the
-- same provider.
--
-- This is not a DNS change history (that is `dns_snapshot`/`dns_change`,
-- migration 051). It stores only the latest NS/MX observation useful for the
-- map, without touching the history tables.
--
-- Source: public DNS over HTTPS (Cloudflare), no key and no paid service.
-- No personal data: only institutional domains, public records and opaque
-- organization identifiers.

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

COMMENT ON TABLE provider_domain IS
  'Latest NS/MX observation per referential domain, used for the digital provider map.';
COMMENT ON COLUMN provider_domain.org_ids IS
  'Organizations carrying this domain (org.domain or website host); aggregates only, never exposed as names in the API.';
COMMENT ON COLUMN provider_domain.last_state IS
  'ok = NS and MX answered; partiel = one lookup failed; erreur = no usable answer.';

COMMIT;
