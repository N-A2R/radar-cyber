-- Sources d'information du secteur « commerce » du département 87 (Haute-Vienne).
-- 11 sources, 27 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-commerce-87.jsonl
-- Rapport : bench/results/verification-commerce-87.json
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:commerce-87-cma-haute-vienne', 'CMA Nouvelle-Aquitaine — antenne Haute-Vienne (artisanat et commerces)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Chambre des metiers et de l artisanat, antenne Haute-Vienne via le site regional. Exemple cyber : fuite de profils chez Climb Up Limoges.'),
  ('corpus:commerce-87-cpme-87', 'CPME 87 — Les Entrepreneurs de la Haute-Vienne', 'cti', 'https://www.cpme87.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Federation departementale des PME, TPE et commerces de la Haute-Vienne. Exemple cyber : rancons payees par les PME et TPE du departement.'),
  ('corpus:commerce-87-limoges-metropole', 'Limoges Métropole — actualités (économie et commerces)', 'cti', 'https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'source d information institutionnelle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Agglomeration de Limoges, actualites economiques et commerces, flux RSS de 73 items. Exemple cyber : PME et TPE victimes de cyberattaques.'),
  ('corpus:commerce-87-le-populaire', 'Le Populaire du Centre — Haute-Vienne (économie)', 'presse', 'https://www.lepopulaire.fr/economie/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Quotidien local, edition Haute-Vienne et rubrique economie. Exemple cyber : fuite de profils chez Climb Up Limoges.'),
  ('corpus:commerce-87-ici-limousin', 'ICI Limousin (Radio France) — Haute-Vienne', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Radio locale du Limousin, actualites de la Haute-Vienne. Exemple cyber : cyberattaque du service d identification des bovins et ovins.'),
  ('corpus:commerce-87-sud-ouest', 'Sud Ouest — Haute-Vienne', 'presse', 'https://www.sudouest.fr/haute-vienne/rss.xml', 'source d information regionale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Presse regionale, edition Haute-Vienne. Exemple cyber : fuite de profils chez Climb Up Limoges.'),
  ('corpus:commerce-87-france3', 'France 3 Nouvelle-Aquitaine — Haute-Vienne', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Television locale, edition Haute-Vienne. Exemple cyber : cyberattaque du service d identification des bovins et ovins.'),
  ('corpus:commerce-87-actu-fr', 'actu.fr — Limoges (Haute-Vienne)', 'presse', 'https://actu.fr/nouvelle-aquitaine/limoges_87085/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Presse locale de Limoges et de la Haute-Vienne. Exemple cyber : rancons payees par les PME et TPE du departement.'),
  ('corpus:commerce-87-fcd', 'FCD — Fédération du commerce et de la distribution', 'cti', 'https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Federation du commerce et de la distribution, actualites utiles aux enseignes de la Haute-Vienne. Exemple cyber : fuite de profils chez Climb Up Limoges.'),
  ('corpus:commerce-87-fevad', 'FEVAD — Fédération du e-commerce et de la vente à distance', 'cti', 'https://www.fevad.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Federation du e-commerce, utile aux commerants en ligne de la Haute-Vienne. Exemple cyber : rancons payees par les PME et TPE.'),
  ('corpus:commerce-87-cyberattaque-org', 'Cyberattaque.org — incidents cyber (Limousin)', 'presse', 'https://www.cyberattaque.org/feed/', 'source d information specialisee, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-87.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Presse cyber avec incidents commerciaux locaux. Exemple : Climb Up Limoges, 151 000 profils en vente sur le darkweb.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 27 URLs (sites, pages actualités, flux et articles cyber) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:commerce-87-cma-haute-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-haute-vienne', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-cma-haute-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-cpme-87', 'https://www.cpme87.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-cpme-87', 'https://www.cpme87.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-limoges-metropole', 'https://www.limoges-metropole.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-87-limoges-metropole', 'https://www.limoges-metropole.fr/informations-transversales/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-87-limoges-metropole', 'https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'text/xml;charset=utf-8', 73),
    ('corpus:commerce-87-le-populaire', 'https://www.lepopulaire.fr/haute-vienne/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-87-le-populaire', 'https://www.lepopulaire.fr/economie/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-87-ici-limousin', 'https://www.ici.fr/radio/limousin', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-ici-limousin', 'https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-ici-limousin', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-87-sud-ouest', 'https://www.sudouest.fr/haute-vienne/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-sud-ouest', 'https://www.sudouest.fr/haute-vienne/rss.xml', 'application/xml', 20),
    ('corpus:commerce-87-france3', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-actu-fr', 'https://actu.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-actu-fr', 'https://actu.fr/nouvelle-aquitaine/limoges_87085/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-fcd', 'https://www.fcd.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-87-fcd', 'https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-87-fevad', 'https://www.fevad.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-fevad', 'https://www.fevad.com/actualite/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-fevad', 'https://www.fevad.com/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-87-cyberattaque-org', 'https://www.cyberattaque.org/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-cyberattaque-org', 'https://www.cyberattaque.org/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-87-cyberattaque-org', 'https://www.cyberattaque.org/climb-up-pres-de-151-000-profils-en-vente-sur-le-darkweb-apres-une-cyberattaque/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-cpme-87', 'https://www.limogesinfos87.fr/actualite-22011-lutter-contre-le-fleau-des-cyberattaques.html', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-87-ici-limousin', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/le-service-d-identification-des-bovins-et-ovins-victime-d-une-cyberattaque-le-travail-des-eleveurs-limousins-perturbe-3084484.html', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-87 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
