-- 051 : sites de revendication rançongiciel et victimes de Nouvelle-Aquitaine.
--
-- Une revendication n'est jamais un incident confirmé : elle est stockée avec
-- sa source, son URL de preuve et le motif qui la rattache (ou non) à la NA.
-- Les sites sont enregistrés séparément pour mesurer ce qui a réellement été
-- moissonné (code HTTP, URL du blog, nombre de revendications vues), y compris
-- quand un site est bloqué.
CREATE TABLE IF NOT EXISTS leak_site (
  source        text NOT NULL,
  slug          text NOT NULL,
  group_name    text NOT NULL,
  site_url      text,
  http_status   integer,
  claim_count   integer NOT NULL DEFAULT 0,
  harvested_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, slug)
);

CREATE TABLE IF NOT EXISTS leak_claim (
  id            bigserial PRIMARY KEY,
  fingerprint   text NOT NULL UNIQUE,
  source        text NOT NULL,
  site_slug     text NOT NULL,
  group_name    text NOT NULL,
  victim        text NOT NULL,
  country       text,
  sector        text,
  published_at  timestamptz,
  description   text,
  evidence_url  text,
  org_id        integer REFERENCES org(id) ON DELETE SET NULL,
  na            boolean NOT NULL DEFAULT false,
  na_motif      text,
  collected_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leak_claim_na_date ON leak_claim (na, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_leak_claim_org ON leak_claim (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leak_claim_group ON leak_claim (group_name);
