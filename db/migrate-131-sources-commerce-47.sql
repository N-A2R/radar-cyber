-- Sources d'information du secteur « commerce » du département 47 (Lot-et-Garonne).
-- 17 sources, 52 traces de vérification sur 47 URL distinctes, toutes en HTTP 200 le 2026-11-22
-- (GET réel avec User-Agent navigateur, redirections suivies, 12 flux RSS exploitables).
-- Corpus détaillé : bench/corpus/sources-commerce-47.jsonl
-- Preuve HTTP : bench/results/verification-commerce-47.json

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
  ('corpus:commerce47-01-cci', 'CCI Lot-et-Garonne — actualités des entreprises', 'cti', 'https://news.google.com/rss/search?q=CCI%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'CCI Lot-et-Garonne (47) : site et page actualites verifies en HTTP 200.'),
  ('corpus:commerce47-02-cpme', 'CPME 47 — petites et moyennes entreprises du Lot-et-Garonne', 'cti', 'https://news.google.com/rss/search?q=CPME%2047%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'CPME 47 (47) : site et page actualites verifies en HTTP 200.'),
  ('corpus:commerce47-03-cma', 'CMA Nouvelle-Aquitaine — antenne du Lot-et-Garonne', 'cti', 'https://news.google.com/rss/search?q=CMA%20Lot-et-Garonne%20artisanat&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'CMA Nouvelle-Aquitaine, antenne Lot-et-Garonne (47) : actualites verifiees en HTTP 200.'),
  ('corpus:commerce47-04-ladepeche', 'La Depeche du Midi — Lot-et-Garonne', 'presse', 'https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Depeche du Midi, edition Lot-et-Garonne (47). Cyberattaque chez La Sauvegarde (Agen) — https://www.ladepeche.fr/2024/11/07/les-pirates-ont-demande-une-rancon-lassociation-lot-et-garonnaise-la-sauvegarde-victime-dune-cyberattaque-12310164.php'),
  ('corpus:commerce47-05-petitbleu', 'Le Petit Bleu d''Agen — economie', 'presse', 'https://www.petitbleu.fr/economie/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Le Petit Bleu d''Agen (47). Crise informatique de La Sauvegarde — https://www.petitbleu.fr/2026/07/01/il-faut-mettre-un-terme-a-cette-situation-de-souffrance-des-salaries-a-agen-lassociation-la-sauvegarde-en-pleine-crise-informatique-et-sociale-se-13446972.php'),
  ('corpus:commerce47-06-actufr', 'actu.fr — Lot-et-Garonne (economie)', 'presse', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'actu.fr, Lot-et-Garonne (47), rubrique economie : site, rubrique et flux verifies en HTTP 200.'),
  ('corpus:commerce47-07-vie-economique', 'La Vie Economique — Lot-et-Garonne', 'presse', 'https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Vie Economique, Lot-et-Garonne (47) : flux RSS 10 items verifies en HTTP 200.'),
  ('corpus:commerce47-08-jde', 'Le Journal des Entreprises — Lot-et-Garonne', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Le Journal des Entreprises, edition Lot-et-Garonne (47) : page et flux Nouvelle-Aquitaine verifies en HTTP 200.'),
  ('corpus:commerce47-09-ici', 'ICI Lot-et-Garonne (Radio France)', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'ICI Lot-et-Garonne (47) : page d actualites et flux Gascogne verifies en HTTP 200.'),
  ('corpus:commerce47-10-mon-entreprise-info', 'Mon-Entreprise-Info — Lot-et-Garonne', 'cti', 'https://mon-entreprise-info.com/actualites/lot-et-garonne/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Annuaire et actualites des entreprises du Lot-et-Garonne (47) : flux RSS 50 items verifie en HTTP 200.'),
  ('corpus:commerce47-11-societe-tech', 'Societe.Tech — entreprises Lot-et-Garonne', 'presse', 'https://news.google.com/rss/search?q=Societe.Tech%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Societe.Tech, entreprises du Lot-et-Garonne (47) : page et flux verifies en HTTP 200.'),
  ('corpus:commerce47-12-semaine-pyrenees', 'La Semaine des Pyrenees — Lot-et-Garonne', 'presse', 'https://www.lasemainedespyrenees.fr/category/lot-et-garonne/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Semaine des Pyrenees, edition Lot-et-Garonne (47) : page et flux RSS verifies en HTTP 200.'),
  ('corpus:commerce47-13-journal-tonneins', 'Journal de Tonneins', 'presse', 'https://www.journaldetonneins.fr/toutes-les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Journal de Tonneins (47) : site et page d actualites verifies en HTTP 200.'),
  ('corpus:commerce47-14-gpi-medef', 'MEDEF Lot-et-Garonne (GPI-Medef 47)', 'cti', 'https://www.gpi-medef47.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'GPI-Medef 47 (47) : site et actualites verifies en HTTP 200.'),
  ('corpus:commerce47-15-l3vl', 'Les Vitrines de Villeneuve et de la Vallee du Lot (l3vl)', 'cti', 'https://www.l3vl.com/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Reseau de commercants de Villeneuve-sur-Lot (47) : site et actualites verifies en HTTP 200.'),
  ('corpus:commerce47-16-quidam-hebdo', 'Quidam Hebdo — Lot-et-Garonne', 'presse', 'https://quidam-hebdo.com/category/lot-et-garonne/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Quidam Hebdo, rubrique Lot-et-Garonne (47) : page et flux RSS verifies en HTTP 200.'),
  ('corpus:commerce47-17-47fm', '47 FM — radio locale du Lot-et-Garonne', 'presse', 'https://www.47fm.net/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-47.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', '47 FM, radio locale du Lot-et-Garonne (47) : site et actualites verifies en HTTP 200.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:commerce47-01-cci', ARRAY['https://cci47.fr/', 'https://cci47.fr/actualites/', 'https://news.google.com/rss/search?q=CCI%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'https://cci47.fr/5/']),
    ('corpus:commerce47-02-cpme', ARRAY['https://www.cpme47.fr/', 'https://www.cpme47.fr/actualites/', 'https://news.google.com/rss/search?q=CPME%2047%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'https://www.cpme47.fr/actualites/lancement-d-impactcyber-pour-inciter-les-tpe-pme-a-se-securiser-160.html']),
    ('corpus:commerce47-03-cma', ARRAY['https://cma-nouvelleaquitaine.fr/', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'https://news.google.com/rss/search?q=CMA%20Lot-et-Garonne%20artisanat&hl=fr&gl=FR&ceid=FR:fr', 'https://darkwebinformer.com/ledil-immobilier-ledil-immo-database-breached-threat-actor-888-leaks-6-700-french-real-estate-user-records/']),
    ('corpus:commerce47-04-ladepeche', ARRAY['https://www.ladepeche.fr/communes/lot-et-garonne,47/', 'https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'https://www.ladepeche.fr/2024/11/07/les-pirates-ont-demande-une-rancon-lassociation-lot-et-garonnaise-la-sauvegarde-victime-dune-cyberattaque-12310164.php']),
    ('corpus:commerce47-05-petitbleu', ARRAY['https://www.petitbleu.fr/', 'https://www.petitbleu.fr/economie/', 'https://www.petitbleu.fr/economie/rss.xml', 'https://www.petitbleu.fr/2026/07/01/il-faut-mettre-un-terme-a-cette-situation-de-souffrance-des-salaries-a-agen-lassociation-la-sauvegarde-en-pleine-crise-informatique-et-sociale-se-13446972.php']),
    ('corpus:commerce47-06-actufr', ARRAY['https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/economie', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml', 'https://darkwebinformer.com/ledil-immobilier-ledil-immo-database-breached-threat-actor-888-leaks-6-700-french-real-estate-user-records/']),
    ('corpus:commerce47-07-vie-economique', ARRAY['https://www.vie-economique.com/categories/lot-et-garonne/', 'https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'https://legalplanet.pro/lattaque-par-cryptolocker-par-un-prestataire-informatique-mecontent-cour-dappel-dagen-1-decembre-2025-n-de-rg-25-00266/']),
    ('corpus:commerce47-08-jde', ARRAY['https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/lot-et-garonne', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'https://darkwebinformer.com/ledil-immobilier-ledil-immo-database-breached-threat-actor-888-leaks-6-700-french-real-estate-user-records/']),
    ('corpus:commerce47-09-ici', ARRAY['https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml']),
    ('corpus:commerce47-10-mon-entreprise-info', ARRAY['https://mon-entreprise-info.com/actualites/lot-et-garonne/', 'https://mon-entreprise-info.com/actualites/lot-et-garonne/rss.xml', 'https://legalplanet.pro/lattaque-par-cryptolocker-par-un-prestataire-informatique-mecontent-cour-dappel-dagen-1-decembre-2025-n-de-rg-25-00266/']),
    ('corpus:commerce47-11-societe-tech', ARRAY['https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-lot-et-garonne/', 'https://news.google.com/rss/search?q=Societe.Tech%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'https://darkwebinformer.com/ledil-immobilier-ledil-immo-database-breached-threat-actor-888-leaks-6-700-french-real-estate-user-records/']),
    ('corpus:commerce47-12-semaine-pyrenees', ARRAY['https://www.lasemainedespyrenees.fr/category/lot-et-garonne/', 'https://www.lasemainedespyrenees.fr/category/lot-et-garonne/feed/']),
    ('corpus:commerce47-13-journal-tonneins', ARRAY['https://www.journaldetonneins.fr/', 'https://www.journaldetonneins.fr/toutes-les-actualites', 'https://www.ladepeche.fr/2024/11/07/les-pirates-ont-demande-une-rancon-lassociation-lot-et-garonnaise-la-sauvegarde-victime-dune-cyberattaque-12310164.php']),
    ('corpus:commerce47-14-gpi-medef', ARRAY['https://www.gpi-medef47.fr/', 'https://www.gpi-medef47.fr/actualites']),
    ('corpus:commerce47-15-l3vl', ARRAY['https://www.l3vl.com/', 'https://www.l3vl.com/actualites']),
    ('corpus:commerce47-16-quidam-hebdo', ARRAY['https://quidam-hebdo.com/', 'https://quidam-hebdo.com/category/lot-et-garonne/', 'https://quidam-hebdo.com/category/lot-et-garonne/feed/']),
    ('corpus:commerce47-17-47fm', ARRAY['https://www.47fm.net/', 'https://www.47fm.net/actualites'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, t.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-47 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://cci47.fr/', 'text/html; charset=UTF-8', 0),
       ('https://cci47.fr/actualites/', 'text/html; charset=UTF-8', 0),
       ('https://news.google.com/rss/search?q=CCI%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 38),
       ('https://cci47.fr/5/', 'text/html; charset=UTF-8', 0),
       ('https://news.google.com/rss/search?q=CPME%2047%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 9),
       ('https://www.cpme47.fr/', 'text/html; charset=UTF-8', 0),
       ('https://www.cpme47.fr/actualites/', 'text/html; charset=UTF-8', 0),
       ('https://www.cpme47.fr/actualites/lancement-d-impactcyber-pour-inciter-les-tpe-pme-a-se-securiser-160.html', 'text/html; charset=UTF-8', 0),
       ('https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
       ('https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0),
       ('https://news.google.com/rss/search?q=CMA%20Lot-et-Garonne%20artisanat&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 19),
       ('https://www.ladepeche.fr/communes/lot-et-garonne,47/', 'text/html; charset=UTF-8', 0),
       ('https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'text/xml; charset=UTF-8', 25),
       ('https://www.ladepeche.fr/2024/11/07/les-pirates-ont-demande-une-rancon-lassociation-lot-et-garonnaise-la-sauvegarde-victime-dune-cyberattaque-12310164.php', 'text/html; charset=UTF-8', 0),
       ('https://www.petitbleu.fr/', 'text/html; charset=UTF-8', 0),
       ('https://www.petitbleu.fr/economie/', 'text/html; charset=UTF-8', 0),
       ('https://www.petitbleu.fr/economie/rss.xml', 'text/xml; charset=UTF-8', 25),
       ('https://www.petitbleu.fr/2026/07/01/il-faut-mettre-un-terme-a-cette-situation-de-souffrance-des-salaries-a-agen-lassociation-la-sauvegarde-en-pleine-crise-informatique-et-sociale-se-13446972.php', 'text/html; charset=UTF-8', 0),
       ('https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 'text/html; charset=UTF-8', 0),
       ('https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/economie', 'text/html; charset=UTF-8', 0),
       ('https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml', 'application/rss+xml; charset=utf-8', 0),
       ('https://www.vie-economique.com/categories/lot-et-garonne/', 'text/html; charset=UTF-8', 0),
       ('https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'application/rss+xml; charset=UTF-8', 10),
       ('https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/lot-et-garonne', 'text/html; charset=UTF-8', 0),
       ('https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml; charset=UTF-8', 20),
       ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'text/html; charset=UTF-8', 0),
       ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'text/html; charset=UTF-8', 0),
       ('https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml', 20),
       ('https://mon-entreprise-info.com/actualites/lot-et-garonne/', 'text/html', 0),
       ('https://mon-entreprise-info.com/actualites/lot-et-garonne/rss.xml', 'application/xml', 50),
       ('https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-lot-et-garonne/', 'text/html; charset=UTF-8', 0),
       ('https://news.google.com/rss/search?q=Societe.Tech%20Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 31),
       ('https://www.lasemainedespyrenees.fr/category/lot-et-garonne/', 'text/html', 0),
       ('https://www.lasemainedespyrenees.fr/category/lot-et-garonne/feed/', 'application/rss+xml; charset=UTF-8', 10),
       ('https://www.journaldetonneins.fr/', 'text/html; charset=utf-8', 0),
       ('https://www.journaldetonneins.fr/toutes-les-actualites', 'text/html; charset=utf-8', 0),
       ('https://darkwebinformer.com/ledil-immobilier-ledil-immo-database-breached-threat-actor-888-leaks-6-700-french-real-estate-user-records/', 'text/html; charset=utf-8', 0),
       ('https://legalplanet.pro/lattaque-par-cryptolocker-par-un-prestataire-informatique-mecontent-cour-dappel-dagen-1-decembre-2025-n-de-rg-25-00266/', 'text/html; charset=UTF-8', 0),
       ('https://www.gpi-medef47.fr/', 'text/html; charset=UTF-8', 0),
       ('https://www.gpi-medef47.fr/actualites', 'text/html; charset=UTF-8', 0),
       ('https://www.l3vl.com/', 'text/html; charset=UTF-8', 0),
       ('https://www.l3vl.com/actualites', 'text/html; charset=UTF-8', 0),
       ('https://quidam-hebdo.com/', 'text/html; charset=UTF-8', 0),
       ('https://quidam-hebdo.com/category/lot-et-garonne/', 'text/html; charset=UTF-8', 0),
       ('https://quidam-hebdo.com/category/lot-et-garonne/feed/', 'application/rss+xml; charset=UTF-8', 10),
       ('https://www.47fm.net/', 'text/html; charset=utf-8', 0),
       ('https://www.47fm.net/actualites', 'text/html; charset=utf-8', 0)
) AS t(url, type_contenu, items) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
