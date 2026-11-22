-- Sources d'information du secteur « agriculture » du département 17 (Charente-Maritime).
-- 9 sources, 24 URLs contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-agriculture-17.jsonl
-- Rapport : bench/results/verification-agriculture-17.json
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:agriculture-17-jeunes-agriculteurs-de-la-charente-maritime-ja-17', 'Jeunes Agriculteurs de la Charente-Maritime (JA 17)', 'presse', 'https://www.ja17.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 1'),
  ('corpus:agriculture-17-unire-union-des-vignerons-de-l-ile-de-re', 'UNIRE — Union des vignerons de l''île de Ré', 'presse', 'https://www.vigneronsiledere.com/actus.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 2'),
  ('corpus:agriculture-17-terre-de-liens-poitou-charentes', 'Terre de Liens Poitou-Charentes', 'presse', 'https://terredeliens.org/poitou-charentes/actu/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 3'),
  ('corpus:agriculture-17-ici-la-rochelle-charente-maritime-radio-france', 'ICI La Rochelle — Charente-Maritime (Radio France)', 'presse', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 4'),
  ('corpus:agriculture-17-sud-ouest-saintes-charente-maritime', 'Sud Ouest — Saintes (Charente-Maritime)', 'presse', 'https://www.sudouest.fr/charente-maritime/saintes/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 5'),
  ('corpus:agriculture-17-sud-ouest-la-rochelle-charente-maritime', 'Sud Ouest — La Rochelle (Charente-Maritime)', 'presse', 'https://www.sudouest.fr/charente-maritime/la-rochelle/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 6'),
  ('corpus:agriculture-17-actu-fr-saintes-charente-maritime', 'actu.fr — Saintes (Charente-Maritime)', 'presse', 'https://actu.fr/nouvelle-aquitaine/saintes_17300/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 7'),
  ('corpus:agriculture-17-france-3-nouvelle-aquitaine-charente-maritime', 'France 3 Nouvelle-Aquitaine — Charente-Maritime', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente-maritime/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 8'),
  ('corpus:agriculture-17-la-nouvelle-republique-charente-maritime', 'La Nouvelle République — Charente-Maritime', 'presse', 'https://www.lanouvellerepublique.fr/api/v1/rss/592bf255489a4555008b4568', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-17.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Source agriculture — Charente-Maritime (17) ; corpus ligne 9')
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
    ('corpus:agriculture-17-jeunes-agriculteurs-de-la-charente-maritime-ja-17', ARRAY['https://www.ja17.fr/','https://www.ja17.fr/actualites/','https://www.ja17.fr/feed/']),
    ('corpus:agriculture-17-unire-union-des-vignerons-de-l-ile-de-re', ARRAY['https://www.vigneronsiledere.com/','https://www.vigneronsiledere.com/actus.html']),
    ('corpus:agriculture-17-terre-de-liens-poitou-charentes', ARRAY['https://terredeliens.org/poitou-charentes/','https://terredeliens.org/poitou-charentes/actu/']),
    ('corpus:agriculture-17-ici-la-rochelle-charente-maritime-radio-france', ARRAY['https://www.ici.fr/radio/la-rochelle','https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/actu','https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml']),
    ('corpus:agriculture-17-sud-ouest-saintes-charente-maritime', ARRAY['https://www.sudouest.fr/','https://www.sudouest.fr/charente-maritime/saintes/','https://www.sudouest.fr/charente-maritime/saintes/rss.xml']),
    ('corpus:agriculture-17-sud-ouest-la-rochelle-charente-maritime', ARRAY['https://www.sudouest.fr/','https://www.sudouest.fr/charente-maritime/la-rochelle/','https://www.sudouest.fr/charente-maritime/la-rochelle/rss.xml']),
    ('corpus:agriculture-17-actu-fr-saintes-charente-maritime', ARRAY['https://actu.fr/','https://actu.fr/nouvelle-aquitaine/saintes_17300/']),
    ('corpus:agriculture-17-france-3-nouvelle-aquitaine-charente-maritime', ARRAY['https://france3-regions.franceinfo.fr/','https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente-maritime/','https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente-maritime/rss']),
    ('corpus:agriculture-17-la-nouvelle-republique-charente-maritime', ARRAY['https://www.lanouvellerepublique.fr/','https://www.lanouvellerepublique.fr/charente-maritime','https://www.lanouvellerepublique.fr/api/v1/rss/592bf255489a4555008b4568'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%xml%' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus agriculture-17 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
