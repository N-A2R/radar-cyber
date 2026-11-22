-- Sources d'information du secteur « numerique » du departement 33 (Gironde).
-- 9 sources ; 23 URL controlees en HTTP 200 le 2026-11-22 (GET reel, redirections suivies).
-- Corpus detaille : bench/corpus/sources-numerique-33.jsonl
-- Rapport : bench/results/verification-numerique-33.json

-- La table de traçage est déclarée ici en complément pour rester applicable
-- sur une branche qui ne contient pas encore migrate-064-source-verification.sql.
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
  ('corpus:numerique-33-french-tech-bordeaux', 'French Tech Bordeaux', 'cti', 'https://www.frenchtechbordeaux.com/nos-actualites', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":1}}'::jsonb, 3600, 'French Tech Bordeaux — réseau French Tech (fédération des acteurs numériques de Gironde), source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:numerique-33-bordeaux-metropole', 'Bordeaux Métropole — actualités et pôle numérique', 'institutionnel', 'https://www.bordeaux-metropole.fr/rss.xml', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":2}}'::jsonb, 3600, 'Bordeaux Métropole — actualités et pôle numérique — collectivité territoriale — pôle numérique, source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:numerique-33-technowest', 'Bordeaux Technowest', 'cti', 'https://technowest.com/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":3}}'::jsonb, 3600, 'Bordeaux Technowest — technopole et incubateur de startups (Mérignac), source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:numerique-33-unitec', 'Unitec — incubateur Bordeaux', 'cti', 'https://unitec.fr/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":4}}'::jsonb, 3600, 'Unitec — incubateur de startups numériques (Cité numérique, Bègles), source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:numerique-33-syrpin', 'SYRPIN — syndicat des professionnels du numérique', 'cti', 'https://www.syrpin.org/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":5}}'::jsonb, 3600, 'SYRPIN — syndicat professionnel / cluster numérique (Bordeaux), source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:numerique-33-pole-enter', 'Pôle ENTER', 'cti', 'https://pole-enter.org/agenda/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":6}}'::jsonb, 3600, 'Pôle ENTER — pôle de compétitivité numérique (Bègles), source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:numerique-33-rue89-bordeaux', 'Rue89 Bordeaux', 'presse', 'https://rue89bordeaux.com/feed/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":7}}'::jsonb, 3600, 'Rue89 Bordeaux — presse locale numérique (Bordeaux / Gironde), source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:numerique-33-20minutes-bordeaux', '20 Minutes Bordeaux', 'presse', 'https://www.20minutes.fr/bordeaux/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":8}}'::jsonb, 3600, '20 Minutes Bordeaux — presse quotidienne locale (édition Bordeaux), source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:numerique-33-sharing-data', 'Sharing-data — annuaire tech Bordeaux', 'cti', 'https://sharing-data.fr/blog/', 'source d information du secteur numerique, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-numerique-33.jsonl","ligne":9}}'::jsonb, 3600, 'Sharing-data — annuaire professionnel des entreprises du numérique, source d information du secteur numerique en Gironde (33), donnees verifiees le 2026-11-22.', 'Nouvelle-Aquitaine', '33')
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
  ('corpus:numerique-33-french-tech-bordeaux', 'https://www.frenchtechbordeaux.com/nos-actualites', 200, 'text/html; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-33-bordeaux-metropole', 'https://www.bordeaux-metropole.fr/rss.xml', 200, 'application/rss+xml; charset=utf-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-33-technowest', 'https://technowest.com/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-33-unitec', 'https://unitec.fr/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-33-syrpin', 'https://www.syrpin.org/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-33-pole-enter', 'https://pole-enter.org/agenda/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-33-rue89-bordeaux', 'https://rue89bordeaux.com/feed/', 200, 'application/rss+xml; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-33-20minutes-bordeaux', 'https://www.20minutes.fr/bordeaux/', 200, 'text/html; charset=UTF-8', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22'),
  ('corpus:numerique-33-sharing-data', 'https://sharing-data.fr/blog/', 200, 'text/html', 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus numerique-33 : HTTP 200 vérifié le 2026-11-22');
