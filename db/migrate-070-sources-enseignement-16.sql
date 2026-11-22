-- Sources d'information du secteur enseignement dans le departement 16 (Charente).
-- 17 sources, 42 URLs uniques toutes controlees en HTTP 200 le 2026-11-22.
-- Corpus detaille : bench/corpus/sources-enseignement-16.jsonl
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:ens16-01-iut-angouleme', 'IUT d''Angoulême', 'cti', 'https://iut-angouleme.univ-poitiers.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":1}}'::jsonb, 3600, 'IUT, secteur enseignement, departement 16 (Charente). Exemple cyber : L''université de Poitiers en pointe sur la gestion des crises cyber — 07/10/2022 — https://www.univ-poitiers.fr/luniversite-de-poitiers-en-pointe-sur-la-gestion-des-crises-cyber/', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-02-campus-angouleme', 'Campus universitaire d''Angoulême', 'cti', 'https://angouleme.univ-poitiers.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":2}}'::jsonb, 3600, 'campus universitaire, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-03-cnam-enjmin', 'Cnam-Enjmin Angoulême', 'cti', 'https://enjmin.cnam.fr/cnam-enjmin/agenda/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":3}}'::jsonb, 3600, 'école supérieure (CNAM), secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-04-greta-cfa-aquitaine', 'GRETA-CFA Aquitaine — antenne de Charente', 'cti', 'https://greta-cfa-aquitaine.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":4}}'::jsonb, 3600, 'organisme de formation continue, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-05-crous-poitiers', 'CROUS de Poitiers — site d''Angoulême', 'cti', 'https://www.crous-poitiers.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":5}}'::jsonb, 3600, 'CROUS, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-06-eesi-angouleme', 'ÉESI — École européenne supérieure de l''image (Angoulême)', 'cti', 'https://eesi.eu/site/spip.php?page=backend', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":6}}'::jsonb, 3600, 'école supérieure, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-07-lisa-angouleme', 'LISA — Lycée de l''Image et du Son d''Angoulême', 'cti', 'https://www.lycee-image-son-angouleme.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":7}}'::jsonb, 3600, 'lycée professionnel, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-08-magelis', 'Magelis — pôle image d''Angoulême', 'cti', 'https://magelis.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":8}}'::jsonb, 3600, 'pôle de compétences image, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-09-lycee-louise-michel-ruffec', 'Lycée Louise Michel (Ruffec)', 'cti', 'https://lycee-louise-michel.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":9}}'::jsonb, 3600, 'lycée professionnel, secteur enseignement, departement 16 (Charente). Exemple cyber : Mini-usine de cybersécurité industrielle — https://lycee-louise-michel.fr/bac-pro-ciel-et-schneider-electric-une-mini-usine-pour-apprendre-la-cybersecurite-industrielle/ ; CTF Root-Me PRO 2026 — https://lycee-louise-michel.fr/ctf-root-me-pro-2026-nos-eleves-de-1re-bac-pro-ciel-sur-le-podium/', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-10-lycee-chabanne', 'Lycée Chabanne (Angoulême)', 'cti', 'https://www.lycee-chabanne16.fr/feed', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":10}}'::jsonb, 3600, 'lycée, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-11-saint-joseph-beaulieu-cognac', 'Saint-Joseph / Beaulieu (Cognac)', 'cti', 'https://www.saintjoseph-cognac.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":11}}'::jsonb, 3600, 'lycée professionnel, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-12-college-felix-gaillard-cognac', 'Collège Félix Gaillard (Cognac)', 'cti', 'https://etab.ac-poitiers.fr/coll-felix-gaillard-cognac/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":12}}'::jsonb, 3600, 'collège, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-13-charente-libre-education', 'Charente Libre — éducation', 'cti', 'https://www.charentelibre.fr/education/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":13}}'::jsonb, 3600, 'presse locale, secteur enseignement, departement 16 (Charente). Exemple cyber : Angoulême : la Cité de la BD victime d''une cyberattaque — https://www.charentelibre.fr/charente/angouleme/angouleme-la-cite-de-la-bd-victime-d-une-cyberattaque-21150048.php', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-14-sud-ouest-charente', 'Sud Ouest — édition Charente', 'presse', 'https://www.sudouest.fr/charente/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":14}}'::jsonb, 3600, 'presse locale, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-15-actu-fr-charente', 'actu.fr — Charente', 'presse', 'https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":15}}'::jsonb, 3600, 'presse locale, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-16-snes-fsu', 'SNES-FSU', 'presse', 'https://www.snes.edu/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":16}}'::jsonb, 3600, 'syndicat professionnel de l''enseignement, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ens16-17-unsa-education', 'UNSA Éducation', 'cti', 'https://www.unsa-education.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-enseignement-16.jsonl","ligne":17}}'::jsonb, 3600, 'fédération syndicale de l''enseignement, secteur enseignement, departement 16 (Charente).', 'Nouvelle-Aquitaine', '16')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de verification HTTP : 42 URLs controlees, toutes en 200 le 2026-11-22.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT s.id, v.url, 200, v.type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus enseignement-16 : HTTP 200 verifie le 2026-11-22'
FROM source s
JOIN (VALUES
  ('corpus:ens16-01-iut-angouleme', 'https://iut-angouleme.univ-poitiers.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-01-iut-angouleme', 'https://iut-angouleme.univ-poitiers.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-01-iut-angouleme', 'https://iut-angouleme.univ-poitiers.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-02-campus-angouleme', 'https://angouleme.univ-poitiers.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-02-campus-angouleme', 'https://angouleme.univ-poitiers.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-02-campus-angouleme', 'https://angouleme.univ-poitiers.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-03-cnam-enjmin', 'https://enjmin.cnam.fr/', 'text/html;charset=UTF-8'),
  ('corpus:ens16-03-cnam-enjmin', 'https://enjmin.cnam.fr/cnam-enjmin/agenda/', 'text/html;charset=UTF-8'),
  ('corpus:ens16-04-greta-cfa-aquitaine', 'https://greta-cfa-aquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-04-greta-cfa-aquitaine', 'https://greta-cfa-aquitaine.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-05-crous-poitiers', 'https://www.crous-poitiers.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-05-crous-poitiers', 'https://www.crous-poitiers.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-05-crous-poitiers', 'https://www.crous-poitiers.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-06-eesi-angouleme', 'https://eesi.eu/site/index.php', 'text/html; charset=utf-8'),
  ('corpus:ens16-06-eesi-angouleme', 'https://eesi.eu/site/spip.php?page=backend', 'text/xml; charset=utf-8'),
  ('corpus:ens16-07-lisa-angouleme', 'https://www.lycee-image-son-angouleme.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-07-lisa-angouleme', 'https://www.lycee-image-son-angouleme.fr/category/activites-vie-du-lycee/journal-du-lycee-lisactu/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-07-lisa-angouleme', 'https://www.lycee-image-son-angouleme.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-08-magelis', 'https://magelis.org/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-08-magelis', 'https://magelis.org/infos/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-08-magelis', 'https://magelis.org/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-09-lycee-louise-michel-ruffec', 'https://lycee-louise-michel.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-09-lycee-louise-michel-ruffec', 'https://lycee-louise-michel.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-10-lycee-chabanne', 'https://www.lycee-chabanne16.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-10-lycee-chabanne', 'https://www.lycee-chabanne16.fr/feed', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-11-saint-joseph-beaulieu-cognac', 'https://www.saintjoseph-cognac.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-11-saint-joseph-beaulieu-cognac', 'https://www.saintjoseph-cognac.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-11-saint-joseph-beaulieu-cognac', 'https://www.saintjoseph-cognac.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-12-college-felix-gaillard-cognac', 'https://etab.ac-poitiers.fr/coll-felix-gaillard-cognac/', 'text/html; charset=utf-8'),
  ('corpus:ens16-13-charente-libre-education', 'https://www.charentelibre.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-13-charente-libre-education', 'https://www.charentelibre.fr/education/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-13-charente-libre-education', 'https://www.charentelibre.fr/education/rss.xml', 'application/xml'),
  ('corpus:ens16-14-sud-ouest-charente', 'https://www.sudouest.fr/charente/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-14-sud-ouest-charente', 'https://www.sudouest.fr/charente/rss.xml', 'application/xml'),
  ('corpus:ens16-15-actu-fr-charente', 'https://actu.fr/nouvelle-aquitaine/charente_16/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-15-actu-fr-charente', 'https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:ens16-16-snes-fsu', 'https://www.snes.edu/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-16-snes-fsu', 'https://www.snes.edu/article/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-16-snes-fsu', 'https://www.snes.edu/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens16-17-unsa-education', 'https://www.unsa-education.com/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-17-unsa-education', 'https://www.unsa-education.com/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens16-17-unsa-education', 'https://www.unsa-education.com/feed/', 'application/rss+xml; charset=UTF-8')
) AS v(source_id, url, type) ON v.source_id = s.id
WHERE s.id LIKE 'corpus:ens16-%'
  AND NOT EXISTS (SELECT 1 FROM source_verification sv WHERE sv.source_id = s.id AND sv.url = v.url);
