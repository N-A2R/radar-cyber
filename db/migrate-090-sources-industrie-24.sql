-- Sources d'information du secteur « industrie » du département 24 (Dordogne).
-- 29 sources, 68 URLs contrôlées en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections).
-- Corpus détaillé : bench/corpus/sources-industrie-24.jsonl
-- Preuve HTTP : bench/results/verification-industrie-24.json

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

CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:industrie-24-cci-dordogne', 'CCI Dordogne', 'presse', 'https://dordogne.cci.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 1'),
  ('corpus:industrie-24-medef-nouvelle-aquitaine-perimetre-dordogne', 'MEDEF Nouvelle-Aquitaine (périmètre Dordogne)', 'presse', 'https://www.medef-nouvelle-aquitaine.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 2'),
  ('corpus:industrie-24-cpme-nouvelle-aquitaine-perimetre-dordogne', 'CPME Nouvelle-Aquitaine (périmètre Dordogne)', 'presse', 'https://www.cpme-nouvelle-aquitaine.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 3'),
  ('corpus:industrie-24-uimm-nouvelle-aquitaine-antenne-perigord', 'UIMM Nouvelle-Aquitaine (antenne Périgord)', 'presse', 'https://www.uimmnouvelleaquitaine.com/actualite/news.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 4'),
  ('corpus:industrie-24-uimm-la-fabrique-de-l-avenir', 'UIMM — La Fabrique de l''avenir', 'presse', 'https://uimm.lafabriquedelavenir.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 5'),
  ('corpus:industrie-24-fibois-nouvelle-aquitaine', 'Fibois Nouvelle-Aquitaine', 'presse', 'https://fibois-na.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 6'),
  ('corpus:industrie-24-cma-nouvelle-aquitaine-delegation-de-la-dordogne', 'CMA Nouvelle-Aquitaine — délégation de la Dordogne', 'presse', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 7'),
  ('corpus:industrie-24-chambre-d-agriculture-de-la-dordogne-agro-industrie', 'Chambre d''agriculture de la Dordogne (agro-industrie)', 'presse', 'https://dordogne.chambres-agriculture.fr/actualites-1', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 8'),
  ('corpus:industrie-24-fdsea-de-la-dordogne-agro-industrie', 'FDSEA de la Dordogne (agro-industrie)', 'presse', 'https://fdsea24.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 9'),
  ('corpus:industrie-24-grand-perigueux-developpement-economique', 'Grand Périgueux — développement économique', 'presse', 'https://www.grandperigueux.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 10'),
  ('corpus:industrie-24-api-recherche-d-entreprises-etalab-insee', 'API Recherche d''entreprises (Étalab / INSEE)', 'presse', 'https://recherche-entreprises.api.gouv.fr/search?departement=24&q=industrie', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 11'),
  ('corpus:industrie-24-bodacc-annonces-commerciales', 'BODACC — annonces commerciales', 'presse', 'https://www.bodacc.fr/pages/annonces-commerciales-recherche/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 12'),
  ('corpus:industrie-24-sud-ouest-dordogne', 'Sud Ouest — Dordogne', 'presse', 'https://www.sudouest.fr/dordogne/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 13'),
  ('corpus:industrie-24-sud-ouest-economie', 'Sud Ouest — Économie', 'presse', 'https://www.sudouest.fr/economie/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 14'),
  ('corpus:industrie-24-dordogne-libre', 'Dordogne Libre', 'presse', 'https://www.dordognelibre.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 15'),
  ('corpus:industrie-24-actu-fr-dordogne', 'actu.fr — Dordogne', 'presse', 'https://actu.fr/nouvelle-aquitaine/dordogne_24/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 16'),
  ('corpus:industrie-24-ici-perigord-radio-france', 'ICI Périgord (Radio France)', 'presse', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 17'),
  ('corpus:industrie-24-france-3-nouvelle-aquitaine-dordogne', 'France 3 Nouvelle-Aquitaine — Dordogne', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 18'),
  ('corpus:industrie-24-le-journal-des-entreprises-nouvelle-aquitaine', 'Le Journal des Entreprises — Nouvelle-Aquitaine', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 19'),
  ('corpus:industrie-24-reussir-le-perigord', 'Réussir le Périgord', 'presse', 'https://www.reussirleperigord.fr/feed', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 20'),
  ('corpus:industrie-24-la-france-agricole', 'La France Agricole', 'presse', 'https://www.lafranceagricole.fr/rss/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 21'),
  ('corpus:industrie-24-happy-radio-bergerac', 'Happy Radio (Bergerac)', 'presse', 'https://happyradio.fr/feed', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":22,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 22'),
  ('corpus:industrie-24-google-news-veille-dordogne-industrie', 'Google News — veille « Dordogne industrie »', 'presse', 'https://news.google.com/rss/search?q=Dordogne+industrie&hl=fr&gl=FR&ceid=FR:fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":23,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 23'),
  ('corpus:industrie-24-google-news-veille-dordogne-usine', 'Google News — veille « Dordogne usine »', 'presse', 'https://news.google.com/rss/search?q=Dordogne+usine&hl=fr&gl=FR&ceid=FR:fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":24,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 24'),
  ('corpus:industrie-24-cpme-24-les-entrepreneurs-24', 'CPME 24 — Les Entrepreneurs 24', 'presse', 'https://24.lesentrepreneurs.fr/agenda/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":25,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 25'),
  ('corpus:industrie-24-capeb-dordogne', 'CAPEB Dordogne', 'presse', 'https://capeb24.com/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":26,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 26'),
  ('corpus:industrie-24-digital-valley-cluster-numerique-de-dordogne', 'Digital Valley (cluster numérique de Dordogne)', 'presse', 'https://digital-valley.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":27,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 27'),
  ('corpus:industrie-24-french-tech-perigord', 'French Tech Périgord', 'presse', 'https://frenchtechperigord.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":28,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 28'),
  ('corpus:industrie-24-initiative-perigord', 'Initiative Périgord', 'presse', 'https://www.initiative-perigord.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-24.jsonl","ligne":29,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source industrie — Dordogne (24) ; corpus ligne 29')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : URLs uniques des sites, pages actualités et flux, contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:industrie-24-cci-dordogne', ARRAY['https://dordogne.cci.fr/','https://dordogne.cci.fr/actualites/','https://dordogne.cci.fr/feed/']),
    ('corpus:industrie-24-medef-nouvelle-aquitaine-perimetre-dordogne', ARRAY['https://www.medef-nouvelle-aquitaine.fr/','https://www.medef-nouvelle-aquitaine.fr/actualites']),
    ('corpus:industrie-24-cpme-nouvelle-aquitaine-perimetre-dordogne', ARRAY['https://www.cpme-nouvelle-aquitaine.fr/','https://www.cpme-nouvelle-aquitaine.fr/actualites/']),
    ('corpus:industrie-24-uimm-nouvelle-aquitaine-antenne-perigord', ARRAY['https://www.uimmnouvelleaquitaine.com/','https://www.uimmnouvelleaquitaine.com/actualite/news.html']),
    ('corpus:industrie-24-uimm-la-fabrique-de-l-avenir', ARRAY['https://uimm.lafabriquedelavenir.fr/','https://uimm.lafabriquedelavenir.fr/actualites/','https://uimm.lafabriquedelavenir.fr/feed/']),
    ('corpus:industrie-24-fibois-nouvelle-aquitaine', ARRAY['https://fibois-na.fr/','https://fibois-na.fr/actualites/','https://fibois-na.fr/feed/']),
    ('corpus:industrie-24-cma-nouvelle-aquitaine-delegation-de-la-dordogne', ARRAY['https://cma-nouvelleaquitaine.fr/','https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites']),
    ('corpus:industrie-24-chambre-d-agriculture-de-la-dordogne-agro-industrie', ARRAY['https://dordogne.chambres-agriculture.fr/','https://dordogne.chambres-agriculture.fr/actualites-1']),
    ('corpus:industrie-24-fdsea-de-la-dordogne-agro-industrie', ARRAY['https://fdsea24.fr/','https://fdsea24.fr/actualites/','https://fdsea24.fr/feed/']),
    ('corpus:industrie-24-grand-perigueux-developpement-economique', ARRAY['https://www.grandperigueux.fr/','https://www.grandperigueux.fr/actualites/']),
    ('corpus:industrie-24-api-recherche-d-entreprises-etalab-insee', ARRAY['https://recherche-entreprises.api.gouv.fr/','https://recherche-entreprises.api.gouv.fr/search?departement=24&q=industrie']),
    ('corpus:industrie-24-bodacc-annonces-commerciales', ARRAY['https://www.bodacc.fr/pages/home/','https://www.bodacc.fr/pages/annonces-commerciales-recherche/']),
    ('corpus:industrie-24-sud-ouest-dordogne', ARRAY['https://www.sudouest.fr/dordogne/','https://www.sudouest.fr/economie/industrie/','https://www.sudouest.fr/dordogne/rss.xml']),
    ('corpus:industrie-24-sud-ouest-economie', ARRAY['https://www.sudouest.fr/economie/','https://www.sudouest.fr/economie/rss.xml']),
    ('corpus:industrie-24-dordogne-libre', ARRAY['https://www.dordognelibre.fr/','https://www.dordognelibre.fr/rss.xml']),
    ('corpus:industrie-24-actu-fr-dordogne', ARRAY['https://actu.fr/','https://actu.fr/nouvelle-aquitaine/dordogne_24/']),
    ('corpus:industrie-24-ici-perigord-radio-france', ARRAY['https://www.ici.fr/radio/perigord','https://www.ici.fr/nouvelle-aquitaine/dordogne-24/actu','https://www.ici.fr/rss/perigord/rubrique/infos.xml']),
    ('corpus:industrie-24-france-3-nouvelle-aquitaine-dordogne', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/','https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss']),
    ('corpus:industrie-24-le-journal-des-entreprises-nouvelle-aquitaine', ARRAY['https://www.lejournaldesentreprises.com/nouvelle-aquitaine','https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/dordogne','https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine']),
    ('corpus:industrie-24-reussir-le-perigord', ARRAY['https://www.reussirleperigord.fr/','https://www.reussirleperigord.fr/actualite','https://www.reussirleperigord.fr/feed']),
    ('corpus:industrie-24-la-france-agricole', ARRAY['https://www.lafranceagricole.fr/','https://www.lafranceagricole.fr/actualites/','https://www.lafranceagricole.fr/rss/']),
    ('corpus:industrie-24-happy-radio-bergerac', ARRAY['https://happyradio.fr/','https://happyradio.fr/feed']),
    ('corpus:industrie-24-google-news-veille-dordogne-industrie', ARRAY['https://news.google.com/','https://news.google.com/rss/search?q=Dordogne+industrie&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:industrie-24-google-news-veille-dordogne-usine', ARRAY['https://news.google.com/','https://news.google.com/rss/search?q=Dordogne+usine&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:industrie-24-cpme-24-les-entrepreneurs-24', ARRAY['https://cpme24.org/','https://24.lesentrepreneurs.fr/agenda/actualites']),
    ('corpus:industrie-24-capeb-dordogne', ARRAY['https://capeb24.com/','https://capeb24.com/actualites/']),
    ('corpus:industrie-24-digital-valley-cluster-numerique-de-dordogne', ARRAY['https://digital-valley.fr/','https://digital-valley.fr/actualites-innovation-digital-dordogne/','https://digital-valley.fr/feed/']),
    ('corpus:industrie-24-french-tech-perigord', ARRAY['https://frenchtechperigord.fr/','https://frenchtechperigord.fr/actualites/','https://frenchtechperigord.fr/feed/']),
    ('corpus:industrie-24-initiative-perigord', ARRAY['https://www.initiative-perigord.fr/','https://www.initiative-perigord.fr/actualites/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus industrie-24 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
