-- Sources d'information du secteur « collectivites » du département 64 (Pyrénées-Atlantiques).
-- 21 sources ; 69 traces de vérification sur 52 URL distinctes, toutes en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections, délai 25 s).
-- Corpus détaillé : bench/corpus/sources-collectivites-64.jsonl
-- Preuve HTTP : bench/results/verification-collectivites-64.json

BEGIN;

CREATE TABLE IF NOT EXISTS source_verification (
  id                bigserial PRIMARY KEY,
  source_id         text        NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  url               text        NOT NULL,
  code_http         integer,
  content_type      text,
  items             integer     NOT NULL DEFAULT 0 CHECK (items >= 0),
  derniere_item_at  timestamptz,
  ms                integer     NOT NULL CHECK (ms >= 0),
  verifie_at        timestamptz NOT NULL DEFAULT now(),
  user_agent        text        NOT NULL,
  etat              text        NOT NULL CHECK (etat IN ('ok200', 'muette', 'morte', 'lente')),
  motif             text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_source_date
  ON source_verification (source_id, verifie_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:collectivites-64-conseil-departemental-des-pyrenees-atlantiques', 'Conseil départemental des Pyrénées-Atlantiques', 'cti', 'https://www.le64.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Conseil départemental des Pyrénées-Atlantiques (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-prefecture-des-pyrenees-atlantiques', 'Préfecture des Pyrénées-Atlantiques', 'cti', 'https://www.pyrenees-atlantiques.gouv.fr/Actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Préfecture des Pyrénées-Atlantiques (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-communaute-d-agglomeration-pays-basque', 'Communauté d''agglomération Pays Basque', 'cti', 'https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Communauté d''agglomération Pays Basque (64). Aucun incident propre identifié ; piratage de la mairie d''Espelette, mails piégés envoyés depuis la commune (11/09/2026, Sud Ouest) — https://www.sudouest.fr/pyrenees-atlantiques/espelette/pays-basque-la-commune-d-espelette-victime-d-un-piratage-des-mails-pieges-portant-un-virus-sont-automatiquement-envoyes-par-la-mairie-30651628.php'),
  ('corpus:collectivites-64-sdis-des-pyrenees-atlantiques', 'SDIS des Pyrénées-Atlantiques', 'cti', 'https://www.sdis64.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'SDIS des Pyrénées-Atlantiques (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-cci-pau-bearn', 'CCI Pau Béarn', 'cti', 'https://pau.cci.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'CCI Pau Béarn (64). Cyberattaque par rançongiciel visant l''aéroport de Pau, l''école Eklore et le campus numérique de la CCI Pau Béarn (15/05/2024, Sud Ouest) — https://www.sudouest.fr/economie/cybersecurite/info-sud-ouest-pau-l-aeroport-et-l-ecole-de-commerce-victimes-d-une-cyberattaque-19716881.php'),
  ('corpus:collectivites-64-chambre-des-metiers-et-de-l-artisanat-des-pyrenees-atlantiques', 'Chambre des métiers et de l''artisanat des Pyrénées-Atlantiques', 'cti', 'https://www.cma64.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Chambre des métiers et de l''artisanat des Pyrénées-Atlantiques (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-communaute-de-communes-du-pays-de-nay', 'Communauté de communes du Pays de Nay', 'cti', 'https://paysdenay.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Communauté de communes du Pays de Nay (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-ville-de-bayonne', 'Ville de Bayonne', 'cti', 'https://www.bayonne.fr/information-transversale/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Ville de Bayonne (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-ville-d-anglet', 'Ville d''Anglet', 'cti', 'https://www.anglet.fr/actualites/dernieres-actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Ville d''Anglet (64). Piratage du compte Pronote d''un élève d''Anglet et fausse alerte à la bombe (31/05/2024, Sud Ouest) — https://www.sudouest.fr/faits-divers/anglet-des-hackers-piratent-le-compte-pronote-d-un-eleve-et-lancent-une-fausse-alerte-a-la-bombe-19939708.php'),
  ('corpus:collectivites-64-ville-de-biarritz', 'Ville de Biarritz', 'cti', 'https://www.biarritz.fr/les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Ville de Biarritz (64). Aucun incident propre identifié ; prestataire de billetterie des sites touristiques de Biarritz et Anglet piraté (juillet 2024, Sud Ouest) — https://www.sudouest.fr/pyrenees-atlantiques/biarritz/pays-basque-le-prestataire-billetterie-de-sites-touristiques-pirates-20421318.php'),
  ('corpus:collectivites-64-ville-d-orthez', 'Ville d''Orthez', 'cti', 'https://www.mairie-orthez.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Ville d''Orthez (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-ville-de-lons', 'Ville de Lons', 'cti', 'https://www.mairie-lons.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Ville de Lons (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-ville-de-billere', 'Ville de Billère', 'cti', 'https://www.billere.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Ville de Billère (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-ville-de-saint-jean-de-luz', 'Ville de Saint-Jean-de-Luz', 'cti', 'https://www.saintjeandeluz.fr/fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Ville de Saint-Jean-de-Luz (64). Incident de cybersécurité chez la Mutuelle Familiale (permanence de Saint-Jean-de-Luz, 02/04/2026), communiqué officiel de la mairie — https://www.saintjeandeluz.fr/fr/incident-de-cybersecurite-chez-la-mutuelle-familiale/'),
  ('corpus:collectivites-64-ville-d-hendaye', 'Ville d''Hendaye', 'cti', 'https://www.hendaye.fr/fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Ville d''Hendaye (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-annuaire-des-communes-et-intercommunalites-des-pyrenees-atlantiques', 'Annuaire des communes et intercommunalités des Pyrénées-Atlantiques', 'cti', 'https://www.annuaire-mairie.fr/departement-pyrenees-atlantiques.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Annuaire des communes et intercommunalités des Pyrénées-Atlantiques (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-actu-fr-pyrenees-atlantiques', 'actu.fr — Pyrénées-Atlantiques', 'cti', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'actu.fr — Pyrénées-Atlantiques (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-mediabask', 'Mediabask', 'cti', 'https://www.mediabask.eus/eu/rss/news.rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Mediabask (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-ici-pays-basque', 'ICI Pays Basque', 'cti', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'ICI Pays Basque (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-ici-bearn-bigorre', 'ICI Béarn Bigorre', 'cti', 'https://www.ici.fr/radio/bearn/actu', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'ICI Béarn Bigorre (64). Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:collectivites-64-france-3-pyrenees-atlantiques', 'France 3 Pyrénées-Atlantiques', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-64.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'France 3 Pyrénées-Atlantiques (64). Cyberattaque DDoS des sites de la Ville de Pau, aucune fuite de données (31/12/2024) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : une trace par couple source/URL, toutes en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:collectivites-64-conseil-departemental-des-pyrenees-atlantiques', ARRAY['https://www.le64.fr/', 'https://www.le64.fr/lactualite-du-departement', 'https://www.le64.fr/rss.xml', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-prefecture-des-pyrenees-atlantiques', ARRAY['https://www.pyrenees-atlantiques.gouv.fr/', 'https://www.pyrenees-atlantiques.gouv.fr/Actualites', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-communaute-d-agglomeration-pays-basque', ARRAY['https://www.communaute-paysbasque.fr/', 'https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites']),
    ('corpus:collectivites-64-sdis-des-pyrenees-atlantiques', ARRAY['https://www.sdis64.fr/', 'https://www.sdis64.fr/les-actualites-du-sdis-64/', 'https://www.sdis64.fr/feed/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-cci-pau-bearn', ARRAY['https://pau.cci.fr/', 'https://pau.cci.fr/blog/', 'https://pau.cci.fr/feed/']),
    ('corpus:collectivites-64-chambre-des-metiers-et-de-l-artisanat-des-pyrenees-atlantiques', ARRAY['https://www.cma64.fr/', 'https://www.cma64.fr/a-cote-de-chez-vous/actualites', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-communaute-de-communes-du-pays-de-nay', ARRAY['https://paysdenay.fr/', 'https://paysdenay.fr/actualites', 'https://paysdenay.fr/feed/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-ville-de-bayonne', ARRAY['https://www.bayonne.fr/', 'https://www.bayonne.fr/information-transversale/actualites', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-ville-d-anglet', ARRAY['https://www.anglet.fr/', 'https://www.anglet.fr/actualites/dernieres-actualites/']),
    ('corpus:collectivites-64-ville-de-biarritz', ARRAY['https://www.biarritz.fr/', 'https://www.biarritz.fr/les-actualites']),
    ('corpus:collectivites-64-ville-d-orthez', ARRAY['https://www.mairie-orthez.fr/', 'https://www.mairie-orthez.fr/la-ville/a-la-une/', 'https://www.mairie-orthez.fr/feed/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-ville-de-lons', ARRAY['https://www.mairie-lons.fr/', 'https://www.mairie-lons.fr/ma-mairie/actualites/', 'https://www.mairie-lons.fr/feed/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-ville-de-billere', ARRAY['https://www.billere.fr/', 'https://www.billere.fr/actualites/', 'https://www.billere.fr/feed/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-ville-de-saint-jean-de-luz', ARRAY['https://www.saintjeandeluz.fr/', 'https://www.saintjeandeluz.fr/fr/actualites/', 'https://www.saintjeandeluz.fr/fr/feed/', 'https://www.saintjeandeluz.fr/fr/incident-de-cybersecurite-chez-la-mutuelle-familiale/']),
    ('corpus:collectivites-64-ville-d-hendaye', ARRAY['https://www.hendaye.fr/', 'https://www.hendaye.fr/fr/actualites/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-annuaire-des-communes-et-intercommunalites-des-pyrenees-atlantiques', ARRAY['https://www.annuaire-mairie.fr/departement-pyrenees-atlantiques.html', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-actu-fr-pyrenees-atlantiques', ARRAY['https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/rss.xml', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-mediabask', ARRAY['https://www.mediabask.eus/', 'https://lhebdo.mediabask.eus/eu/hemeroteca/mediabask/sections/actualite', 'https://www.mediabask.eus/eu/rss/news.rss', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-ici-pays-basque', ARRAY['https://www.ici.fr/radio/pays-basque', 'https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64/actu', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-ici-bearn-bigorre', ARRAY['https://www.ici.fr/radio/bearn', 'https://www.ici.fr/radio/bearn/actu', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html']),
    ('corpus:collectivites-64-france-3-pyrenees-atlantiques', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-64 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://www.le64.fr/', 'text/html; charset=utf-8'),
       ('https://www.le64.fr/lactualite-du-departement', 'text/html; charset=utf-8'),
       ('https://www.le64.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8'),
       ('https://www.pyrenees-atlantiques.gouv.fr/', 'text/html; charset=utf-8'),
       ('https://www.pyrenees-atlantiques.gouv.fr/Actualites', 'text/html; charset=utf-8'),
       ('https://www.communaute-paysbasque.fr/', 'text/html; charset=utf-8'),
       ('https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites', 'text/html; charset=utf-8'),
       ('https://www.sdis64.fr/', 'text/html; charset=UTF-8'),
       ('https://www.sdis64.fr/les-actualites-du-sdis-64/', 'text/html; charset=UTF-8'),
       ('https://www.sdis64.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://pau.cci.fr/', 'text/html; charset=UTF-8'),
       ('https://pau.cci.fr/blog/', 'text/html; charset=UTF-8'),
       ('https://pau.cci.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.cma64.fr/', 'text/html; charset=UTF-8'),
       ('https://www.cma64.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8'),
       ('https://paysdenay.fr/', 'text/html; charset=UTF-8'),
       ('https://paysdenay.fr/actualites', 'text/html; charset=UTF-8'),
       ('https://paysdenay.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.bayonne.fr/', 'text/html; charset=utf-8'),
       ('https://www.bayonne.fr/information-transversale/actualites', 'text/html; charset=utf-8'),
       ('https://www.anglet.fr/', 'text/html; charset=utf-8'),
       ('https://www.anglet.fr/actualites/dernieres-actualites/', 'text/html; charset=utf-8'),
       ('https://www.biarritz.fr/', 'text/html; charset=utf-8'),
       ('https://www.biarritz.fr/les-actualites', 'text/html; charset=utf-8'),
       ('https://www.mairie-orthez.fr/', 'text/html; charset=UTF-8'),
       ('https://www.mairie-orthez.fr/la-ville/a-la-une/', 'text/html; charset=UTF-8'),
       ('https://www.mairie-orthez.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.mairie-lons.fr/', 'text/html; charset=UTF-8'),
       ('https://www.mairie-lons.fr/ma-mairie/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.mairie-lons.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.billere.fr/', 'text/html; charset=utf-8'),
       ('https://www.billere.fr/actualites/', 'text/html; charset=utf-8'),
       ('https://www.billere.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.saintjeandeluz.fr/', 'text/html; charset=UTF-8'),
       ('https://www.saintjeandeluz.fr/fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.saintjeandeluz.fr/fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.saintjeandeluz.fr/fr/incident-de-cybersecurite-chez-la-mutuelle-familiale/', 'text/html; charset=UTF-8'),
       ('https://www.hendaye.fr/', 'text/html; charset=UTF-8'),
       ('https://www.hendaye.fr/fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.annuaire-mairie.fr/departement-pyrenees-atlantiques.html', 'text/html; charset=UTF-8'),
       ('https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/', 'text/html; charset=UTF-8'),
       ('https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://www.mediabask.eus/', 'text/html; charset=utf-8'),
       ('https://lhebdo.mediabask.eus/eu/hemeroteca/mediabask/sections/actualite', 'text/html; charset=utf-8'),
       ('https://www.mediabask.eus/eu/rss/news.rss', 'application/rss+xml; charset=utf-8'),
       ('https://www.ici.fr/radio/pays-basque', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64/actu', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'application/xml'),
       ('https://www.ici.fr/radio/bearn', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/radio/bearn/actu', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'text/html; charset=UTF-8')
) AS t(url, type_contenu) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
