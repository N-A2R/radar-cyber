-- Sources d'information du secteur « commerce » du département 64 (Pyrénées-Atlantiques).
-- 8 sources, 30 URL contrôlées en HTTP 200 le 2026-11-22 (GET réel avec User-Agent navigateur, redirections suivies, 6 flux RSS exploitables).
-- Corpus détaillé : bench/corpus/sources-commerce-64.jsonl
-- Preuve HTTP : bench/results/verification-commerce-64.json

-- Déclaration locale pour rester applicable sur une branche sans migrate-064-source-verification.sql.
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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:commerce-64-cci-pau', 'CCI Pau Béarn — actualités et entreprises', 'cti', 'https://pau.cci.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-64.jsonl","ligne":1}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Cyberattaque de sites Internet : « Assez peu de conséquences, aucune fuite de données » à Bordeaux et Pau, deux villes ciblées par les hackers — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:commerce-64-cma-64', 'CMA Nouvelle-Aquitaine — antenne des Pyrénées-Atlantiques', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?county=pyrenees-atlantiques', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-64.jsonl","ligne":2}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Cyberattaque de sites Internet : « Assez peu de conséquences, aucune fuite de données » à Bordeaux et Pau, deux villes ciblées par les hackers — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:commerce-64-mon-entreprise-info', 'Mon-Entreprise-Info — Pyrénées-Atlantiques', 'cti', 'https://mon-entreprise-info.com/actualites/pyrenees-atlantiques/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-64.jsonl","ligne":3}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Cyberattaque de sites Internet : « Assez peu de conséquences, aucune fuite de données » à Bordeaux et Pau, deux villes ciblées par les hackers — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:commerce-64-jde', 'Le Journal des Entreprises — Pyrénées-Atlantiques', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-64.jsonl","ligne":4}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Cyberattaque de sites Internet : « Assez peu de conséquences, aucune fuite de données » à Bordeaux et Pau, deux villes ciblées par les hackers — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:commerce-64-ici-pays-basque', 'ICI Pays Basque — actualités locales', 'presse', 'https://www.ici.fr/rss/pays-basque/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-64.jsonl","ligne":5}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Incident de cybersécurité chez La Mutuelle Familiale (Saint-Jean-de-Luz) — https://www.saintjeandeluz.fr/fr/incident-de-cybersecurite-chez-la-mutuelle-familiale/'),
  ('corpus:commerce-64-ici-bearn', 'ICI Béarn Bigorre — actualités locales', 'presse', 'https://www.ici.fr/rss/bearn/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-64.jsonl","ligne":6}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Cyberattaque de sites Internet : « Assez peu de conséquences, aucune fuite de données » à Bordeaux et Pau, deux villes ciblées par les hackers — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:commerce-64-societe-tech', 'Societe.Tech — entreprises Pyrénées-Atlantiques', 'presse', 'https://news.google.com/rss/search?q=Societe.Tech%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR:fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-64.jsonl","ligne":7}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Cyberattaque de sites Internet : « Assez peu de conséquences, aucune fuite de données » à Bordeaux et Pau, deux villes ciblées par les hackers — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
  ('corpus:commerce-64-france3', 'France 3 Nouvelle-Aquitaine — Pyrénées-Atlantiques', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-64.jsonl","ligne":8}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Cyberattaque de sites Internet : « Assez peu de conséquences, aucune fuite de données » à Bordeaux et Pau, deux villes ciblées par les hackers — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 30 URLs contrôlées le 2026-11-22, toutes en 200 (28 URL distinctes).
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:commerce-64-cci-pau', 'https://pau.cci.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-cci-pau', 'https://pau.cci.fr/blog/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-cci-pau', 'https://pau.cci.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-64-cci-pau', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-cma-64', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-cma-64', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?county=pyrenees-atlantiques', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-cma-64', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-mon-entreprise-info', 'https://mon-entreprise-info.com/', 'text/html', 0),
    ('corpus:commerce-64-mon-entreprise-info', 'https://mon-entreprise-info.com/actualites/pyrenees-atlantiques/', 'text/html', 0),
    ('corpus:commerce-64-mon-entreprise-info', 'https://mon-entreprise-info.com/actualites/pyrenees-atlantiques/rss.xml', 'application/xml', 50),
    ('corpus:commerce-64-mon-entreprise-info', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-jde', 'https://www.lejournaldesentreprises.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-jde', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/pyrenees-atlantiques', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-jde', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml; charset=UTF-8', 20),
    ('corpus:commerce-64-jde', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-ici-pays-basque', 'https://www.ici.fr/radio/pays-basque', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-ici-pays-basque', 'https://www.ici.fr/rss/pays-basque/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-64-ici-pays-basque', 'https://www.saintjeandeluz.fr/fr/incident-de-cybersecurite-chez-la-mutuelle-familiale/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-ici-bearn', 'https://www.ici.fr/radio/bearn', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-ici-bearn', 'https://www.ici.fr/rss/bearn/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-64-ici-bearn', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-societe-tech', 'https://www.societe.tech/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-societe-tech', 'https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-pyrenees-atlantiques/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-societe-tech', 'https://news.google.com/rss/search?q=Societe.Tech%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 79),
    ('corpus:commerce-64-societe-tech', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-france3', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-france3', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-64-france3', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-64 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
