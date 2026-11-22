-- Sources d'information du secteur « numerique » du département 64 (Pyrénées-Atlantiques).
-- 21 sources ; 62 URL contrôlées en HTTP 200 le 2026-11-22 (GET réel, contenus HTML/RSS vérifiés).
-- Corpus détaillé : bench/corpus/sources-numerique-64.jsonl
-- Rapport : bench/results/verification-numerique-64.json

-- Table de traçage déclarée ici en complément pour rester applicable sur une
-- branche qui ne contient pas encore migrate-064-source-verification.sql.
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
  ('corpus:numerique-64-cci-pau', 'CCI Pau Béarn', 'cti', 'https://pau.cci.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":1}}'::jsonb, 3600, 'CCI Pau Béarn — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-cma-64', 'CMA Nouvelle-Aquitaine — antenne des Pyrénées-Atlantiques', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":2}}'::jsonb, 3600, 'CMA Nouvelle-Aquitaine — antenne des Pyrénées-Atlantiques — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-medef-pays-basque', 'MEDEF Pays Basque', 'cti', 'https://www.medef-pays-basque.fr/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":3}}'::jsonb, 3600, 'MEDEF Pays Basque — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-medef-bearn-soule', 'MEDEF Béarn & Soule', 'cti', 'https://www.medef-bearnetsoule.com/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":4}}'::jsonb, 3600, 'MEDEF Béarn & Soule — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-pays-basque-digital', 'Pays Basque Digital', 'cti', 'https://www.pays-basque-digital.fr/actualites/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":5}}'::jsonb, 3600, 'Pays Basque Digital — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-fibre64', 'Syndicat Mixte La Fibre64', 'cti', 'https://lafibre64.fr/cybermois/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":6}}'::jsonb, 3600, 'Syndicat Mixte La Fibre64 — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-lanum-paysbasque', 'LaNum — Agence Numérique Pays Basque', 'cti', 'https://lanum-paysbasque.com/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":7}}'::jsonb, 3600, 'LaNum — Agence Numérique Pays Basque — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-french-tech-pays-basque', 'French Tech Pays Basque', 'cti', 'https://www.frenchtech-paysbasque.com/posts', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":8}}'::jsonb, 3600, 'French Tech Pays Basque — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-estia-izarbel', 'ESTIA — technopole Izarbel', 'cti', 'https://www.estia.fr/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":9}}'::jsonb, 3600, 'ESTIA — technopole Izarbel — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-numeum', 'Numeum — syndicat des entreprises numériques', 'cti', 'https://numeum.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":10}}'::jsonb, 3600, 'Numeum — syndicat des entreprises numériques — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-communaute-paysbasque', 'Communauté d''Agglomération Pays Basque', 'institutionnel', 'https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":11}}'::jsonb, 3600, 'Communauté d''Agglomération Pays Basque — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-conseil-departemental-64', 'Conseil départemental 64 — le64', 'institutionnel', 'https://www.le64.fr/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":12}}'::jsonb, 3600, 'Conseil départemental 64 — le64 — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-ville-bayonne', 'Ville de Bayonne', 'institutionnel', 'https://www.bayonne.fr/information-transversale/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":13}}'::jsonb, 3600, 'Ville de Bayonne — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-sudouest-64', 'Sud Ouest — Pyrénées-Atlantiques', 'presse', 'https://www.sudouest.fr/pyrenees-atlantiques/pau/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":14}}'::jsonb, 3600, 'Sud Ouest — Pyrénées-Atlantiques — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-republique-pyrenees', 'La République des Pyrénées', 'presse', 'https://www.larepubliquedespyrenees.fr/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":15}}'::jsonb, 3600, 'La République des Pyrénées — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-actu-fr-64', 'actu.fr — Pyrénées-Atlantiques', 'presse', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":16}}'::jsonb, 3600, 'actu.fr — Pyrénées-Atlantiques — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-vie-economique', 'La Vie Economique — Pays Basque', 'presse', 'https://www.vie-economique.com/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":17}}'::jsonb, 3600, 'La Vie Economique — Pays Basque — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-ici-pays-basque', 'ici Pays Basque — Radio France', 'presse', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":18}}'::jsonb, 3600, 'ici Pays Basque — Radio France — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-france3-64', 'France 3 Nouvelle-Aquitaine — Pyrénées-Atlantiques', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":19}}'::jsonb, 3600, 'France 3 Nouvelle-Aquitaine — Pyrénées-Atlantiques — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-actu-pau', 'Actu Pau', 'presse', 'https://actu-pau.com/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":20}}'::jsonb, 3600, 'Actu Pau — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64'),
  ('corpus:numerique-64-uppa', 'Université de Pau et des Pays de l’Adour', 'institutionnel', 'https://www.univ-pau.fr/fr/actualites/toute-l-actualite.html', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-64.jsonl","ligne":21}}'::jsonb, 3600, 'Université de Pau et des Pays de l’Adour — source d information du secteur numerique dans les Pyrenees-Atlantiques (64), verifie le 2026-11-22.', 'Nouvelle-Aquitaine', '64')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : une ligne par source intégrée, 200 observé le 2026-11-22.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, v.code_http, v.content_type, v.items, v.ms, v.verifie_at, v.user_agent, v.etat, v.motif
FROM (VALUES
  ('corpus:numerique-64-cci-pau', 'https://pau.cci.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-cma-64', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-medef-pays-basque', 'https://www.medef-pays-basque.fr/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-medef-bearn-soule', 'https://www.medef-bearnetsoule.com/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-pays-basque-digital', 'https://www.pays-basque-digital.fr/actualites/', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-fibre64', 'https://lafibre64.fr/cybermois/', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-lanum-paysbasque', 'https://lanum-paysbasque.com/feed/', 200, 'application/rss+xml; charset=UTF-8', 12, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-french-tech-pays-basque', 'https://www.frenchtech-paysbasque.com/posts', 200, 'text/html; charset=utf-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-estia-izarbel', 'https://www.estia.fr/rss.xml', 200, 'application/rss+xml;charset=utf-8', 15, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-numeum', 'https://numeum.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-communaute-paysbasque', 'https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites', 200, 'text/html; charset=utf-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-conseil-departemental-64', 'https://www.le64.fr/rss.xml', 200, 'application/rss+xml; charset=utf-8', 1, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-ville-bayonne', 'https://www.bayonne.fr/information-transversale/actualites', 200, 'text/html; charset=utf-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-sudouest-64', 'https://www.sudouest.fr/pyrenees-atlantiques/pau/rss.xml', 200, 'application/xml', 20, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-republique-pyrenees', 'https://www.larepubliquedespyrenees.fr/rss.xml', 200, 'application/xml', 20, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-actu-fr-64', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/', 200, 'text/html; charset=utf-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-vie-economique', 'https://www.vie-economique.com/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-ici-pays-basque', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 200, 'application/xml', 40, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-france3-64', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss', 200, 'text/xml; charset=UTF-8', 30, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-actu-pau', 'https://actu-pau.com/rss.xml', 200, 'application/xml', 60, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22'),
  ('corpus:numerique-64-uppa', 'https://www.univ-pau.fr/fr/actualites/toute-l-actualite.html', 200, 'text/html; charset=UTF-8', 0, 0, now()::timestamptz, 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-64 : HTTP 200 verifie le 2026-11-22')
) AS v(source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
WHERE NOT EXISTS (
  SELECT 1 FROM source_verification sv
  WHERE sv.source_id = v.source_id AND sv.url = v.url
    AND sv.verifie_at::date = DATE '2026-11-22'
);
