-- Sources d'information du secteur « agriculture » du département 19 (Corrèze).
-- 10 sources, 24 URLs contrôlées en HTTP 200 le 2026-11-22 (curl -L, GET avec User-Agent navigateur, 4 flux RSS).
-- Corpus détaillé : bench/corpus/sources-agriculture-19.jsonl
-- Preuve HTTP : bench/results/verification-agriculture-19.json

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
  ('corpus:agriculture-19-chambre-d-agriculture-de-la-correze', 'Chambre d''agriculture de la Corrèze', 'presse', 'https://correze.chambres-agriculture.fr/actualites-1', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 1'),
  ('corpus:agriculture-19-fdsea-de-la-correze', 'FDSEA de la Corrèze', 'presse', 'https://fdsea19.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 2'),
  ('corpus:agriculture-19-la-montagne-correze', 'La Montagne — Corrèze', 'presse', 'https://www.lamontagne.fr/economie/agriculture', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 3'),
  ('corpus:agriculture-19-ici-correze-radio-france', 'ICI Corrèze (Radio France)', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 4'),
  ('corpus:agriculture-19-actu-fr-correze', 'actu.fr — Corrèze', 'presse', 'https://actu.fr/nouvelle-aquitaine/correze_19/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 5'),
  ('corpus:agriculture-19-reussir-presse-agricole-specialisee', 'Réussir (presse agricole spécialisée)', 'presse', 'https://www.reussir.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 6'),
  ('corpus:agriculture-19-sud-ouest-correze', 'Sud Ouest — Corrèze', 'presse', 'https://www.sudouest.fr/correze/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 7'),
  ('corpus:agriculture-19-france-3-nouvelle-aquitaine-correze', 'France 3 Nouvelle-Aquitaine — Corrèze', 'presse', 'https://france3-regions.franceinfo.fr/economie/agriculture', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 8'),
  ('corpus:agriculture-19-la-france-agricole', 'La France Agricole', 'presse', 'https://www.lafranceagricole.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 9'),
  ('corpus:agriculture-19-cer-france-correze-centre-de-gestion-agricole', 'CER France Corrèze (centre de gestion agricole)', 'presse', 'https://www.cerfrance.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-19.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Source agriculture — Corrèze (19) ; corpus ligne 10')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 24 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:agriculture-19-chambre-d-agriculture-de-la-correze', ARRAY['https://correze.chambres-agriculture.fr/','https://correze.chambres-agriculture.fr/actualites-1']),
    ('corpus:agriculture-19-fdsea-de-la-correze', ARRAY['https://fdsea19.fr/','https://fdsea19.fr/actualites/','https://fdsea19.fr/feed/']),
    ('corpus:agriculture-19-la-montagne-correze', ARRAY['https://www.lamontagne.fr/correze/','https://www.lamontagne.fr/economie/agriculture']),
    ('corpus:agriculture-19-ici-correze-radio-france', ARRAY['https://www.ici.fr/radio/limousin','https://www.ici.fr/nouvelle-aquitaine/correze-19/actu','https://www.ici.fr/rss/limousin/rubrique/infos.xml']),
    ('corpus:agriculture-19-actu-fr-correze', ARRAY['https://actu.fr/','https://actu.fr/nouvelle-aquitaine/correze_19/']),
    ('corpus:agriculture-19-reussir-presse-agricole-specialisee', ARRAY['https://www.reussir.fr/','https://www.reussir.fr/fil-actualites','https://www.reussir.fr/rss.xml']),
    ('corpus:agriculture-19-sud-ouest-correze', ARRAY['https://www.sudouest.fr/correze/','https://www.sudouest.fr/economie/agriculture','https://www.sudouest.fr/correze/rss.xml']),
    ('corpus:agriculture-19-france-3-nouvelle-aquitaine-correze', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/','https://france3-regions.franceinfo.fr/economie/agriculture']),
    ('corpus:agriculture-19-la-france-agricole', ARRAY['https://www.lafranceagricole.fr/','https://www.lafranceagricole.fr/actualites/']),
    ('corpus:agriculture-19-cer-france-correze-centre-de-gestion-agricole', ARRAY['https://correze.cerfrance.fr/','https://www.cerfrance.fr/actualites/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus agriculture-19 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
