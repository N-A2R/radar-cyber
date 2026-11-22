-- Sources d'information du secteur « commerce » du département 17 (Charente-Maritime).
-- 11 sources, 26 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-commerce-17.jsonl
-- Rapport : bench/results/verification-commerce-17.json
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:commerce-17-cma-nouvelle-aquitaine', 'CMA Nouvelle-Aquitaine — actualités (Charente-Maritime)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Chambre consulaire des metiers et commerces, filtre Charente-Maritime. Exemple cyber : cyberattaque du magasin E.Leclerc de Surgeres.'),
  ('corpus:commerce-17-ville-la-rochelle-commerces', 'Ville de La Rochelle — service commerces', 'cti', 'https://www.larochelle.fr/vie-quotidienne/professionnels/commerces', 'source d information municipale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Annuaire et actualites des commerces de La Rochelle (17). Exemple cyber : attaque de la billetterie du theatre de la Coursive.'),
  ('corpus:commerce-17-sud-ouest-charente-maritime', 'Sud Ouest — Charente-Maritime', 'presse', 'https://www.sudouest.fr/charente-maritime/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Presse quotidienne locale, economy et commerces de Charente-Maritime. Exemple cyber : cyberattaque du magasin E.Leclerc de Surgeres.'),
  ('corpus:commerce-17-sud-ouest-la-rochelle-economie', 'Sud Ouest — La Rochelle, rubrique économie', 'presse', 'https://www.sudouest.fr/charente-maritime/la-rochelle/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Rubrique economie de l edition de La Rochelle. Exemple cyber : attaque de la billetterie du theatre de la Coursive.'),
  ('corpus:commerce-17-actu-fr-saintes', 'actu.fr — Saintes (Charente-Maritime)', 'presse', 'https://actu.fr/nouvelle-aquitaine/saintes_17300/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Presse locale de Saintes et surroundings. Exemple cyber : cyberattaque du magasin E.Leclerc de Surgeres, rapportee par actu.fr.'),
  ('corpus:commerce-17-ici-la-rochelle', 'ICI La Rochelle — Charente-Maritime (Radio France)', 'presse', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Radio locale de La Rochelle, actualites economiques et commerciales. Exemple cyber : attaque de la billetterie du theatre de la Coursive.'),
  ('corpus:commerce-17-la-nouvelle-republique', 'La Nouvelle République — Charente-Maritime', 'presse', 'https://www.lanouvellerepublique.fr/api/v1/rss/592bf255489a4555008b4568', 'source d information regionale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Presse regionale, edition Charente-Maritime. Exemple cyber : cyberattaque du magasin E.Leclerc de Surgeres.'),
  ('corpus:commerce-17-fcd', 'FCD — Fédération du commerce et de la distribution', 'cti', 'https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Federation du commerce et de la distribution, actualites utiles aux enseignes du departement. Exemple cyber : cyberattaque E.Leclerc de Surgeres.'),
  ('corpus:commerce-17-fevad', 'FEVAD — Fédération du e-commerce et de la vente à distance', 'cti', 'https://www.fevad.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Federation du e-commerce, utile aux commerants en ligne de Charente-Maritime. Exemple cyber : fuite de 21 352 commandes chez Incognito.fr (Saint-Martin-de-Re).'),
  ('corpus:commerce-17-cyberattaque-org', 'Cyberattaque.org — actualités des incidents cyber', 'presse', 'https://www.cyberattaque.org/feed/', 'source d information specialisee, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Presse cyber avec incidents commerciaux locaux. Exemple : laboratoire Incognito.fr de Saint-Martin-de-Re, 21 352 commandes en fuite.'),
  ('corpus:commerce-17-rochefort-ocean-commerces', 'Rochefort Océan — actualités économie et commerces', 'cti', 'https://www.rochefort-ocean.com/actualites/economie', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-17.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '17', 'Office de tourisme de Rochefort Ocean, actualites economiques et commerces. Exemple cyber : cyberattaque du magasin E.Leclerc de Surgeres.')
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
    ('corpus:commerce-17-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-ville-la-rochelle-commerces', 'https://www.larochelle.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-17-ville-la-rochelle-commerces', 'https://www.larochelle.fr/vie-quotidienne/professionnels/commerces', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-17-sud-ouest-charente-maritime', 'https://www.sudouest.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-sud-ouest-charente-maritime', 'https://www.sudouest.fr/charente-maritime/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-sud-ouest-charente-maritime', 'https://www.sudouest.fr/charente-maritime/rss.xml', 'application/xml', 20),
    ('corpus:commerce-17-sud-ouest-la-rochelle-economie', 'https://www.sudouest.fr/charente-maritime/la-rochelle/economie/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-sud-ouest-la-rochelle-economie', 'https://www.sudouest.fr/charente-maritime/la-rochelle/rss.xml', 'application/xml', 20),
    ('corpus:commerce-17-actu-fr-saintes', 'https://actu.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-actu-fr-saintes', 'https://actu.fr/nouvelle-aquitaine/saintes_17300/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-ici-la-rochelle', 'https://www.ici.fr/radio/la-rochelle', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-ici-la-rochelle', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-ici-la-rochelle', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-17-la-nouvelle-republique', 'https://www.lanouvellerepublique.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-17-la-nouvelle-republique', 'https://www.lanouvellerepublique.fr/charente-maritime', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-17-la-nouvelle-republique', 'https://www.lanouvellerepublique.fr/api/v1/rss/592bf255489a4555008b4568', 'application/rss+xml; charset=UTF-8', 20),
    ('corpus:commerce-17-fcd', 'https://www.fcd.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-17-fcd', 'https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-17-fevad', 'https://www.fevad.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-fevad', 'https://www.fevad.com/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-fevad', 'https://www.fevad.com/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-17-cyberattaque-org', 'https://www.cyberattaque.org/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-17-cyberattaque-org', 'https://www.cyberattaque.org/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-17-rochefort-ocean-commerces', 'https://www.rochefort-ocean.com/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-17-rochefort-ocean-commerces', 'https://www.rochefort-ocean.com/actualites/economie', 'text/html; charset=utf-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-17 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
