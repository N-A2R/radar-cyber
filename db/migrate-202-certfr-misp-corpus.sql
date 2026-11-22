-- 202 — Corpus durable du flux MISP public du CERT-FR.
--
-- Pourquoi une table à part : `event` garde 90 jours et archive sur
-- `observed_at`. Un événement MISP publié en 2020 est donc archivé le jour
-- même de son ingestion, alors que ses indicateurs restent la preuve de ce que
-- le CERT-FR a publié. Le corpus doit survivre à cette rétention et être
-- relisible sans réseau.
--
-- Un enregistrement par UUID MISP. Les attributs techniques complets (valeurs
-- comprises) sont dans `indicators` ; le contexte non personnel (cibles,
-- liens, pièces jointes, commentaires, dates) dans `context`. Les types
-- porteurs de données personnelles (courriel, téléphone) ne sont jamais
-- conservés, ni en indicateur ni en contexte.
CREATE TABLE IF NOT EXISTS certfr_misp_event (
  uuid                  text PRIMARY KEY,
  misp_date             date NOT NULL,
  info                  text NOT NULL,
  org_name              text NOT NULL,
  tlp                   text NOT NULL DEFAULT 'clear' CHECK (tlp = 'clear'),
  attribute_count       integer NOT NULL DEFAULT 0,
  object_count          integer NOT NULL DEFAULT 0,
  attribute_types       jsonb NOT NULL DEFAULT '[]'::jsonb,
  attribute_type_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  indicators            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{type, value}] techniques uniquement
  context               jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {labels, targetLocations, urls, attachments, comments, dates}
  feed_url              text NOT NULL,
  first_fetched_at      timestamptz NOT NULL DEFAULT now(),
  last_fetched_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS certfr_misp_event_date_idx ON certfr_misp_event (misp_date DESC);

COMMENT ON TABLE certfr_misp_event IS
  'Corpus MISP TLP:CLEAR du CERT-FR, indépendant de la rétention de `event`.';
COMMENT ON COLUMN certfr_misp_event.indicators IS
  'Attributs techniques (domain, ip, url, hash, filename…). Les types porteurs de données personnelles (email, téléphone) ne sont jamais conservés.';
