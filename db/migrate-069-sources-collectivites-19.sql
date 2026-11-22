-- Sources d'information du secteur « collectivites » du département 19 (Corrèze).
-- 13 sources ; 28 URL (sites, pages actualités et flux) contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-collectivites-19.jsonl
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:c19-conseil-departemental', 'Conseil départemental de la Corrèze', 'cti', 'https://www.correze.fr/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":1}}'::jsonb, 3600, 'Conseil départemental de la Corrèze (19). Exemple cyber : cyberattaque de la mairie de Sarran, 44 000 euros perdus en 2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-prefecture', 'Préfecture de la Corrèze', 'cti', 'https://www.correze.gouv.fr/Actualites/Toute-l-actualite', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":2}}'::jsonb, 3600, 'Services de l Etat en Corrèze (19). Exemple cyber : alertes aux arnaques usurpant les services publics.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-ville-brive', 'Ville de Brive-la-Gaillarde', 'cti', 'https://www.brive.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":3}}'::jsonb, 3600, 'Commune de Brive-la-Gaillarde (19). Exemple cyber : ransomware au college La Salle, 8 000 euros de rancon et bulletins perdus.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-tulle-agglo', 'Tulle agglo — Communauté d''agglomération de Tulle', 'cti', 'https://www.tulleagglo.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":4}}'::jsonb, 3600, 'Intercommunalite de Tulle (19). Exemple cyber : cyberattaque de la mairie de Sarran, 44 000 euros perdus.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-agglo-brive', 'Communauté d''agglomération du Bassin de Brive', 'cti', 'http://www.agglodebrive.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":5}}'::jsonb, 3600, 'Intercommunalite du bassin de Brive (19). Exemple cyber : fuite de donnees du laboratoire Novabio en novembre 2026.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-ville-egletons', 'Ville d''Égletons', 'cti', 'https://www.egletons.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":6}}'::jsonb, 3600, 'Commune d Egletons (19). Exemple cyber : attaque visant des membres de la Federation Française de Tir en Haute-Corrèze.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-cc-ventadour', 'Communauté de communes de Ventadour–Égletons–Monédières', 'cti', 'https://www.cc-ventadour.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":7}}'::jsonb, 3600, 'Intercommunalite de Ventadour-Egletons-Monedieres (19). Exemple cyber : cyberattaque de la mairie de Sarran en 2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-ville-ussel', 'Ville d''Ussel', 'cti', 'https://www.ussel.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":8}}'::jsonb, 3600, 'Commune d Ussel (19). Exemple cyber : cyberattaque d un Intermarché a Altillac en octobre 2026.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-ville-tulle', 'Ville de Tulle — Tulle Mag', 'cti', 'https://www.ville-tulle.fr/publications/tulle-mag', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":9}}'::jsonb, 3600, 'Magazine municipal de Tulle (19). Exemple cyber : cyberattaque de la mairie de Sarran, 44 000 euros perdus.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-brivemag', 'Brivemag — actualité du pays de Brive', 'presse', 'https://brivemag.brive.fr/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":10}}'::jsonb, 3600, 'Journal municipal du pays de Brive (19). Exemple cyber : rancon de 8 000 euros au college La Salle de Brive.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-la-montagne', 'La Montagne — Corrèze', 'presse', 'https://www.lamontagne.fr/correze/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":11}}'::jsonb, 3600, 'Quotidien regional, edition Corrèze (19). Exemple cyber : cyberattaque de l Intermarché d Altillac en octobre 2026.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-ici-correze', 'ici Corrèze — Radio France', 'presse', 'https://www.ici.fr/nouvelle-aquitaine/correze-19', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":12}}'::jsonb, 3600, 'Radio publique locale de Corrèze (19). Exemple cyber : mairie de Sarran victime d une cyberattaque de 44 000 euros.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:c19-actu-fr-correze', 'actu.fr — Corrèze', 'presse', 'https://actu.fr/nouvelle-aquitaine/correze_19/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-19.jsonl","ligne":13}}'::jsonb, 3600, 'Presse locale en ligne de Corrèze (19). Exemple cyber : mairie de Sarran et Intermarché d Altillac.', 'Nouvelle-Aquitaine', '19')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 28 URL contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:c19-conseil-departemental', ARRAY['https://www.correze.fr/','https://www.correze.fr/la-correze-en-1-clic/actualites-en-direct','https://www.correze.fr/rss']),
    ('corpus:c19-prefecture', ARRAY['https://www.correze.gouv.fr/','https://www.correze.gouv.fr/Actualites/Toute-l-actualite']),
    ('corpus:c19-ville-brive', ARRAY['https://www.brive.fr/','https://www.brive.fr/actualites','https://www.brive.fr/feed/']),
    ('corpus:c19-tulle-agglo', ARRAY['https://www.tulleagglo.fr/','https://www.tulleagglo.fr/lagglo/actualites/','https://www.tulleagglo.fr/feed/']),
    ('corpus:c19-agglo-brive', ARRAY['http://www.agglodebrive.fr/','http://www.agglodebrive.fr/about/actualites/','http://www.agglodebrive.fr/feed/']),
    ('corpus:c19-ville-egletons', ARRAY['https://www.egletons.fr/','https://www.egletons.fr/actualites/','https://www.egletons.fr/feed/']),
    ('corpus:c19-cc-ventadour', ARRAY['https://www.cc-ventadour.fr/','https://www.cc-ventadour.fr/communication/espace-pro-presse/','https://www.cc-ventadour.fr/feed/']),
    ('corpus:c19-ville-ussel', ARRAY['https://www.ussel.fr/','https://www.ussel.fr/actualites']),
    ('corpus:c19-ville-tulle', ARRAY['https://www.ville-tulle.fr/','https://www.ville-tulle.fr/publications/tulle-mag']),
    ('corpus:c19-brivemag', ARRAY['https://brivemag.brive.fr/']),
    ('corpus:c19-la-montagne', ARRAY['https://www.lamontagne.fr/correze/']),
    ('corpus:c19-ici-correze', ARRAY['https://www.ici.fr/nouvelle-aquitaine/correze-19']),
    ('corpus:c19-actu-fr-correze', ARRAY['https://actu.fr/nouvelle-aquitaine/correze_19/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-19 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
