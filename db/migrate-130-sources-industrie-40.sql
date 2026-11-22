-- Sources d'information du secteur « industrie » du département 40 (Landes).
-- 22 sources, 56 URL distinctes contrôlées en HTTP 200 le 2026-11-22 (57 relevés, GET avec User-Agent navigateur et suivi des redirections).
-- Corpus détaillé : bench/corpus/sources-industrie-40.jsonl
-- Preuve HTTP : bench/results/verification-industrie-40.json

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
  ('corpus:industrie-40-cci-des-landes', 'CCI des Landes', 'presse', 'https://www.landes.cci.fr/presse/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":1,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 1 ; chambre consulaire (industrie et commerce)'),
  ('corpus:industrie-40-cpme-40-les-entrepreneurs-des-landes', 'CPME 40 — Les Entrepreneurs des Landes', 'presse', 'https://cpme40.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":2,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 2 ; organisation patronale TPE-PME'),
  ('corpus:industrie-40-medef-des-landes', 'MEDEF des Landes', 'presse', 'https://landes.territoriaux.medef.com/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":3,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 3 ; organisation patronale'),
  ('corpus:industrie-40-medef-nouvelle-aquitaine-perimetre-landes', 'MEDEF Nouvelle-Aquitaine (périmètre Landes)', 'presse', 'https://www.medef-nouvelle-aquitaine.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":4,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 4 ; organisation patronale régionale'),
  ('corpus:industrie-40-uimm-nouvelle-aquitaine-perimetre-landes', 'UIMM Nouvelle-Aquitaine (périmètre Landes)', 'presse', 'https://www.uimmnouvelleaquitaine.com/actualite/news.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":5,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 5 ; syndicat professionnel de la métallurgie'),
  ('corpus:industrie-40-grand-dax-agglomeration-developpement-economique', 'Grand Dax Agglomération — développement économique', 'presse', 'https://www.grand-dax.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":6,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 6 ; intercommunalité (développement industriel)'),
  ('corpus:industrie-40-actu-fr-actu-landes', 'actu.fr — Actu Landes', 'presse', 'https://actu.fr/landes/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":7,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 7 ; presse locale en ligne'),
  ('corpus:industrie-40-les-annonces-landaises', 'Les Annonces Landaises', 'presse', 'https://www.annonces-landaises.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":8,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 8 ; hebdomadaire local'),
  ('corpus:industrie-40-ici-gascogne-radio-france', 'ICI Gascogne (Radio France)', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":9,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 9 ; radio locale'),
  ('corpus:industrie-40-france-3-nouvelle-aquitaine-edition-landes', 'France 3 Nouvelle-Aquitaine — édition Landes', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":10,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 10 ; télévision locale'),
  ('corpus:industrie-40-club-landes-entreprises', 'Club Landes Entreprises', 'presse', 'https://club-landes-entreprises.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":11,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 11 ; club d''entreprises'),
  ('corpus:industrie-40-landes-business-club-d-affaires-dax', 'Landes & Business — club d''affaires (Dax)', 'presse', 'https://www.landes-business.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":12,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 12 ; club d''entreprises'),
  ('corpus:industrie-40-le-journal-des-entreprises-nouvelle-aquitaine', 'Le Journal des Entreprises — Nouvelle-Aquitaine', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":13,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 13 ; presse économique régionale'),
  ('corpus:industrie-40-api-recherche-d-entreprises-etalab-insee', 'API Recherche d''entreprises (Étalab / INSEE)', 'presse', 'https://recherche-entreprises.api.gouv.fr/search?departement=40&q=industrie', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":14,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 14 ; annuaire professionnel public (API)'),
  ('corpus:industrie-40-bodacc-annonces-commerciales', 'BODACC — annonces commerciales', 'presse', 'https://www.bodacc.fr/pages/annonces-commerciales-recherche/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":15,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 15 ; téléservice public d''annonces légales'),
  ('corpus:industrie-40-google-news-veille-landes-industrie', 'Google News — veille « Landes industrie »', 'presse', 'https://news.google.com/rss/search?q=Landes+industrie&hl=fr&gl=FR&ceid=FR:fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":16,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 16 ; agrégateur de presse locale'),
  ('corpus:industrie-40-google-news-veille-landes-usine', 'Google News — veille « Landes usine »', 'presse', 'https://news.google.com/rss/search?q=Landes+usine&hl=fr&gl=FR&ceid=FR:fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":17,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 17 ; agrégateur de presse locale'),
  ('corpus:industrie-40-cma-nouvelle-aquitaine-perimetre-landes', 'CMA Nouvelle-Aquitaine (périmètre Landes)', 'presse', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":18,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 18 ; chambre consulaire (artisanat et petites industries)'),
  ('corpus:industrie-40-chambre-d-agriculture-des-landes-agro-industrie', 'Chambre d''agriculture des Landes (agro-industrie)', 'presse', 'https://landes.chambres-agriculture.fr/actualites-1', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":19,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 19 ; chambre consulaire (agro-industrie)'),
  ('corpus:industrie-40-uimm-gironde-landes-antenne-landes', 'UIMM Gironde-Landes (antenne Landes)', 'presse', 'https://www.uimm3340.com/actualite/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":20,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 20 ; syndicat professionnel de la métallurgie (33/40)'),
  ('corpus:industrie-40-fibois-landes-de-gascogne', 'Fibois Landes de Gascogne', 'presse', 'https://fibois-landesdegascogne.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":21,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 21 ; interprofession de la filière forêt-bois'),
  ('corpus:industrie-40-fibois-nouvelle-aquitaine-perimetre-landes', 'Fibois Nouvelle-Aquitaine (périmètre Landes)', 'presse', 'https://fibois-na.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-40.jsonl","ligne":22,"type":"source","secteur":"industrie","departement":"40"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source industrie — Landes (40) ; corpus ligne 22 ; fédération sectorielle de la filière forêt-bois')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

CREATE TEMP TABLE urls_industrie_40 (source_id text NOT NULL, url text NOT NULL, content_type text NOT NULL, items integer NOT NULL);
INSERT INTO urls_industrie_40 (source_id, url, content_type, items)
VALUES
  ('corpus:industrie-40-cci-des-landes', 'https://www.landes.cci.fr/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-cci-des-landes', 'https://www.landes.cci.fr/presse/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-cci-des-landes', 'https://www.landes.cci.fr/industrie/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-cpme-40-les-entrepreneurs-des-landes', 'https://www.cpme40.fr/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-cpme-40-les-entrepreneurs-des-landes', 'https://cpme40.fr/category/actualites/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-cpme-40-les-entrepreneurs-des-landes', 'https://cpme40.fr/category/actualites/tpe-pme-landes/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-cpme-40-les-entrepreneurs-des-landes', 'https://cpme40.fr/feed/', 'application/rss+xml; charset=UTF-8', 6),
  ('corpus:industrie-40-medef-des-landes', 'https://landes.territoriaux.medef.com/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-medef-des-landes', 'https://landes.territoriaux.medef.com/actualites', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-medef-nouvelle-aquitaine-perimetre-landes', 'https://www.medef-nouvelle-aquitaine.fr/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-medef-nouvelle-aquitaine-perimetre-landes', 'https://www.medef-nouvelle-aquitaine.fr/actualites', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-uimm-nouvelle-aquitaine-perimetre-landes', 'https://www.uimmnouvelleaquitaine.com/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-uimm-nouvelle-aquitaine-perimetre-landes', 'https://www.uimmnouvelleaquitaine.com/actualite/news.html', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-grand-dax-agglomeration-developpement-economique', 'https://www.grand-dax.fr/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-grand-dax-agglomeration-developpement-economique', 'https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-grand-dax-agglomeration-developpement-economique', 'https://www.grand-dax.fr/feed/', 'application/rss+xml; charset=UTF-8', 6),
  ('corpus:industrie-40-actu-fr-actu-landes', 'https://actu.fr/landes/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-actu-fr-actu-landes', 'https://actu.fr/landes/dernieres-actus', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-actu-fr-actu-landes', 'https://actu.fr/landes/rss.xml', 'application/rss+xml; charset=utf-8', 20),
  ('corpus:industrie-40-les-annonces-landaises', 'https://www.annonces-landaises.com/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-les-annonces-landaises', 'https://www.annonces-landaises.com/categories/entreprises/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-les-annonces-landaises', 'https://www.annonces-landaises.com/feed/', 'application/rss+xml; charset=UTF-8', 10),
  ('corpus:industrie-40-ici-gascogne-radio-france', 'https://www.ici.fr/radio/gascogne', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-ici-gascogne-radio-france', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-ici-gascogne-radio-france', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml', 20),
  ('corpus:industrie-40-france-3-nouvelle-aquitaine-edition-landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-france-3-nouvelle-aquitaine-edition-landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 'text/xml; charset=UTF-8', 23),
  ('corpus:industrie-40-club-landes-entreprises', 'https://club-landes-entreprises.fr/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-club-landes-entreprises', 'https://club-landes-entreprises.fr/agenda/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-club-landes-entreprises', 'https://club-landes-entreprises.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
  ('corpus:industrie-40-landes-business-club-d-affaires-dax', 'https://www.landes-business.fr/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-landes-business-club-d-affaires-dax', 'https://www.landes-business.fr/landes/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-landes-business-club-d-affaires-dax', 'https://www.landes-business.fr/feed/', 'application/rss+xml; charset=UTF-8', 1),
  ('corpus:industrie-40-le-journal-des-entreprises-nouvelle-aquitaine', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-le-journal-des-entreprises-nouvelle-aquitaine', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/landes', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-le-journal-des-entreprises-nouvelle-aquitaine', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml; charset=UTF-8', 20),
  ('corpus:industrie-40-api-recherche-d-entreprises-etalab-insee', 'https://recherche-entreprises.api.gouv.fr/', 'text/html;charset=utf-8', 0),
  ('corpus:industrie-40-api-recherche-d-entreprises-etalab-insee', 'https://recherche-entreprises.api.gouv.fr/search?departement=40&q=industrie', 'application/json', 0),
  ('corpus:industrie-40-bodacc-annonces-commerciales', 'https://www.bodacc.fr/pages/home/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-bodacc-annonces-commerciales', 'https://www.bodacc.fr/pages/annonces-commerciales-recherche/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-google-news-veille-landes-industrie', 'https://news.google.com/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-google-news-veille-landes-industrie', 'https://news.google.com/rss/search?q=Landes+industrie&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 35),
  ('corpus:industrie-40-google-news-veille-landes-usine', 'https://news.google.com/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-google-news-veille-landes-usine', 'https://news.google.com/rss/search?q=Landes+usine&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 40),
  ('corpus:industrie-40-cma-nouvelle-aquitaine-perimetre-landes', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-cma-nouvelle-aquitaine-perimetre-landes', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-chambre-d-agriculture-des-landes-agro-industrie', 'https://landes.chambres-agriculture.fr/', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-chambre-d-agriculture-des-landes-agro-industrie', 'https://landes.chambres-agriculture.fr/actualites-1', 'text/html; charset=utf-8', 0),
  ('corpus:industrie-40-uimm-gironde-landes-antenne-landes', 'https://www.uimm3340.com/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-uimm-gironde-landes-antenne-landes', 'https://www.uimm3340.com/actualite/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-uimm-gironde-landes-antenne-landes', 'https://www.uimm3340.com/actualite/feed/', 'text/xml;charset=UTF-8', 12),
  ('corpus:industrie-40-fibois-landes-de-gascogne', 'https://fibois-landesdegascogne.fr/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-fibois-landes-de-gascogne', 'https://fibois-landesdegascogne.fr/actualites/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-fibois-landes-de-gascogne', 'https://fibois-landesdegascogne.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
  ('corpus:industrie-40-fibois-nouvelle-aquitaine-perimetre-landes', 'https://fibois-na.fr/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-fibois-nouvelle-aquitaine-perimetre-landes', 'https://fibois-na.fr/category/actualites/', 'text/html; charset=UTF-8', 0),
  ('corpus:industrie-40-fibois-nouvelle-aquitaine-perimetre-landes', 'https://fibois-na.fr/feed/', 'application/rss+xml; charset=UTF-8', 10)
;

INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(),
       'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
       'ok200', 'Corpus industrie-40 : HTTP 200 vérifié le 2026-11-22'
FROM urls_industrie_40 u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
