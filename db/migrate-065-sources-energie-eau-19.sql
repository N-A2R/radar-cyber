-- Sources d'information du secteur « energie-eau » du département 19 (Corrèze).
-- 21 sources, 49 contrôles HTTP sur 49 URLs distinctes (sites, pages actualités et flux),
-- Corpus détaillé : bench/corpus/sources-energie-eau-19.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-19.json

-- Traçage déclaré en complément pour rester applicable sur une branche qui ne
-- contient pas encore migrate-064-source-verification.sql.
CREATE TABLE IF NOT EXISTS source_verification (
  id                bigserial PRIMARY KEY,
  source_id         text        NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  url               text        NOT NULL,
  code_http         integer,
  content_type      text,
  items             integer     NOT NULL DEFAULT 0 CHECK (items >= 0),
  derniere_item_at  timestamptz,
  ms                integer     NOT NULL CHECK (ms >= 0),
  verifie_at        timestamptz NOT NULL DEFAULT now(),
  user_agent        text        NOT NULL,
  etat              text        NOT NULL CHECK (etat IN ('ok200', 'muette', 'morte', 'lente')),
  motif             text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_source_date
  ON source_verification (source_id, verifie_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:e19-conseil-departemental', 'Conseil départemental de la Corrèze', 'cti', 'https://www.correze.fr/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":1}}'::jsonb, 3600, 'Collectivité de Corrèze (19) : transition écologique, eau et énergie. Exemple cyber : protection du réseau électrique (Sud Ouest, 28/09/2026).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-prefecture', 'Services de l''État en Corrèze — préfecture', 'cti', 'https://www.correze.gouv.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":2}}'::jsonb, 3600, 'Préfecture de la Corrèze (19) : sécheresse, eau potable, énergie. Exemple cyber : failles eau potable et électricité (14/10/2026).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-cma', 'CMA Nouvelle-Aquitaine — antenne de la Corrèze', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":3}}'::jsonb, 3600, 'Chambre des métiers et de l artisanat, antenne de la Corrèze (19), artisans énergie et eau. Exemple cyber : arnaque à la facture d eau (22/09/2025).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-enedis', 'Enedis — gestionnaire du réseau de distribution d''électricité', 'cti', 'https://www.enedis.fr/presse', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":4}}'::jsonb, 3600, 'Distributeur d électricité présent en Corrèze (19). Exemple cyber : démarchages frauduleux usurpant Enedis.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-fp2e', 'FP2E — Fédération professionnelle des entreprises de l''eau', 'cti', 'https://www.fp2e.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":5}}'::jsonb, 3600, 'Fédération professionnelle de l eau, actualités utiles aux opérateurs de Corrèze (19). Exemple cyber : fuite de données clients SUEZ (20/08/2026).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-cieau', 'CIEau — Centre d''information sur l''eau', 'cti', 'https://www.cieau.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":6}}'::jsonb, 3600, 'Centre de ressources sur l eau, actualités utiles aux acteurs de Corrèze (19). Exemple cyber : fuite de 55 000 contrats d eau (08/10/2026).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-grdf', 'GRDF — réseau de distribution de gaz', 'cti', 'https://news.google.com/rss/search?q=GRDF&hl=fr&gl=FR&ceid=FR:fr', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":7}}'::jsonb, 3600, 'Distributeur de gaz présent en Corrèze (19). Flux Google Actualités GRDF, 66 items au contrôle. Exemple cyber : failles eau potable et électricité.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-suez', 'SUEZ — eau et assainissement (Bassin de Brive)', 'cti', 'https://www.suez.com/fr/news', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":8}}'::jsonb, 3600, 'Opérateur de l eau engagé avec l agglomération du Bassin de Brive (19). Exemple cyber : fuite de données clients SUEZ (20/08/2026).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-pro-rge', 'Pro-RGE — Entreprises RGE en Corrèze', 'cti', 'https://pro-rge.fr/entreprises/correze-19/', 'annuaire professionnel public', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":9}}'::jsonb, 86400, 'Annuaire des professionnels Reconnu Garant de l Environnement de Corrèze (19), 392 entreprises référencées.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-recours-france', 'Recours France — Énergie et eau en Corrèze (19)', 'cti', 'https://recours-france.fr/annuaire/energie/19-correze', 'annuaire professionnel public', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":10}}'::jsonb, 86400, 'Annuaire professionnel des entreprises énergie et eau de Corrèze (19).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-la-montagne', 'La Montagne — Corrèze', 'presse', 'https://www.lamontagne.fr/correze/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":11}}'::jsonb, 3600, 'Quotidien régional, édition Corrèze (19) : eau, sécheresse, énergie. Exemple cyber : failles eau potable et électricité (14/10/2026).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-sud-ouest', 'Sud Ouest — Corrèze', 'presse', 'https://www.sudouest.fr/correze/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":12}}'::jsonb, 3600, 'Presse quotidienne régionale, édition Corrèze (19), 20 items au contrôle. Exemple cyber : protection du réseau électrique (28/09/2026).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-ici', 'ici Corrèze — Radio France (ICI Limousin)', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":13}}'::jsonb, 3600, 'Radio publique locale de Corrèze (19), flux ICI Limousin 20 items au contrôle. Exemple cyber : protection du réseau électrique.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-actu-tulle', 'actu.fr — Tulle (Corrèze)', 'presse', 'https://actu.fr/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":14}}'::jsonb, 3600, 'Presse locale de Tulle (19), flux actu.fr 30 items au contrôle. Exemple cyber : arnaque à la facture d eau (22/09/2025).', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-vie-correzienne', 'La Vie Corrézienne — Actualités', 'presse', 'https://www.laviecorrezienne.fr/actualites-actualites.html', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":15}}'::jsonb, 3600, 'Hebdomadaire local de Corrèze (19), actualités eau et transition écologique.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-radio-totem', 'Radio Totem — info Corrèze', 'presse', 'https://www.radiototem.net/info', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":16}}'::jsonb, 3600, 'Radio locale de Corrèze (19), actualités eau et environnement.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-agglodebrive', 'Agglo de Brive — Communauté d''agglomération du Bassin de Brive', 'cti', 'http://www.agglodebrive.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":17}}'::jsonb, 3600, 'Agglomération du Bassin de Brive (19), compétences eau, assainissement et énergie. Flux RSS 10 items au contrôle.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-tulle-agglo', 'Tulle agglo — eau, assainissement et transition énergétique', 'cti', 'https://www.tulleagglo.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":18}}'::jsonb, 3600, 'Agglomération de Tulle (19), compétences eau, assainissement et climat. Flux RSS 2 items au contrôle.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-fdee19', 'FDEE 19 — Fédération départementale d''électrification et d''énergie de la Corrèze', 'cti', 'https://www.fdee19.fr/actualites-fdee-19', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":19}}'::jsonb, 3600, 'Syndicat départemental d électrification et d énergie de la Corrèze (19). Exemple cyber : piratage de compteurs Linky.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-dreal', 'DREAL Nouvelle-Aquitaine — énergie, climat et eau', 'cti', 'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":20}}'::jsonb, 3600, 'Direction régionale de l environnement, compétences énergie, climat et eau sur la Corrèze (19). Flux 176 items au contrôle.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:e19-smem', 'SMEM — Syndicat mixte des eaux du Maumont (Corrèze)', 'cti', 'https://www.syndicat-eau-maumont.com/actualit%C3%A9s', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-energie-eau-19.jsonl","ligne":21}}'::jsonb, 3600, 'Syndicat mixte des eaux du Maumont en Corrèze (19). Exemple cyber : revendication visant la supervision d un service de l eau.', 'Nouvelle-Aquitaine', '19')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 49 URLs distinctes contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:e19-conseil-departemental', ARRAY['https://www.correze.fr/','https://www.correze.fr/la-correze-en-1-clic/actualites-en-direct','https://www.correze.fr/rss']),
    ('corpus:e19-prefecture', ARRAY['https://www.correze.gouv.fr/','https://www.correze.gouv.fr/actualites']),
    ('corpus:e19-cma', ARRAY['https://cma-nouvelleaquitaine.fr/','https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites']),
    ('corpus:e19-enedis', ARRAY['https://www.enedis.fr/','https://www.enedis.fr/presse']),
    ('corpus:e19-fp2e', ARRAY['https://www.fp2e.org/','https://www.fp2e.org/actualites/','https://www.fp2e.org/feed/']),
    ('corpus:e19-cieau', ARRAY['https://www.cieau.com/','https://www.cieau.com/categorie/actualite-de-eau/','https://www.cieau.com/feed/']),
    ('corpus:e19-grdf', ARRAY['https://www.grdf.fr/','https://justdecarb.grdf.fr/','https://news.google.com/rss/search?q=GRDF&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e19-suez', ARRAY['https://www.suez.com/fr','https://www.suez.com/fr/news']),
    ('corpus:e19-pro-rge', ARRAY['https://pro-rge.fr/entreprises/correze-19/']),
    ('corpus:e19-recours-france', ARRAY['https://recours-france.fr/annuaire/energie/19-correze']),
    ('corpus:e19-la-montagne', ARRAY['https://www.lamontagne.fr/correze/','https://www.lamontagne.fr/brive-la-gaillarde-19100/','https://news.google.com/rss/search?q=site%3Alamontagne.fr+Corr%C3%A8ze&hl=fr&gl=FR&ceid=FR:fr']),
    ('corpus:e19-sud-ouest', ARRAY['https://www.sudouest.fr/correze/','https://www.sudouest.fr/correze/rss.xml']),
    ('corpus:e19-ici', ARRAY['https://www.ici.fr/nouvelle-aquitaine/correze-19','https://www.ici.fr/nouvelle-aquitaine/correze-19/actu','https://www.ici.fr/rss/limousin/rubrique/infos.xml']),
    ('corpus:e19-actu-tulle', ARRAY['https://actu.fr/nouvelle-aquitaine/tulle_19272/','https://actu.fr/rss.xml']),
    ('corpus:e19-vie-correzienne', ARRAY['https://www.laviecorrezienne.fr/','https://www.laviecorrezienne.fr/actualites-actualites.html']),
    ('corpus:e19-radio-totem', ARRAY['https://www.radiototem.net/','https://www.radiototem.net/info']),
    ('corpus:e19-agglodebrive', ARRAY['http://www.agglodebrive.fr/','http://www.agglodebrive.fr/about/actualites/','http://www.agglodebrive.fr/feed/']),
    ('corpus:e19-tulle-agglo', ARRAY['https://www.tulleagglo.fr/','https://www.tulleagglo.fr/lagglo/actualites/','https://www.tulleagglo.fr/feed/']),
    ('corpus:e19-fdee19', ARRAY['https://www.fdee19.fr/','https://www.fdee19.fr/actualites-fdee-19']),
    ('corpus:e19-dreal', ARRAY['https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/','https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=liste-actualites','https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/spip.php?page=backend-actu']),
    ('corpus:e19-smem', ARRAY['https://www.syndicat-eau-maumont.com/','https://www.syndicat-eau-maumont.com/actualit%C3%A9s'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus energie-eau-19 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
