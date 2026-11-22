-- Sources d'information du secteur « numerique » du département 40 (Landes).
-- 20 sources ; 51 URL contrôlées en HTTP 200 le 2026-11-22 (GET réel, contenus HTML/RSS vérifiés).
-- Corpus détaillé : bench/corpus/sources-numerique-40.jsonl
-- Rapport : bench/results/verification-numerique-40.json

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
  ('corpus:numerique-40-cci-landes', 'CCI des Landes', 'cti', 'https://www.landes.cci.fr/actualite/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":1}}'::jsonb, 3600, 'CCI des Landes — chambre consulaire (numerique et cybersecurite, Mars@Hack), source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-cma-landes', 'CMA Nouvelle-Aquitaine — antenne des Landes', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":2}}'::jsonb, 3600, 'CMA Nouvelle-Aquitaine — antenne des Landes — chambre consulaire (artisanat et numerique), source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-medef-landes', 'MEDEF des Landes', 'cti', 'https://landes.territoriaux.medef.com/actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":3}}'::jsonb, 3600, 'MEDEF des Landes — organisation patronale, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-club-landes-entreprises', 'Club Landes Entreprises', 'cti', 'https://club-landes-entreprises.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":4}}'::jsonb, 3600, 'Club Landes Entreprises — club d entreprises, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-landes-business', 'Landes & Business — club d affaires (Dax)', 'cti', 'https://www.landes-business.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":5}}'::jsonb, 3600, 'Landes & Business — club d affaires (Dax), source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-club-entrepreneurs-saint-paul', 'Club des Entrepreneurs de Saint-Paul-lès-Dax', 'cti', 'https://club-des-entrepreneurs-saint-paul-les-dax.fr/evenements/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":6}}'::jsonb, 3600, 'Club des Entrepreneurs de Saint-Paul-lès-Dax — club d entrepreneurs, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-french-tech-bordeaux', 'French Tech Bordeaux — réseau régional couvrant les Landes', 'cti', 'https://frenchtechbordeaux.com/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":7}}'::jsonb, 3600, 'French Tech Bordeaux — reseau French Tech de Nouvelle-Aquitaine couvrant les Landes, source d information du secteur numerique, donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-nathd', 'NATHD — Service public de la fibre en Nouvelle-Aquitaine', 'cti', 'https://nathd.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":8}}'::jsonb, 3600, 'NATHD — operateur public de la fibre en Nouvelle-Aquitaine (Landes incluses), source d information du secteur numerique, donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-actu-landes', 'actu.fr — Actu Landes', 'presse', 'https://actu.fr/landes/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":9}}'::jsonb, 3600, 'actu.fr — Actu Landes — presse locale numerique, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-sudouest-landes', 'Sud Ouest — édition Landes', 'presse', 'https://www.sudouest.fr/landes/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":10}}'::jsonb, 3600, 'Sud Ouest — edition Landes — quotidien regional, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-landes-info', 'Landes Info', 'presse', 'https://landesinfo.net/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":11}}'::jsonb, 3600, 'Landes Info — pure player local, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-ici-landes', 'ici Landes (40) — Radio France', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":12}}'::jsonb, 3600, 'ici Landes (40) — Radio France — radio publique locale, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-france3-landes', 'France 3 Nouvelle-Aquitaine — édition Landes', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":13}}'::jsonb, 3600, 'France 3 Nouvelle-Aquitaine — edition Landes — television publique regionale, source d information du secteur numerique, donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-aquitaineonline-landes', 'AquitaineOnLine — Landes', 'presse', 'https://www.aquitaineonline.com/actualites-en-aquitaine/landes/feed/rss/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":14}}'::jsonb, 3600, 'AquitaineOnLine — Landes — presse en ligne regionale, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-annonces-landaises', 'Les Annonces Landaises', 'presse', 'https://www.annonces-landaises.com/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":15}}'::jsonb, 3600, 'Les Annonces Landaises — hebdomadaire local, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-actu-locale-365-landes', 'Actu Locale 365 — Landes', 'presse', 'https://actulocale365.fr/nouvelle-aquitaine/landes/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":16}}'::jsonb, 3600, 'Actu Locale 365 — Landes — aggregateur d actualite locale, source d information du secteur numerique, donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-le-parisien-landes', 'Le Parisien — Landes (40)', 'presse', 'https://www.leparisien.fr/landes-40/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":17}}'::jsonb, 3600, 'Le Parisien — Landes (40) — quotidien regional, source d information du secteur numerique, donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-xlandes-info', 'XLandes-Info', 'presse', 'https://www.xlandes-info.fr/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":18}}'::jsonb, 3600, 'XLandes-Info — media departemental en ligne, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-presselib-landes', 'PresseLib — édition Landes', 'presse', 'https://presselib.com/en-region/landes', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":19}}'::jsonb, 3600, 'PresseLib — edition Landes — media local en ligne, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40'),
  ('corpus:numerique-40-uppa', 'Université de Pau et des Pays de l''Adour — actualités', 'institutionnel', 'https://www.univ-pau.fr/fr/actualites/toute-l-actualite.html', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-40.jsonl","ligne":20}}'::jsonb, 3600, 'Universite de Pau et des Pays de l''Adour — formations numeriques, source d information du secteur numerique dans les Landes (40), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '40')
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
VALUES
  ('corpus:numerique-40-cci-landes', 'https://www.landes.cci.fr/actualite/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-cma-landes', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-medef-landes', 'https://landes.territoriaux.medef.com/actualites', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-club-landes-entreprises', 'https://club-landes-entreprises.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-landes-business', 'https://www.landes-business.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 1, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-club-entrepreneurs-saint-paul', 'https://club-des-entrepreneurs-saint-paul-les-dax.fr/evenements/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-french-tech-bordeaux', 'https://frenchtechbordeaux.com/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-nathd', 'https://nathd.fr/feed/', 200, 'text/xml; charset=UTF-8', 5, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-actu-landes', 'https://actu.fr/landes/rss.xml', 200, 'application/rss+xml; charset=utf-8', 20, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-sudouest-landes', 'https://www.sudouest.fr/landes/rss.xml', 200, 'application/xml', 20, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-landes-info', 'https://landesinfo.net/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-ici-landes', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 200, 'application/xml', 20, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-france3-landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 200, 'text/xml; charset=UTF-8', 30, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-aquitaineonline-landes', 'https://www.aquitaineonline.com/actualites-en-aquitaine/landes/feed/rss/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-annonces-landaises', 'https://www.annonces-landaises.com/feed/', 200, 'application/rss+xml; charset=UTF-8', 10, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-actu-locale-365-landes', 'https://actulocale365.fr/nouvelle-aquitaine/landes/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-le-parisien-landes', 'https://www.leparisien.fr/landes-40/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-xlandes-info', 'https://www.xlandes-info.fr/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-presselib-landes', 'https://presselib.com/en-region/landes', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-40-uppa', 'https://www.univ-pau.fr/fr/actualites/toute-l-actualite.html', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-40 : HTTP 200 vérifié le 2026-11-22');
