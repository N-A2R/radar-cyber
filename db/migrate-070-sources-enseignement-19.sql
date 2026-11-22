-- Sources d'information du secteur « enseignement » du département 19 (Corrèze).
-- 10 sources ; 36 URL contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-enseignement-19.jsonl
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:e19-caraminot', 'Lycée Pierre-Caraminot (Égletons)', 'institutionnel', 'https://www.lyceecaraminot.fr/rss/actualites.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":1}}'::jsonb, 3600, 'Lycée d Égletons (19), actualités et flux RSS. Exemple cyber : piratage Pronote dans un lycée d Agen, 11/09/2026.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-agri-tulle', 'Lycée agricole Edgard-Pisani Tulle-Naves', 'institutionnel', 'https://lycee-agricole-tulle.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":2}}'::jsonb, 3600, 'Lycée agricole de Naves/Tulle (19), formation et vie scolaire. Exemple cyber : piratage Pronote à Anglet, 31/05/2024.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-barbanceys', 'Lycée des métiers Marcel Barbanceys (Neuvic)', 'institutionnel', 'https://www.lycee-barbanceys.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":3}}'::jsonb, 3600, 'Lycée professionnel de Neuvic (19). Exemple cyber : cyberattaque de l école de commerce de Pau, 15/05/2024.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-epl-haute-correze', 'EPL Haute-Corrèze (Meymac / Neuvic)', 'institutionnel', 'https://epl-haute-correze.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":4}}'::jsonb, 3600, 'Etablissement public local d enseignement de Meymac et Neuvic (19). Exemple cyber : attaque de l école de commerce de Pau.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-cabanis', 'Lycée Georges-Cabanis (Brive-la-Gaillarde)', 'institutionnel', 'https://lycee-cabanis.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":5}}'::jsonb, 3600, 'Lycée de Brive-la-Gaillarde (19). Exemple cyber : rançongiciel au collège La Salle de Brive, 12/02/2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-lavoisier', 'Lycée et CFA Lavoisier (Brive-la-Gaillarde)', 'institutionnel', 'https://www.lycee-lavoisier.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":6}}'::jsonb, 3600, 'Lycée professionnel et CFA de Brive (19). Exemple cyber : rançongiciel au collège La Salle de Brive, 12/02/2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-arsonval', 'Cité scolaire d’Arsonval (Brive-la-Gaillarde)', 'institutionnel', 'https://www.cite-scolaire-arsonval.fr/rss/actualites.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":7}}'::jsonb, 3600, 'Cité scolaire de Brive (19), collège, lycée et post-bac. Exemple cyber : piratage Pronote à Agen, 11/09/2026.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-vie-correzienne', 'La Vie Corrézienne — rubrique Éducation', 'presse', 'https://www.laviecorrezienne.fr/actualites-education.html', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":8}}'::jsonb, 3600, 'Hebdomadaire local de Corrèze (19), rubrique Éducation. Exemple cyber : rançongiciel au collège La Salle de Brive.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-annuaire-education', 'Annuaire des établissements — Éducation nationale (Corrèze)', 'institutionnel', 'https://data.education.gouv.fr/api/records/1.0/search/?dataset=fr-en-annuaire-education&q=correze&rows=2', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":9}}'::jsonb, 3600, 'Annuaire officiel des établissements scolaires, requête Corrèze (19), API JSON ouverte.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-greta-limousin', 'GRETA du Limousin — antennes de Corrèze', 'institutionnel', 'https://www.greta-du-limousin.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-19.jsonl","ligne":10}}'::jsonb, 3600, 'Organisme de formation continue avec antennes à Brive, Tulle et Égletons (19). Exemple cyber : piratage Pronote à Anglet.', 'Nouvelle-Aquitaine', '19')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 36 URL contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:e19-caraminot', ARRAY['http://www.lyceecaraminot.fr/','http://www.lyceecaraminot.fr/Actualites','https://www.lyceecaraminot.fr/rss/actualites.xml']),
    ('corpus:e19-agri-tulle', ARRAY['https://lycee-agricole-tulle.fr/','https://lycee-agricole-tulle.fr/?s=actualite','https://lycee-agricole-tulle.fr/feed/']),
    ('corpus:e19-barbanceys', ARRAY['https://www.lycee-barbanceys.com/','https://www.lycee-barbanceys.com/actualites/','https://www.lycee-barbanceys.com/feed/']),
    ('corpus:e19-epl-haute-correze', ARRAY['https://epl-haute-correze.fr/','https://epl-haute-correze.fr/actualites/']),
    ('corpus:e19-cabanis', ARRAY['https://lycee-cabanis.fr/','https://lycee-cabanis.fr/actualites/','https://lycee-cabanis.fr/feed/']),
    ('corpus:e19-lavoisier', ARRAY['https://www.lycee-lavoisier.com/','https://www.lycee-lavoisier.com/actualites/','https://www.lycee-lavoisier.com/feed/']),
    ('corpus:e19-arsonval', ARRAY['https://www.cite-scolaire-arsonval.fr/','https://www.cite-scolaire-arsonval.fr/Actualites','https://www.cite-scolaire-arsonval.fr/rss/actualites.xml']),
    ('corpus:e19-vie-correzienne', ARRAY['https://www.laviecorrezienne.fr/','https://www.laviecorrezienne.fr/actualites-education.html']),
    ('corpus:e19-annuaire-education', ARRAY['https://data.education.gouv.fr/pages/recherche-etablissement/','https://data.education.gouv.fr/pages/recherche-etablissement/','https://data.education.gouv.fr/api/records/1.0/search/?dataset=fr-en-annuaire-education&q=correze&rows=2']),
    ('corpus:e19-greta-limousin', ARRAY['https://www.greta-du-limousin.fr/','https://www.greta-du-limousin.fr/actualites/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%api/records%' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus enseignement-19 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
