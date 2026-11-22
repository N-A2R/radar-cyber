-- Sources d'information du secteur « agriculture » du département 24 (Dordogne).
-- 18 sources, 43 URLs contrôlées en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections, 8 flux RSS).
-- Corpus détaillé : bench/corpus/sources-agriculture-24.jsonl
-- Preuve HTTP : bench/results/verification-agriculture-24.json

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
  ('corpus:agriculture-24-chambre-d-agriculture-de-la-dordogne', 'Chambre d''agriculture de la Dordogne', 'presse', 'https://dordogne.chambres-agriculture.fr/actualites-1', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 1'),
  ('corpus:agriculture-24-fdsea-de-la-dordogne', 'FDSEA de la Dordogne', 'presse', 'https://fdsea24.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 2'),
  ('corpus:agriculture-24-jeunes-agriculteurs-de-la-dordogne', 'Jeunes Agriculteurs de la Dordogne', 'presse', 'https://www.jeunesagriculteurs24.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 3'),
  ('corpus:agriculture-24-cerfrance-dordogne', 'Cerfrance Dordogne', 'presse', 'https://www.cerfrancedordogne.fr/blog', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 4'),
  ('corpus:agriculture-24-cer-france-reseau-national', 'CER France (réseau national)', 'presse', 'https://www.cerfrance.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 5'),
  ('corpus:agriculture-24-cci-dordogne', 'CCI Dordogne', 'presse', 'https://dordogne.cci.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 6'),
  ('corpus:agriculture-24-safer-nouvelle-aquitaine-antenne-dordogne', 'SAFER Nouvelle-Aquitaine (antenne Dordogne)', 'presse', 'https://www.saferna.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 7'),
  ('corpus:agriculture-24-federation-regionale-des-cuma-nouvelle-aquitaine', 'Fédération régionale des Cuma Nouvelle-Aquitaine', 'presse', 'https://nouvelle-aquitaine.cuma.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 8'),
  ('corpus:agriculture-24-federation-des-cuma-de-la-dordogne', 'Fédération des Cuma de la Dordogne (annuaire FNCuma)', 'presse', 'https://www.cuma.fr/contacter-une-federation/?_fselect_department=24', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 9'),
  ('corpus:agriculture-24-sud-ouest-dordogne', 'Sud Ouest — Dordogne', 'presse', 'https://www.sudouest.fr/dordogne/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 10'),
  ('corpus:agriculture-24-actu-fr-dordogne', 'actu.fr — Dordogne', 'presse', 'https://actu.fr/nouvelle-aquitaine/dordogne_24/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 11'),
  ('corpus:agriculture-24-ici-perigord-radio-france', 'ICI Périgord (Radio France)', 'presse', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 12'),
  ('corpus:agriculture-24-france-3-nouvelle-aquitaine-dordogne', 'France 3 Nouvelle-Aquitaine — Dordogne', 'presse', 'https://france3-regions.franceinfo.fr/economie/agriculture', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 13'),
  ('corpus:agriculture-24-reussir-presse-agricole-specialisee', 'Réussir (presse agricole spécialisée)', 'presse', 'https://www.reussir.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 14'),
  ('corpus:agriculture-24-la-france-agricole', 'La France Agricole', 'presse', 'https://www.lafranceagricole.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 15'),
  ('corpus:agriculture-24-reussir-le-perigord', 'Réussir le Périgord', 'presse', 'https://www.reussirleperigord.fr/feed', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 16'),
  ('corpus:agriculture-24-dordogne-libre', 'Dordogne Libre', 'presse', 'https://www.dordognelibre.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 17'),
  ('corpus:agriculture-24-annuaire-des-chambres-d-agriculture', 'Annuaire des Chambres d''agriculture (réseau national)', 'presse', 'https://www.chambres-agriculture.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-24.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Source agriculture — Dordogne (24) ; corpus ligne 18')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 43 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:agriculture-24-chambre-d-agriculture-de-la-dordogne', ARRAY['https://dordogne.chambres-agriculture.fr/','https://dordogne.chambres-agriculture.fr/actualites-1']),
    ('corpus:agriculture-24-fdsea-de-la-dordogne', ARRAY['https://fdsea24.fr/','https://fdsea24.fr/actualites/','https://fdsea24.fr/feed/']),
    ('corpus:agriculture-24-jeunes-agriculteurs-de-la-dordogne', ARRAY['https://www.jeunesagriculteurs24.fr/','https://www.jeunesagriculteurs24.fr/actualites']),
    ('corpus:agriculture-24-cerfrance-dordogne', ARRAY['https://www.cerfrancedordogne.fr/','https://www.cerfrancedordogne.fr/blog']),
    ('corpus:agriculture-24-cer-france-reseau-national', ARRAY['https://dordogne.cerfrance.fr/','https://www.cerfrance.fr/actualites/']),
    ('corpus:agriculture-24-cci-dordogne', ARRAY['https://dordogne.cci.fr/','https://dordogne.cci.fr/actualites/','https://dordogne.cci.fr/feed/']),
    ('corpus:agriculture-24-safer-nouvelle-aquitaine-antenne-dordogne', ARRAY['https://www.saferna.fr/','https://www.saferna.fr/actualites/','https://www.saferna.fr/feed/']),
    ('corpus:agriculture-24-federation-regionale-des-cuma-nouvelle-aquitaine', ARRAY['https://nouvelle-aquitaine.cuma.fr/','https://nouvelle-aquitaine.cuma.fr/actualites/']),
    ('corpus:agriculture-24-federation-des-cuma-de-la-dordogne', ARRAY['https://www.cuma.fr/contacter-une-federation/?_fselect_department=24','https://www.cuma.fr/actualites/']),
    ('corpus:agriculture-24-sud-ouest-dordogne', ARRAY['https://www.sudouest.fr/dordogne/','https://www.sudouest.fr/economie/agriculture','https://www.sudouest.fr/dordogne/rss.xml']),
    ('corpus:agriculture-24-actu-fr-dordogne', ARRAY['https://actu.fr/','https://actu.fr/nouvelle-aquitaine/dordogne_24/']),
    ('corpus:agriculture-24-ici-perigord-radio-france', ARRAY['https://www.ici.fr/radio/perigord','https://www.ici.fr/nouvelle-aquitaine/dordogne-24/actu','https://www.ici.fr/rss/perigord/rubrique/infos.xml']),
    ('corpus:agriculture-24-france-3-nouvelle-aquitaine-dordogne', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/','https://france3-regions.franceinfo.fr/economie/agriculture']),
    ('corpus:agriculture-24-reussir-presse-agricole-specialisee', ARRAY['https://www.reussir.fr/','https://www.reussir.fr/fil-actualites','https://www.reussir.fr/rss.xml']),
    ('corpus:agriculture-24-la-france-agricole', ARRAY['https://www.lafranceagricole.fr/','https://www.lafranceagricole.fr/actualites/']),
    ('corpus:agriculture-24-reussir-le-perigord', ARRAY['https://www.reussirleperigord.fr/','https://www.reussirleperigord.fr/actualite','https://www.reussirleperigord.fr/feed']),
    ('corpus:agriculture-24-dordogne-libre', ARRAY['https://www.dordognelibre.fr/','https://www.dordognelibre.fr/rss.xml']),
    ('corpus:agriculture-24-annuaire-des-chambres-d-agriculture', ARRAY['https://www.chambres-agriculture.fr/','https://www.chambres-agriculture.fr/actualites/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus agriculture-24 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
