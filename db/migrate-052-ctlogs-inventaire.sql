-- 052 : inventaire des sous-domaines vus dans les Certificate Transparency logs.
--
-- Chaque ligne porte le fournisseur et la date de première vue renvoyée par le
-- CT log (crt.sh `first_seen` ou Cert Spotter `not_before`) : aucune date ni
-- aucun sous-domaine n'est deviné. Les certificats suspects restent des
-- signaux à revoir, pas des incidents.

CREATE TABLE IF NOT EXISTS ct_sous_domaine (
  id              bigserial PRIMARY KEY,
  sous_domaine    text NOT NULL,
  domaine         text NOT NULL,
  organisation    text NOT NULL,
  source          text NOT NULL CHECK (source IN ('crt.sh', 'certspotter')),
  premiere_vue    timestamptz NOT NULL,
  certificat_id   text,
  emetteur        text,
  collecte_le     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_ct_sous_domaine UNIQUE (sous_domaine, source)
);

CREATE INDEX IF NOT EXISTS idx_ct_sous_domaine_domaine
  ON ct_sous_domaine (domaine, sous_domaine);

CREATE INDEX IF NOT EXISTS idx_ct_sous_domaine_premiere_vue
  ON ct_sous_domaine (premiere_vue DESC);

CREATE TABLE IF NOT EXISTS ct_certificat_suspect (
  id                      bigserial PRIMARY KEY,
  domaine                 text NOT NULL,
  organisation_cible      text NOT NULL,
  distance                integer NOT NULL CHECK (distance BETWEEN 1 AND 2),
  motif                   text NOT NULL,
  premiere_vue            timestamptz NOT NULL,
  source                  text NOT NULL CHECK (source IN ('crt.sh', 'certspotter')),
  certificat_id           text NOT NULL DEFAULT '',
  sous_domaines_observes  integer NOT NULL DEFAULT 0,
  collecte_le             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_ct_certificat_suspect UNIQUE (domaine, source, certificat_id)
);

CREATE INDEX IF NOT EXISTS idx_ct_certificat_suspect_premiere_vue
  ON ct_certificat_suspect (premiere_vue DESC);

-- Un passage d'inventaire : les compteurs sont ceux du rapport publié, pas
-- des agrégats recalculés (crt.sh peut tomber sans invalider le passage).
CREATE TABLE IF NOT EXISTS ct_collecte (
  id                  bigserial PRIMARY KEY,
  collecte_le         timestamptz NOT NULL DEFAULT now(),
  domaines_interroges integer NOT NULL CHECK (domaines_interroges >= 0),
  sous_domaines       integer NOT NULL CHECK (sous_domaines >= 0),
  suspects            integer NOT NULL CHECK (suspects >= 0),
  appels              integer NOT NULL CHECK (appels >= 0),
  echecs              integer NOT NULL CHECK (echecs >= 0),
  echecs_crtsh        integer NOT NULL DEFAULT 0 CHECK (echecs_crtsh >= 0),
  appels_crtsh        integer NOT NULL DEFAULT 0 CHECK (appels_crtsh >= 0),
  rapport             jsonb NOT NULL
);
