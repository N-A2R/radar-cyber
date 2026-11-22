-- Sources d'information du secteur « commerce » du département 40 (Landes).
-- 14 sources, 50 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel avec User-Agent navigateur, redirections suivies, 11 flux RSS exploitables).
-- Corpus détaillé : bench/corpus/sources-commerce-40.jsonl
-- Preuve HTTP : bench/results/verification-commerce-40.json

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
  ('corpus:commerce-40-cci-landes', 'CCI des Landes — actualités et entreprises', 'cti', 'https://www.landes.cci.fr/actualite/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":1}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Mars@Hack 2026 : les acteurs landais mobilisés autour de la cybersécurité — https://www.landes.cci.fr/presse/marshack-2026-cybersecurite/'),
  ('corpus:commerce-40-cma-landes', 'CMA Nouvelle-Aquitaine — antenne des Landes', 'cti', 'https://www.cma-landes.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":2}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Mars@Hack 2022 : un cyberévènement dans les Landes — https://www.aquitaineonline.com/actualites-en-aquitaine/landes/9919-mars-hack-cyber-evenement-dans-les-landes.html'),
  ('corpus:commerce-40-medef-landes', 'MEDEF des Landes — actualités', 'cti', 'https://news.google.com/rss/search?q=MEDEF%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":3}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Mars@Hack 2026 : les acteurs landais mobilisés autour de la cybersécurité — https://www.landes.cci.fr/presse/marshack-2026-cybersecurite/'),
  ('corpus:commerce-40-club-landes-entreprises', 'Club Landes Entreprises', 'cti', 'https://club-landes-entreprises.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":4}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Mars@Hack 2026 : les acteurs landais mobilisés autour de la cybersécurité — https://www.landes.cci.fr/presse/marshack-2026-cybersecurite/'),
  ('corpus:commerce-40-landes-business', 'Landes & Business — club d''affaires (Dax)', 'cti', 'https://www.landes-business.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":5}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Arnaque au faux SMS à Mont-de-Marsan : une victime perd 52 000 euros — https://landesinfo.net/05/02/arnaque-au-faux-sms-a-mont-de-marsan-une-victime-perd-52-000-euros/19949/'),
  ('corpus:commerce-40-jde-landes', 'Le Journal des Entreprises — Landes', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":6}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Les pompiers des Landes victimes d''une cyberattaque, des données personnelles extraites — https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html'),
  ('corpus:commerce-40-actu-landes', 'actu.fr — Landes (économie)', 'presse', 'https://actu.fr/landes/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":7}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Les pompiers des Landes victimes d''une cyberattaque, des données personnelles extraites — https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html'),
  ('corpus:commerce-40-landes-info', 'Landes Info — actualités économiques', 'presse', 'https://landesinfo.net/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":8}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Arnaque au faux SMS à Mont-de-Marsan : une victime perd 52 000 euros — https://landesinfo.net/05/02/arnaque-au-faux-sms-a-mont-de-marsan-une-victime-perd-52-000-euros/19949/'),
  ('corpus:commerce-40-annonces-landaises', 'Les Annonces Landaises — actualités', 'presse', 'https://www.annonces-landaises.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":9}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Octobre, mois de la cybersécurité à Mont-de-Marsan — https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/'),
  ('corpus:commerce-40-zemag40', 'ZE mag 40 — actualités des Landes', 'presse', 'https://www.zemag40.com/rss/blog', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":10}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'ZE mag 40 — actualités des Landes'),
  ('corpus:commerce-40-mon-entreprise-info', 'Mon-Entreprise-Info — actualités Landes', 'cti', 'https://mon-entreprise-info.com/actualites/landes/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":11}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Mon-Entreprise-Info — actualités Landes'),
  ('corpus:commerce-40-societe-tech', 'Societe.Tech — entreprises Landes', 'presse', 'https://news.google.com/rss/search?q=Societe.Tech%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":12}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Societe.Tech — entreprises Landes'),
  ('corpus:commerce-40-aquitaineonline', 'AquitaineOnLine — Landes', 'presse', 'https://www.aquitaineonline.com/actualites-en-aquitaine/landes/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":13}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Mars@Hack 2022 : un cyberévènement dans les Landes — https://www.aquitaineonline.com/actualites-en-aquitaine/landes/9919-mars-hack-cyber-evenement-dans-les-landes.html'),
  ('corpus:commerce-40-ici-gascogne', 'ICI Gascogne — Landes (Radio France)', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-40.jsonl","ligne":14}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Des réseaux de transport landais victimes d''une arnaque sur Facebook — https://www.ici.fr/infos/faits-divers-justice/des-reseaux-de-transport-landais-victimes-d-une-arnaque-sur-facebook-1671740')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 50 URLs (sites, pages actualités, flux et articles cyber), toutes en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:commerce-40-cci-landes', 'https://www.landes.cci.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-cci-landes', 'https://www.landes.cci.fr/actualite/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-cci-landes', 'https://www.landes.cci.fr/presse/marshack-2026-cybersecurite/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-cma-landes', 'https://www.cma-landes.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-cma-landes', 'https://www.cma-landes.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-cma-landes', 'https://www.aquitaineonline.com/actualites-en-aquitaine/landes/9919-mars-hack-cyber-evenement-dans-les-landes.html', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-medef-landes', 'https://landes.territoriaux.medef.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-medef-landes', 'https://landes.territoriaux.medef.com/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-medef-landes', 'https://news.google.com/rss/search?q=MEDEF%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 21),
    ('corpus:commerce-40-medef-landes', 'https://www.landes.cci.fr/presse/marshack-2026-cybersecurite/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-club-landes-entreprises', 'https://club-landes-entreprises.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-club-landes-entreprises', 'https://club-landes-entreprises.fr/agenda/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-club-landes-entreprises', 'https://club-landes-entreprises.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-40-club-landes-entreprises', 'https://www.landes.cci.fr/presse/marshack-2026-cybersecurite/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-landes-business', 'https://www.landes-business.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-landes-business', 'https://www.landes-business.fr/landes/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-landes-business', 'https://www.landes-business.fr/feed/', 'application/rss+xml; charset=UTF-8', 1),
    ('corpus:commerce-40-landes-business', 'https://landesinfo.net/05/02/arnaque-au-faux-sms-a-mont-de-marsan-une-victime-perd-52-000-euros/19949/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-jde-landes', 'https://www.lejournaldesentreprises.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-jde-landes', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/landes', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-jde-landes', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml; charset=UTF-8', 20),
    ('corpus:commerce-40-jde-landes', 'https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-actu-landes', 'https://actu.fr/landes/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-actu-landes', 'https://actu.fr/landes/economie', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-actu-landes', 'https://actu.fr/landes/rss.xml', 'application/rss+xml; charset=utf-8', 20),
    ('corpus:commerce-40-actu-landes', 'https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-landes-info', 'https://landesinfo.net/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-landes-info', 'https://landesinfo.net/edition', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-landes-info', 'https://landesinfo.net/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-40-landes-info', 'https://landesinfo.net/05/02/arnaque-au-faux-sms-a-mont-de-marsan-une-victime-perd-52-000-euros/19949/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-annonces-landaises', 'https://www.annonces-landaises.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-annonces-landaises', 'https://www.annonces-landaises.com/categories/collectivites/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-annonces-landaises', 'https://www.annonces-landaises.com/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-40-annonces-landaises', 'https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-zemag40', 'https://www.zemag40.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-zemag40', 'https://www.zemag40.com/zemag/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-zemag40', 'https://www.zemag40.com/rss/blog', 'application/rss+xml;  charset=utf-8', 1),
    ('corpus:commerce-40-mon-entreprise-info', 'https://mon-entreprise-info.com/', 'text/html', 0),
    ('corpus:commerce-40-mon-entreprise-info', 'https://mon-entreprise-info.com/actualites/landes/', 'text/html', 0),
    ('corpus:commerce-40-mon-entreprise-info', 'https://mon-entreprise-info.com/actualites/landes/rss.xml', 'application/xml', 50),
    ('corpus:commerce-40-societe-tech', 'https://www.societe.tech/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-societe-tech', 'https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-landes/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-societe-tech', 'https://news.google.com/rss/search?q=Societe.Tech%20Landes&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 32),
    ('corpus:commerce-40-aquitaineonline', 'https://www.aquitaineonline.com/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-aquitaineonline', 'https://www.aquitaineonline.com/actualites-en-aquitaine/landes/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-aquitaineonline', 'https://www.aquitaineonline.com/actualites-en-aquitaine/landes/9919-mars-hack-cyber-evenement-dans-les-landes.html', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-40-ici-gascogne', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-ici-gascogne', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-40-ici-gascogne', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-40-ici-gascogne', 'https://www.ici.fr/infos/faits-divers-justice/des-reseaux-de-transport-landais-victimes-d-une-arnaque-sur-facebook-1671740', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-40 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
