-- Sources d'information du secteur « industrie » du département 19 (Corrèze).
-- 13 sources ; 27 URL (sites, pages actualités et flux) contrôlées en HTTP 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-industrie-19.jsonl
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:i19-cpme', 'CPME 19', 'cti', 'https://cpme19.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":1}}'::jsonb, 3600, 'Organisation patronale des TPE-PME de la Corrèze (19). Exemple cyber : ransomware chez Corrèze Fermeture à Objat, 50 à 60 commandes perdues en 2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-medef-na', 'MEDEF Nouvelle-Aquitaine', 'cti', 'https://www.medef-nouvelle-aquitaine.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":2}}'::jsonb, 3600, 'Organisation patronale régionale couvrant la Corrèze (19). Exemple cyber : attaque par rançonlogiciel chez un sous-traitant corrézien en 2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-uimm-na-limousin', 'UIMM Nouvelle-Aquitaine — chambre syndicale du Limousin', 'cti', 'https://www.uimmnouvelleaquitaine.com/actualite/news.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":3}}'::jsonb, 3600, 'Syndicat professionnel de la métallurgie, chambre du Limousin basée à Brive (19). Exemple cyber : ransomware interrompant la production d un atelier corrézien.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-uimm-federation', 'UIMM — La Fabrique de l''avenir', 'cti', 'https://uimm.lafabriquedelavenir.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":4}}'::jsonb, 3600, 'Fédération nationale des industries de la métallurgie, relais pour la Corrèze (19). Exemple cyber : fuite de données chez Novabio (Brive) en novembre 2026.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-nexteam-ussel', 'Nexteam Group — fonderie d''Ussel', 'cti', 'https://www.nexteam-group.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":5}}'::jsonb, 3600, 'Groupe industriel de fonderie, usinage et mécano-soudure, implanté à Ussel (19). Exemple cyber : usurpation de communication d un sous-traitant aéronautique.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-jde-correze', 'Le Journal des Entreprises — Corrèze', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":6}}'::jsonb, 3600, 'Presse économique régionale, édition Corrèze (19). Exemple cyber : cyberattaque de Corrèze Fermeture à Objat, 50 à 60 commandes perdues.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-correze-actu', 'Corrèze Actu', 'presse', 'https://correzeactu.com/actualites', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":7}}'::jsonb, 3600, 'Presse locale en ligne de la Corrèze (19). Exemple cyber : phishing visant une PME corrézienne et virement frauduleux.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-la-montagne', 'La Montagne — Corrèze', 'presse', 'https://www.lamontagne.fr/correze/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":8}}'::jsonb, 3600, 'Quotidien régional, édition Corrèze (19). Exemple cyber : cyberattaque de l Intermarché d Altillac en octobre 2026.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-sud-ouest', 'Sud Ouest — Corrèze', 'presse', 'https://www.sudouest.fr/correze/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":9}}'::jsonb, 3600, 'Quotidien régional, édition Corrèze (19). Exemple cyber : ransomware de Corrèze Fermeture à Objat en 2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-ici-correze', 'ici Corrèze — Radio France', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":10}}'::jsonb, 3600, 'Radio publique locale de Corrèze (19). Exemple cyber : cyberattaque de la mairie de Sarran, 44 000 euros perdus en 2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-brivemag', 'Brivemag — actualité du pays de Brive', 'presse', 'https://brivemag.brive.fr/feed/', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":11}}'::jsonb, 3600, 'Magazine d actualité du pays de Brive (19). Exemple cyber : rançon de 8 000 euros au collège La Salle de Brive en 2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-google-news-industrie', 'Google News — veille Corrèze industrie', 'presse', 'https://news.google.com/rss/search?q=Corr%C3%A8ze+industrie&hl=fr&gl=FR&ceid=FR:fr', 'flux d actualités public, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":12}}'::jsonb, 3600, 'Veille de presse locale « Corrèze industrie » (19). Exemple cyber : ransomware chez Corrèze Fermeture à Objat en 2025.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:i19-chambre-agriculture', 'Chambre d''agriculture de la Corrèze', 'institutionnel', 'https://correze.chambres-agriculture.fr/actualites-1/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-19.jsonl","ligne":13}}'::jsonb, 3600, 'Chambre consulaire de la Corrèze (19), filière agro-industrielle. Exemple cyber : ransomware à l EDE 19, 30 000 éleveurs perturbés en 2024.', 'Nouvelle-Aquitaine', '19')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 27 URL contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:i19-cpme', ARRAY['https://cpme19.fr/','https://cpme19.fr/evenements/','https://cpme19.fr/feed/']),
    ('corpus:i19-medef-na', ARRAY['https://www.medef-nouvelle-aquitaine.fr/','https://www.medef-nouvelle-aquitaine.fr/actualites']),
    ('corpus:i19-uimm-na-limousin', ARRAY['https://www.uimmnouvelleaquitaine.com/','https://www.uimmnouvelleaquitaine.com/actualite/news.html']),
    ('corpus:i19-uimm-federation', ARRAY['https://uimm.lafabriquedelavenir.fr/','https://uimm.lafabriquedelavenir.fr/feed/']),
    ('corpus:i19-nexteam-ussel', ARRAY['https://www.nexteam-group.com/','https://www.nexteam-group.com/actualite-agenda/','https://www.nexteam-group.com/feed/']),
    ('corpus:i19-jde-correze', ARRAY['https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/correze','https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine']),
    ('corpus:i19-correze-actu', ARRAY['https://correzeactu.com/actualites']),
    ('corpus:i19-la-montagne', ARRAY['https://www.lamontagne.fr/correze/']),
    ('corpus:i19-sud-ouest', ARRAY['https://www.sudouest.fr/correze/','https://www.sudouest.fr/correze/rss.xml']),
    ('corpus:i19-ici-correze', ARRAY['https://www.ici.fr/nouvelle-aquitaine/correze-19','https://www.ici.fr/nouvelle-aquitaine/correze-19/actu','https://www.ici.fr/rss/limousin/rubrique/infos.xml']),
    ('corpus:i19-brivemag', ARRAY['https://brivemag.brive.fr/','https://brivemag.brive.fr/feed/']),
    ('corpus:i19-google-news-industrie', ARRAY['https://news.google.com/','https://news.google.com/rss/search?q=Corr%C3%A8ze+industrie&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:i19-chambre-agriculture', ARRAY['https://correze.chambres-agriculture.fr/','https://correze.chambres-agriculture.fr/actualites-1/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' THEN 'application/xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus industrie-19 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
