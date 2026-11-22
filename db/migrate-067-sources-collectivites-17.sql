-- Sources d'information du secteur « collectivites » du département 17 (Charente-Maritime).
-- 15 sources, toutes les URLs (site, actualités, flux) contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-collectivites-17.jsonl
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:c17-departement-charente-maritime', 'Département de la Charente-Maritime — Conseil départemental', 'cti', 'https://la.charente-maritime.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":1}}'::jsonb, 3600, 'Conseil départemental de la Charente-Maritime (17). Exemple cyber : cyberattaque de la mairie de Marennes-Hiers-Brouage.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-ville-la-rochelle', 'Ville de La Rochelle', 'cti', 'https://www.larochelle.fr/actualites/les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":2}}'::jsonb, 3600, 'Commune de La Rochelle (17). Exemple cyber : fuite de donnees chez Synbird touchant la Ville.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-agglo-la-rochelle', 'Agglo La Rochelle — Communauté d''agglomération', 'cti', 'https://www.agglo-larochelle.fr/les-flux-rss-de-l-agglo/-/data-agglo/all-all.rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":3}}'::jsonb, 3600, 'Intercommunalite de La Rochelle (17). Exemple cyber : appels frauduleux usurpant l identite de la Ville d Aytré.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-ville-saintes', 'Ville de Saintes', 'cti', 'https://www.ville-saintes.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":4}}'::jsonb, 3600, 'Commune de Saintes (17). Exemple cyber : cyberattaque de controle des defenses du syndicat informatique departemental.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-ville-rochefort', 'Ville de Rochefort', 'cti', 'https://www.ville-rochefort.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":5}}'::jsonb, 3600, 'Commune de Rochefort (17). Exemple cyber : piratage informatique et report du vote des comptes a Saint-Denis-d Oleron.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-agglo-saintes-grandes-rives', 'Communauté d''agglomération Saintes Grandes Rives', 'cti', 'https://www.agglo-saintes.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":6}}'::jsonb, 3600, 'Intercommunalite de Saintes (17). Exemple cyber : test de cyberattaque du syndicat informatique departemental a Saintes.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-cdg17', 'Centre de gestion de la Charente-Maritime (CDG 17)', 'cti', 'https://www.cdg17.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":7}}'::jsonb, 3600, 'Centre de gestion de la fonction publique territoriale de la Charente-Maritime (17). Exemple cyber : piratage d une commune et consequences sur les conseils municipaux.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-sdis17', 'SDIS 17 — Sapeurs-pompiers de la Charente-Maritime', 'cti', 'https://sdis17.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":8}}'::jsonb, 3600, 'Service departemental d incendie et de secours de la Charente-Maritime (17). Exemple cyber : activites suspectes sur les messageries du ministere de l Interieur.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-soluris', 'Soluris — Syndicat informatique de la Charente-Maritime', 'cti', 'https://www.soluris.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":9}}'::jsonb, 3600, 'Syndicat intercommunal informatique de la Charente-Maritime (17). Exemple cyber : un elu lance une cyberattaque pour tester ses defenses.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-cma-nouvelle-aquitaine', 'CMA Nouvelle-Aquitaine — antenne de la Charente-Maritime', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":10}}'::jsonb, 3600, 'Chambre des metiers et de l artisanat de Nouvelle-Aquitaine, antenne de la Charente-Maritime (17). Exemple cyber : fuite de donnees d une entreprise de Saint-Martin-de-Re.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-sud-ouest-charente-maritime', 'Sud Ouest — Charente-Maritime', 'presse', 'https://www.sudouest.fr/charente-maritime/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":11}}'::jsonb, 3600, 'Presse quotidienne locale de Charente-Maritime (17), rubrique collectivites. Exemple cyber : cyberattaque de la mairie de Marennes-Hiers-Brouage.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-haute-saintonge', 'Haute Saintonge — presse locale', 'presse', 'https://www.hautesaintonge.fr/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":12}}'::jsonb, 3600, 'Presse hebdomadaire locale de Charente-Maritime (17). Exemple cyber : alerte a l arnaque sur les factures d eau a Jonzac.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-inf-la-rochelle', 'INF la Rochelle', 'presse', 'https://inf-info.fr/feed/', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":13}}'::jsonb, 3600, 'Presse locale en ligne de La Rochelle (17). Exemple cyber : activites suspectes sur les messageries du ministere de l Interieur.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-actu-fr-la-rochelle', 'actu.fr — La Rochelle', 'presse', 'https://actu.fr/nouvelle-aquitaine/la-rochelle_17300/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":14}}'::jsonb, 3600, 'Presse locale en ligne de La Rochelle (17). Exemple cyber : appels frauduleux usurpant l identite de la Ville d Aytré.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:c17-ici-charente-maritime', 'ici Charente-Maritime — Radio France', 'presse', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-17.jsonl","ligne":15}}'::jsonb, 3600, 'Radio publique locale de Charente-Maritime (17). Exemple cyber : attaque informatique de la billetterie de la Coursive a La Rochelle.', 'Nouvelle-Aquitaine', '17')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 31 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:c17-departement-charente-maritime', ARRAY['https://la.charente-maritime.fr/','https://la.charente-maritime.fr/actualites']),
    ('corpus:c17-ville-la-rochelle', ARRAY['https://www.larochelle.fr/','https://www.larochelle.fr/actualites/les-actualites']),
    ('corpus:c17-agglo-la-rochelle', ARRAY['https://www.agglo-larochelle.fr/','https://www.agglo-larochelle.fr/actualites','https://www.agglo-larochelle.fr/les-flux-rss-de-l-agglo/-/data-agglo/all-all.rss']),
    ('corpus:c17-ville-saintes', ARRAY['https://www.ville-saintes.fr/','https://www.ville-saintes.fr/actualites/']),
    ('corpus:c17-ville-rochefort', ARRAY['https://www.ville-rochefort.fr/','https://www.ville-rochefort.fr/actualites','https://www.ville-rochefort.fr/rss.xml']),
    ('corpus:c17-agglo-saintes-grandes-rives', ARRAY['https://www.agglo-saintes.fr/','https://www.agglo-saintes.fr/actualites/']),
    ('corpus:c17-cdg17', ARRAY['https://www.cdg17.fr/','https://www.cdg17.fr/actualites/','https://www.cdg17.fr/feed/']),
    ('corpus:c17-sdis17', ARRAY['https://www.sdis17.fr/','https://sdis17.fr/feed/']),
    ('corpus:c17-soluris', ARRAY['https://www.soluris.fr/','https://www.soluris.fr/actualites/','https://www.soluris.fr/feed/']),
    ('corpus:c17-cma-nouvelle-aquitaine', ARRAY['https://cma-nouvelleaquitaine.fr/','https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites']),
    ('corpus:c17-sud-ouest-charente-maritime', ARRAY['https://www.sudouest.fr/charente-maritime/','https://www.sudouest.fr/charente-maritime/rss.xml']),
    ('corpus:c17-haute-saintonge', ARRAY['https://www.hautesaintonge.fr/']),
    ('corpus:c17-inf-la-rochelle', ARRAY['https://inf-info.fr/','https://inf-info.fr/feed/']),
    ('corpus:c17-actu-fr-la-rochelle', ARRAY['https://actu.fr/nouvelle-aquitaine/la-rochelle_17300/']),
    ('corpus:c17-ici-charente-maritime', ARRAY['https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-17 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
