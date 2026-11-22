-- État de base minimal et figé pour rejouer la couverture publiée.
--
-- Ce n'est PAS le schéma de production (db/init.sql + migrations) : seules les
-- cinq tables lues par les requêtes de couverture sont définies ici. Le
-- catalogue source (75 lignes) reproduit exactement les preuves des 50
-- incidents ; quatre organisations couvrent les secteurs attendus du garde-fou.
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
  started_at timestamptz NOT NULL,
  -- Depuis la migration 206 : nature du run. La collecte réelle est `live` ;
  -- la fixture ne reproduit que celle-là.
  kind       text NOT NULL DEFAULT 'live'
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

-- Sources ajoutées par les migrations et corpus versionnés : sans elles, le
-- rejeu omet les preuves par incident (familleSortie, sources, requêtes) et ne
-- reproduit pas le rapport publié, alors même que le chiffre global tombe juste.
INSERT INTO source (id, name, family, url) VALUES
  ('corpus:landes-40-actu-fr-actu-landes', 'actu.fr — Actu Landes', 'presse', 'https://actu.fr/landes/rss.xml'),
  ('corpus:landes-40-sud-ouest-edition-landes', 'Sud Ouest — édition Landes', 'presse', 'https://www.sudouest.fr/landes/rss.xml'),
  ('corpus:landes-40-les-annonces-landaises', 'Les Annonces Landaises', 'presse', 'https://www.annonces-landaises.com/feed/'),
  ('corpus:landes-40-passion-aquitaine-ouest-france-landes', 'Passion Aquitaine (Ouest-France) — Landes', 'presse', 'https://passion-aquitaine.ouest-france.fr/landes/feed/'),
  ('corpus:landes-40-aquitaineonline-landes', 'AquitaineOnLine — Landes', 'presse', 'https://www.aquitaineonline.com/actualites-en-aquitaine/landes/feed/rss/'),
  ('corpus:landes-40-landes-info', 'Landes Info', 'presse', 'https://landesinfo.net/feed/'),
  ('corpus:landes-40-ze-mag-40', 'ZE mag 40', 'presse', 'https://www.zemag40.com/rss/blog'),
  ('corpus:landes-40-la-depeche-du-midi-landes', 'La Dépêche du Midi — Landes', 'presse', 'https://www.ladepeche.fr/communes/landes,40/rss.xml'),
  ('corpus:landes-40-la-nouvelle-republique-des-pyrenees-landes', 'La Nouvelle République des Pyrénées — Landes', 'presse', 'https://www.nrpyrenees.fr/communes/landes,40/rss.xml'),
  ('corpus:landes-40-we-news-landes-40', 'WE NEWS — Landes (40)', 'presse', 'https://we-news.com/fr/feed?p=dept-40-landes'),
  ('corpus:landes-40-le-parisien-landes-40', 'Le Parisien — Landes (40)', 'presse', 'https://www.leparisien.fr/landes-40/'),
  ('corpus:landes-40-la-semaine-des-pyrenees-landes', 'La Semaine des Pyrénées — Landes', 'presse', 'https://www.lasemainedespyrenees.fr/category/landes/feed/'),
  ('corpus:landes-40-actu-fr-mont-de-marsan', 'actu.fr — Mont-de-Marsan', 'presse', 'https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/'),
  ('corpus:landes-40-radio-mdm-mont-de-marsan-radio-associative', 'Radio MDM (Mont-de-Marsan, radio associative)', 'presse', 'https://www.radio-mdm.fr/feed/'),
  ('corpus:landes-40-cote-sud-fm-seignosse-landes-radio-associative-90-3-fm', 'Côte Sud FM (Seignosse / Landes, radio associative 90.3 FM)', 'presse', 'https://www.cotesudfm.fr/feed/'),
  ('corpus:landes-40-ici-gascogne-radio-locale-radio-france-mont-de-marsan', 'ICI Gascogne (radio locale Radio France, Mont-de-Marsan)', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml'),
  ('corpus:landes-40-ici-landes-40-actualites-et-podcasts-radio-france', 'ici Landes (40) — actualités et podcasts Radio France', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml'),
  ('corpus:landes-40-souvenirs-fm-dax-soustons-radio-locale-88-6-fm', 'Souvenirs FM (Dax / Soustons, radio locale 88.6 FM)', 'presse', 'https://www.souvenirsfm.fr/news/actualites-locales-157/1'),
  ('corpus:landes-40-france-3-nouvelle-aquitaine-edition-landes', 'France 3 Nouvelle-Aquitaine — édition Landes', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss'),
  ('corpus:landes-40-tvpi-television-locale-pays-basque-et-sud-landes', 'TVPI (télévision locale Pays basque et Sud-Landes)', 'presse', 'https://tvpi.fr/feed/'),
  ('corpus:landes-40-cci-des-landes', 'CCI des Landes', 'cti', 'https://www.landes.cci.fr/actualite/'),
  ('corpus:landes-40-medef-des-landes', 'MEDEF des Landes', 'cti', 'https://landes.territoriaux.medef.com/actualites'),
  ('corpus:landes-40-club-landes-entreprises', 'Club Landes Entreprises', 'cti', 'https://club-landes-entreprises.fr/feed/'),
  ('corpus:landes-40-landes-business-club-d-affaires-dax', 'Landes & Business — club d''affaires (Dax)', 'cti', 'https://www.landes-business.fr/feed/'),
  ('corpus:landes-40-club-des-entrepreneurs-de-saint-paul-les-dax', 'Club des Entrepreneurs de Saint-Paul-lès-Dax', 'cti', 'https://club-des-entrepreneurs-saint-paul-les-dax.fr/evenements/'),
  ('corpus:landes-40-cgt-landes-union-departementale-40', 'CGT Landes (Union départementale 40)', 'cti', 'https://www.cgt-landes.org/les-informations-syndicales.html'),
  ('corpus:landes-40-force-ouvriere-union-departementale-des-landes-fo-40', 'Force Ouvrière — Union départementale des Landes (FO 40)', 'cti', 'https://40.force-ouvriere.org/spip.php?page=backend'),
  ('corpus:landes-40-fep-cfdt-pays-basque-bearn-landes', 'FEP-CFDT Pays Basque Béarn Landes', 'cti', 'https://www.fepcfdtbbl.fr/actualites'),
  ('corpus:landes-40-ville-de-mont-de-marsan', 'Ville de Mont-de-Marsan', 'cti', 'https://www.montdemarsan.fr/feed/'),
  ('corpus:landes-40-mont-de-marsan-agglo', 'Mont de Marsan Agglo', 'cti', 'https://www.montdemarsan.fr/feed/'),
  ('corpus:landes-40-ville-de-dax', 'Ville de Dax', 'cti', 'https://www.dax.fr/feed/'),
  ('corpus:landes-40-grand-dax-agglomeration', 'Grand Dax Agglomération', 'cti', 'https://www.grand-dax.fr/feed/'),
  ('corpus:landes-40-ville-de-tarnos', 'Ville de Tarnos', 'cti', 'https://www.ville-tarnos.fr/feed/'),
  ('corpus:landes-40-ville-de-saint-pierre-du-mont', 'Ville de Saint-Pierre-du-Mont', 'cti', 'https://saintpierredumont.fr/actualites'),
  ('corpus:landes-40-ville-de-biscarrosse', 'Ville de Biscarrosse', 'cti', 'https://www.ville-biscarrosse.fr/feed/?post_type=post'),
  ('corpus:landes-40-commune-de-mimizan', 'Commune de Mimizan', 'cti', 'https://www.mimizan.fr/votre-mairie/actualites'),
  ('corpus:landes-40-ville-de-capbreton', 'Ville de Capbreton', 'cti', 'https://www.capbreton.fr/toutes-les-actualites-de-la-ville.html'),
  ('corpus:landes-40-commune-de-soorts-hossegor', 'Commune de Soorts-Hossegor', 'cti', 'https://www.soorts-hossegor.fr/actualites-de-la-ville'),
  ('corpus:landes-40-ville-de-saint-sever', 'Ville de Saint-Sever', 'cti', 'https://www.saint-sever.fr/les-actus-de-saint-sever/'),
  ('corpus:landes-40-mairie-de-soustons', 'Mairie de Soustons', 'cti', 'https://www.mairie-soustons.fr/feed/'),
  ('corpus:landes-40-m2-mag-magazine-de-mont-de-marsan-ville-agglo', 'M2 mag — magazine de Mont de Marsan Ville & Agglo', 'presse', 'https://www.montdemarsan.fr/'),
  ('corpus:landes-40-daxmag-journal-de-la-ville-de-dax', 'Daxmag — journal de la Ville de Dax', 'presse', 'https://www.dax.fr/'),
  ('corpus:landes-40-tarnos-contact-journal-municipal-de-tarnos', 'Tarnos Contact — journal municipal de Tarnos', 'presse', 'https://www.ville-tarnos.fr/'),
  ('corpus:france-3-vienne', 'France 3 — Vienne', 'tv', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne'),
  ('corpus:la-nouvelle-republique-vienne-flux-rss', 'La Nouvelle République — Vienne (flux RSS)', 'presse', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c'),
  ('corpus:ici-poitou-infos-rss', 'ICI Poitou — infos (RSS)', 'radio', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml'),
  ('official-na-ars-communiques', 'ARS Nouvelle-Aquitaine - press releases', 'official_statement', 'https://www.nouvelle-aquitaine.ars.sante.fr/liste-communiques-presse'),
  ('public-title:na-quotidien-015', 'Public title feed — La Nouvelle République — général', 'presse', 'https://www.lanouvellerepublique.fr/api/v1/rss/592bf255489a4555008b4568'),
  ('public-title:na-quotidien-017', 'Public title feed — La Montagne — Corrèze/Creuse (via Google News)', 'presse', 'https://news.google.com/rss/search?q=site%3Alamontagne.fr+(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+when:30d&hl=fr&gl=FR&ceid=FR:fr');

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
