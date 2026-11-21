-- État de base minimal et figé pour rejouer la couverture publiée.
--
-- Ce n'est PAS le schéma de production (db/init.sql + migrations) : seules les
-- cinq tables lues par les requêtes de couverture sont définies ici, avec les
-- 26 sources catalogue réellement reconnues par les 50 incidents du corpus et
-- quatre organisations couvrant les secteurs attendus par le garde-fou.
-- Un seul événement sentinelle, hors fenêtre et sans correspondance possible,
-- donne une date de calcul stable sans réintroduire de données de victimes.
--
-- Aucune écriture réseau, aucune date murale, aucune donnée personnelle.
-- Toute modification de ce fichier doit être validée par `bash scripts/reproduire.sh`.

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE source (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  family     text NOT NULL,
  url        text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  last_ok_at timestamptz
);

CREATE TABLE org (
  id     serial PRIMARY KEY,
  name   text NOT NULL,
  slug   text NOT NULL UNIQUE,
  kind   text NOT NULL,
  sector text
);

CREATE TABLE collector_run (
  id         bigserial PRIMARY KEY,
  source_id  text NOT NULL REFERENCES source(id),
  started_at timestamptz NOT NULL
);

CREATE TABLE event (
  id             bigserial PRIMARY KEY,
  dedup_key      text NOT NULL UNIQUE,
  family         text NOT NULL,
  assertion_type text NOT NULL,
  title          text NOT NULL,
  source_id      text NOT NULL REFERENCES source(id),
  source_url     text,
  org_id         integer,
  observed_at    timestamptz,
  collected_at   timestamptz NOT NULL
);

CREATE TABLE event_archive (
  id           bigserial PRIMARY KEY,
  org_id       integer,
  org_name     text,
  family       text NOT NULL,
  source_id    text NOT NULL REFERENCES source(id),
  source_url   text,
  observed_at  timestamptz,
  collected_at timestamptz NOT NULL
);

INSERT INTO source (id, name, family, url) VALUES
('eco-charentelibre', 'Charente Libre Économie (RSS)', 'cti', 'https://www.charentelibre.fr/economie/rss.xml'),
('eco-sudouest', 'Sud Ouest Éco (RSS)', 'cti', 'https://www.sudouest.fr/economie/rss.xml'),
('gn-press-lamontagne', 'Google News — cyber sur lamontagne.fr (30 j)', 'presse_cyber', 'https://news.google.com/rss/search?q=site:lamontagne.fr+(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+when:30d&hl=fr&gl=FR&ceid=FR:fr'),
('presse-charentelibre', 'Charente Libre (RSS)', 'cti', 'https://www.charentelibre.fr/rss.xml'),
('presse-france3-correze', 'France 3 NA — Correze (RSS)', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/rss'),
('presse-france3-creuse', 'France 3 NA — Creuse (RSS)', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss'),
('presse-france3-landes', 'France 3 NA — Landes (RSS)', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss'),
('presse-france3-na', 'France 3 Nouvelle-Aquitaine (RSS)', 'cti', 'https://france3-regions.francetvinfo.fr/nouvelle-aquitaine/rss'),
('presse-ici-creuse', 'ICI Creuse — a la une (RSS)', 'cti', 'https://www.ici.fr/rss/creuse/a-la-une.xml'),
('presse-ici-limousin-infos', 'ICI Limousin — infos (RSS)', 'cti', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml'),
('presse-lamontagne-correze', 'La Montagne — Correze (page actualites)', 'cti', 'https://www.lamontagne.fr/correze'),
('presse-lnr-deuxsevres', 'La Nouvelle République — Deux-Sèvres (RSS)', 'cti', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594'),
('presse-lnr-vienne', 'La Nouvelle République — Vienne (RSS)', 'cti', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c'),
('presse-ouestfrance-rss', 'Ouest-France (RSS)', 'presse', 'https://www.ouest-france.fr/rss/france'),
('presse-republicain-47', 'Le Republicain Lot-et-Garonne — actu.fr (RSS)', 'cti', 'https://actu.fr/le-republicain-lot-et-garonne/rss.xml'),
('presse-sudouest', 'Sud Ouest (RSS)', 'cti', 'https://www.sudouest.fr/rss.xml'),
('presse-sudouest-charente', 'Sud Ouest — Charente (RSS)', 'cti', 'https://www.sudouest.fr/charente/rss.xml'),
('presse-sudouest-charente-maritime', 'Sud Ouest — Charente-Maritime (RSS)', 'cti', 'https://www.sudouest.fr/charente-maritime/rss.xml'),
('presse-sudouest-deux-sevres', 'Sud Ouest — Deux-Sèvres (RSS)', 'cti', 'https://www.sudouest.fr/deux-sevres/rss.xml'),
('presse-sudouest-dordogne', 'Sud Ouest — Dordogne (RSS)', 'cti', 'https://www.sudouest.fr/dordogne/rss.xml'),
('presse-sudouest-gironde', 'Sud Ouest — Gironde (RSS)', 'cti', 'https://www.sudouest.fr/gironde/rss.xml'),
('presse-sudouest-landes', 'Sud Ouest — Landes (RSS)', 'cti', 'https://www.sudouest.fr/landes/rss.xml'),
('presse-sudouest-lot-et-garonne', 'Sud Ouest — Lot-et-Garonne (RSS)', 'cti', 'https://www.sudouest.fr/lot-et-garonne/rss.xml'),
('presse-sudouest-mont-de-marsan', 'Sud Ouest — Mont-de-Marsan (RSS)', 'cti', 'https://www.sudouest.fr/landes/mont-de-marsan/rss.xml'),
('presse-sudouest-pyrenees', 'Sud Ouest — Pyrénées-Atlantiques (RSS)', 'cti', 'https://www.sudouest.fr/pyrenees-atlantiques/rss.xml'),
('presse-sudouest-rss', 'Sud Ouest (RSS)', 'presse', 'https://www.sudouest.fr/rss.xml');

INSERT INTO org (name, slug, kind, sector) VALUES
('Reproduction agroalimentaire', 'repro-agroalimentaire', 'entreprise', 'agroalimentaire'),
('Reproduction industrie', 'repro-industrie', 'entreprise', 'industrie'),
('Reproduction construction', 'repro-construction', 'entreprise', 'construction'),
('Reproduction commerce', 'repro-commerce', 'entreprise', 'commerce');

INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, observed_at, collected_at)
VALUES ('reproduction-sentinel', 'cti', 'ambient_signal', 'reproduction sentinel',
        'presse-sudouest', 'https://reproduction.invalid/sentinel',
        '2026-11-21T00:00:00Z', '2026-11-21T00:00:00Z');

COMMIT;
