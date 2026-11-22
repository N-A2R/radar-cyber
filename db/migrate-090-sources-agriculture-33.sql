-- Sources d'information du secteur « agriculture » du département 33 (Gironde).
-- 7 sources, 18 URLs contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-agriculture-33.jsonl
-- Rapport : bench/results/verification-agriculture-33.json
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:agriculture-33-chambre-d-agriculture-de-la-gironde', 'Chambre d''agriculture de la Gironde', 'presse', 'https://gironde.chambres-agriculture.fr/actualites-33', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-33.jsonl","ligne":1,"type":"chambre","secteur":"agriculture","departement":"33","exemple_cyber":"Alerte sur une tentative de fraude — https://gironde.chambres-agriculture.fr/actualites-33/detail-de-lactualite/alerte-sur-une-tentative-de-fraude-1-1 (12/05/2025)"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Source agriculture — Gironde (33) ; corpus ligne 1'),
  ('corpus:agriculture-33-jeunes-agriculteurs-de-la-gironde-ja-33', 'Jeunes Agriculteurs de la Gironde (JA 33)', 'presse', 'https://ja33.fr/?feed=rss2', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-33.jsonl","ligne":2,"type":"syndicat agricole","secteur":"agriculture","departement":"33"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Source agriculture — Gironde (33) ; corpus ligne 2'),
  ('corpus:agriculture-33-confederation-paysanne-gironde-33', 'Confédération paysanne — Gironde (33)', 'presse', 'https://gironde.confederationpaysanne.fr/sites/34/rss/rss_communiques_de_presse.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-33.jsonl","ligne":3,"type":"syndicat agricole","secteur":"agriculture","departement":"33"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Source agriculture — Gironde (33) ; corpus ligne 3'),
  ('corpus:agriculture-33-vins-de-bordeaux-interprofession-civb', 'Vins de Bordeaux — Interprofession (CIVB)', 'presse', 'https://www.bordeaux.com/fr/mag/blog/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-33.jsonl","ligne":4,"type":"interprofession","secteur":"agriculture","departement":"33"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Source agriculture — Gironde (33) ; corpus ligne 4'),
  ('corpus:agriculture-33-ici-gironde-radio-france', 'ICI Gironde — Radio France', 'presse', 'https://www.ici.fr/rss/gironde/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-33.jsonl","ligne":5,"type":"presse locale","secteur":"agriculture","departement":"33"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Source agriculture — Gironde (33) ; corpus ligne 5'),
  ('corpus:agriculture-33-france-3-nouvelle-aquitaine-gironde', 'France 3 Nouvelle-Aquitaine — Gironde', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-33.jsonl","ligne":6,"type":"presse locale","secteur":"agriculture","departement":"33"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Source agriculture — Gironde (33) ; corpus ligne 6'),
  ('corpus:agriculture-33-actu-fr-bordeaux-gironde', 'actu.fr — Bordeaux (Gironde)', 'presse', 'https://actu.fr/nouvelle-aquitaine/bordeaux_33000/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-33.jsonl","ligne":7,"type":"presse locale","secteur":"agriculture","departement":"33"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Source agriculture — Gironde (33) ; corpus ligne 7')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 18 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:agriculture-33-chambre-d-agriculture-de-la-gironde', ARRAY['https://gironde.chambres-agriculture.fr/','https://gironde.chambres-agriculture.fr/actualites-33','https://gironde.chambres-agriculture.fr/actualites-33/detail-de-lactualite/alerte-sur-une-tentative-de-fraude-1-1']),
    ('corpus:agriculture-33-jeunes-agriculteurs-de-la-gironde-ja-33', ARRAY['https://ja33.fr/','https://ja33.fr/?page_id=9','https://ja33.fr/?feed=rss2']),
    ('corpus:agriculture-33-confederation-paysanne-gironde-33', ARRAY['https://gironde.confederationpaysanne.fr/','https://gironde.confederationpaysanne.fr/recherche.php?type=A&rech=0&raz=1','https://gironde.confederationpaysanne.fr/sites/34/rss/rss_communiques_de_presse.xml']),
    ('corpus:agriculture-33-vins-de-bordeaux-interprofession-civb', ARRAY['https://www.bordeaux.com/fr/','https://www.bordeaux.com/fr/mag/blog/']),
    ('corpus:agriculture-33-ici-gironde-radio-france', ARRAY['https://www.ici.fr/radio/gironde','https://www.ici.fr/nouvelle-aquitaine/gironde-33/actu','https://www.ici.fr/rss/gironde/rubrique/infos.xml']),
    ('corpus:agriculture-33-france-3-nouvelle-aquitaine-gironde', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/','https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss']),
    ('corpus:agriculture-33-actu-fr-bordeaux-gironde', ARRAY['https://actu.fr/','https://actu.fr/nouvelle-aquitaine/bordeaux_33000/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%xml%' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus agriculture-33 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
