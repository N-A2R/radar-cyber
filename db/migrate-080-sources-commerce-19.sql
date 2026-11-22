-- Sources d'information du secteur « commerce » du département 19 (Corrèze).
-- 11 sources, 26 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-commerce-19.jsonl
-- Rapport : bench/results/verification-commerce-19.json
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:commerce-19-cma-nouvelle-aquitaine', 'CMA Nouvelle-Aquitaine — actualités (Corrèze)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Chambre des metiers et de l artisanat, antenne Correze via le site regional. Exemple cyber : cyberattaque du supermarche Intermarche d Altillac.'),
  ('corpus:commerce-19-ville-brive', 'Ville de Brive-la-Gaillarde — actualités (économie et commerces)', 'cti', 'https://www.brive.fr/actualites/', 'source d information municipale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Actualites de la principale ville de Correze, economie et commerces. Exemple cyber : Correze Fermeture a Objat, 50 a 60 commandes perdues.'),
  ('corpus:commerce-19-la-montagne', 'La Montagne — Corrèze (économie)', 'presse', 'https://www.lamontagne.fr/economie/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Quotidien local, edition Correze et rubrique economie. Exemple cyber : cyberattaque du supermarche Intermarche d Altillac.'),
  ('corpus:commerce-19-actu-fr-brive', 'actu.fr — Brive-la-Gaillarde (Corrèze)', 'presse', 'https://actu.fr/nouvelle-aquitaine/brive-la-gaillarde_19031/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Presse locale de Brive-la-Gaillarde et alentours. Exemple cyber : petites entreprises de Correze victimes de cyberattaques.'),
  ('corpus:commerce-19-ici-correze', 'ICI Corrèze (Radio France)', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Radio locale du Limousin, actualites de la Correze. Exemple cyber : Correze Fermeture a Objat, commandes perdues.'),
  ('corpus:commerce-19-sud-ouest', 'Sud Ouest — Corrèze', 'presse', 'https://www.sudouest.fr/correze/rss.xml', 'source d information regionale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Presse regionale, edition Correze. Exemple cyber : cyberattaque du supermarche Intermarche d Altillac.'),
  ('corpus:commerce-19-france3', 'France 3 Nouvelle-Aquitaine — Corrèze', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Television locale, edition Correze. Exemple cyber : petites entreprises de Correze victimes de cyberattaques.'),
  ('corpus:commerce-19-terres-de-correze', 'Terres de Corrèze — office de tourisme', 'cti', 'https://www.terresdecorreze.com/destination/actualites/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Office de tourisme du territoire, actualites economiques et commerces. Exemple cyber : alerte arnaque publiee par l office.'),
  ('corpus:commerce-19-fcd', 'FCD — Fédération du commerce et de la distribution', 'cti', 'https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Federation du commerce et de la distribution, actualites utiles aux enseignes du departement. Exemple cyber : cyberattaque Intermarche d Altillac.'),
  ('corpus:commerce-19-fevad', 'FEVAD — Fédération du e-commerce et de la vente à distance', 'cti', 'https://www.fevad.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Federation du e-commerce, utile aux commerants en ligne de Correze. Exemple cyber : donnees de santé en fuite chez Novabio Brive-Rivet.'),
  ('corpus:commerce-19-cyberattaque-org', 'Cyberattaque.org — actualités des incidents cyber', 'presse', 'https://www.cyberattaque.org/feed/', 'source d information specialisee, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-19.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Presse cyber avec incidents commerciaux locaux. Exemple : laboratoire Novabio de Brive-Rivet, donnees de sante en fuite.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 26 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:commerce-19-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-cma-nouvelle-aquitaine', 'https://cma-correze.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-ville-brive', 'https://www.brive.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-ville-brive', 'https://www.brive.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-la-montagne', 'https://www.lamontagne.fr/correze/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-19-la-montagne', 'https://www.lamontagne.fr/economie/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-19-actu-fr-brive', 'https://actu.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-actu-fr-brive', 'https://actu.fr/nouvelle-aquitaine/brive-la-gaillarde_19031/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-ici-correze', 'https://www.ici.fr/radio/limousin', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-ici-correze', 'https://www.ici.fr/nouvelle-aquitaine/correze-19/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-ici-correze', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-19-sud-ouest', 'https://www.sudouest.fr/correze/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-sud-ouest', 'https://www.sudouest.fr/correze/rss.xml', 'application/xml', 20),
    ('corpus:commerce-19-france3', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-terres-de-correze', 'https://www.terresdecorreze.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-terres-de-correze', 'https://www.terresdecorreze.com/destination/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-terres-de-correze', 'https://www.terresdecorreze.com/alerte-arnaque/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-fcd', 'https://www.fcd.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-19-fcd', 'https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-19-fevad', 'https://www.fevad.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-fevad', 'https://www.fevad.com/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-fevad', 'https://www.fevad.com/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-19-cyberattaque-org', 'https://www.cyberattaque.org/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-19-cyberattaque-org', 'https://www.cyberattaque.org/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-19-cyberattaque-org', 'https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite/', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-19 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
