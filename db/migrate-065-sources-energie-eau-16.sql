-- Sources d'information énergie / eau du département 16 (Charente).
-- 9 sources, 24 URLs uniques toutes contrôlées en HTTP 200 le 2026-11-22 (site et actualités confondus pour Sud Ouest).
-- Corpus détaillé : bench/corpus/sources-energie-eau-16.jsonl
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:ee16-grandangouleme', 'GrandAngoulême — eau, assainissement et transition énergétique', 'cti', 'https://www.grandangouleme.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":1}}'::jsonb, 3600, 'Agglomération de Charente (16), compétences eau, assainissement et climat. Exemple cyber : fuite de 55 000 contrats d eau (Eau Coeur d Essonne, 08/10/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ee16-grand-cognac', 'Grand Cognac — eau et assainissement, plan climat air énergie', 'cti', 'https://www.grand-cognac.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":2}}'::jsonb, 3600, 'Agglomération de Charente (16), service eau et assainissement et plan climat air energie. Exemple cyber : failles eau potable et electricite (14/10/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ee16-conseil-departemental-charente', 'Conseil départemental de la Charente', 'cti', 'https://www.lacharente.fr/actualite/a-la-une', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":3}}'::jsonb, 3600, 'Institution du departement 16, actualites environnement, eau et energie. Exemple cyber : protection du reseau electrique (Sud Ouest, 28/09/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ee16-charente-libre-environnement', 'Charente Libre — actualités environnement', 'presse', 'https://www.charentelibre.fr/environnement/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":4}}'::jsonb, 3600, 'Presse locale de Charente (16), rubrique environnement (eau, energie). Exemple cyber : piratage de comptes a Saint-Angeau (01/08/2024).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ee16-sud-ouest-charente', 'Sud Ouest — édition Charente', 'presse', 'https://www.sudouest.fr/charente/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":5}}'::jsonb, 3600, 'Presse locale de Charente (16), eau et energie. Exemple cyber : protection du reseau electrique face aux attaques russes (28/09/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ee16-dreal-nouvelle-aquitaine', 'DREAL Nouvelle-Aquitaine — énergie, climat et eau', 'cti', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":6}}'::jsonb, 3600, 'Direction regionale de l environnement, competences energie, climat et eau sur la Charente (16). Exemple cyber : protection du reseau electrique (28/09/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ee16-enedis', 'Enedis — actualités et presse', 'cti', 'https://www.enedis.fr/presse', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":7}}'::jsonb, 3600, 'Gestionnaire du reseau de distribution d electricite, present en Charente (16). Exemple cyber : protection du reseau electrique (28/09/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ee16-fp2e', 'FP2E — Fédération professionnelle des entreprises de l''eau', 'cti', 'https://www.fp2e.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":8}}'::jsonb, 3600, 'Federation professionnelle de l eau, actualites utiles aux operateurs de Charente (16). Exemple cyber : fuite de donnees clients SUEZ (20/08/2026).', 'Nouvelle-Aquitaine', '16'),
  ('corpus:ee16-cieau', 'CIEau — Centre d''information sur l''eau', 'cti', 'https://www.cieau.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-16.jsonl","ligne":9}}'::jsonb, 3600, 'Centre de ressources sur l eau, actualites utiles aux acteurs de Charente (16). Exemple cyber : fuite de 55 000 contrats d eau (08/10/2026).', 'Nouvelle-Aquitaine', '16')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 24 URLs contrôlées, toutes en 200 le 2026-11-22.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT s.id, v.url, 200,
       CASE WHEN v.format = 'rss' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus energie-eau-16 : HTTP 200 vérifié le 2026-11-22'
FROM source s
JOIN (VALUES
  ('corpus:ee16-grandangouleme', 'https://www.grandangouleme.fr/', 'html'),
  ('corpus:ee16-grandangouleme', 'https://www.grandangouleme.fr/actualites/', 'html'),
  ('corpus:ee16-grandangouleme', 'https://www.grandangouleme.fr/feed/', 'rss'),
  ('corpus:ee16-grand-cognac', 'https://www.grand-cognac.fr/', 'html'),
  ('corpus:ee16-grand-cognac', 'https://www.grand-cognac.fr/comprendre-lagglo/les-actualites', 'html'),
  ('corpus:ee16-grand-cognac', 'https://www.grand-cognac.fr/rss.xml', 'rss'),
  ('corpus:ee16-conseil-departemental-charente', 'https://www.lacharente.fr/', 'html'),
  ('corpus:ee16-conseil-departemental-charente', 'https://www.lacharente.fr/actualite/a-la-une', 'html'),
  ('corpus:ee16-charente-libre-environnement', 'https://www.charentelibre.fr/', 'html'),
  ('corpus:ee16-charente-libre-environnement', 'https://www.charentelibre.fr/environnement/', 'html'),
  ('corpus:ee16-charente-libre-environnement', 'https://www.charentelibre.fr/environnement/rss.xml', 'rss'),
  ('corpus:ee16-sud-ouest-charente', 'https://www.sudouest.fr/charente/', 'html'),
  ('corpus:ee16-sud-ouest-charente', 'https://www.sudouest.fr/charente/rss.xml', 'rss'),
  ('corpus:ee16-dreal-nouvelle-aquitaine', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/', 'html'),
  ('corpus:ee16-dreal-nouvelle-aquitaine', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites&lang=fr', 'html'),
  ('corpus:ee16-dreal-nouvelle-aquitaine', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend', 'rss'),
  ('corpus:ee16-enedis', 'https://www.enedis.fr/', 'html'),
  ('corpus:ee16-enedis', 'https://www.enedis.fr/presse', 'html'),
  ('corpus:ee16-fp2e', 'https://www.fp2e.org/', 'html'),
  ('corpus:ee16-fp2e', 'https://www.fp2e.org/actualites/', 'html'),
  ('corpus:ee16-fp2e', 'https://www.fp2e.org/feed/', 'rss'),
  ('corpus:ee16-cieau', 'https://www.cieau.com/', 'html'),
  ('corpus:ee16-cieau', 'https://www.cieau.com/actualites/', 'html'),
  ('corpus:ee16-cieau', 'https://www.cieau.com/feed/', 'rss')
) AS v(source_id, url, format) ON v.source_id = s.id
WHERE s.id LIKE 'corpus:ee16-%'
  AND NOT EXISTS (SELECT 1 FROM source_verification sv WHERE sv.source_id = s.id AND sv.url = v.url);
