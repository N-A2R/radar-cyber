-- 051 — inventaire consultatif des services exposés par les organisations de NA.
--
-- Une ligne = un port observé pour une organisation, une IP et une source.
-- Aucune donnée personnelle de victime : uniquement des métadonnées réseau
-- publiques (ports, CPE, hostnames) relevées en consultation, sans scan actif.
-- `source_url` et `consulted_at` rendent chaque mesure citables.

BEGIN;

CREATE TABLE IF NOT EXISTS exposition_service (
  id           bigserial PRIMARY KEY,
  org_id       integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  ip           text NOT NULL,
  port         integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  category     text NOT NULL,             -- web | mail | vpn | base_de_donnees | autre
  service      text NOT NULL,             -- service déduit du port (http, ssh, …)
  technology   text NOT NULL,             -- produit CPE, ou service si aucun CPE
  version      text,
  source       text NOT NULL,             -- shodan-internetdb | leakix
  source_url   text NOT NULL,
  consulted_at timestamptz NOT NULL,
  evidence     jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (org_id, ip, port, source)
);

CREATE INDEX IF NOT EXISTS exposition_service_org_idx ON exposition_service (org_id);
CREATE INDEX IF NOT EXISTS exposition_service_category_idx ON exposition_service (category);

COMMENT ON TABLE exposition_service IS
  'Exposition réseau mesurée en consultation (Shodan InternetDB, LeakIX) : un port par ligne, avec source et date de consultation.';

COMMIT;
