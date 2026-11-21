-- 062 — Regional-language sources (Occitan and Basque) in Nouvelle-Aquitaine.
--
-- Source rows had no language or territory of their own: regional scope lived
-- on events, so a publication in Occitan or Basque could not be counted. This
-- migration adds three auditable columns to `source` and integrates thirteen
-- public sources verified on 2026-11-21 (HTTP 200, current content in the
-- declared language). Evidence is versioned in
-- bench/corpus/sources-langues-regionales-na.jsonl.
--
-- Gray literature is allowed (community radios, associations, local media).
-- Only institutional source metadata is stored: never victim personal data.
-- All publishers are based in Pyrénées-Atlantiques (64), Nouvelle-Aquitaine.

BEGIN;

ALTER TABLE source ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE source ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE source ADD COLUMN IF NOT EXISTS department text;

ALTER TABLE source DROP CONSTRAINT IF EXISTS source_language_check;
ALTER TABLE source ADD CONSTRAINT source_language_check
  CHECK (language IS NULL OR language IN ('fr', 'en', 'oc', 'eu'));

CREATE INDEX IF NOT EXISTS source_regional_language_idx
  ON source (language, department) WHERE language IN ('oc', 'eu');

COMMENT ON COLUMN source.language IS 'ISO 639-1 publication language: fr, en, oc (Occitan) or eu (Basque).';
COMMENT ON COLUMN source.region IS 'Publisher region; nouvelle-aquitaine for the twelve NA departments.';
COMMENT ON COLUMN source.department IS 'INSEE department code of the publisher.';

INSERT INTO source
  (id, name, family, url, license, enabled, kind, format, parser, interval_sec,
   description, language, region, department)
VALUES
  ('regional:eu:eke', 'Euskal Kultur Erakundea (EKE)', 'presse',
   'https://www.eke.eus/eu', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Basque cultural association in Iparralde (64); verified 2026-11-21, HTTP 200, Basque content',
   'eu', 'nouvelle-aquitaine', '64'),
  ('regional:eu:gure-irratia', 'Gure Irratia', 'presse',
   'https://gureirratia.eus', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Basque community radio in Bayonne (64); verified 2026-11-21, HTTP 200, Basque content',
   'eu', 'nouvelle-aquitaine', '64'),
  ('regional:eu:xiberoko-botza', 'Xiberoko Botza', 'presse',
   'https://xiberokobotza.eus', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Basque community radio in Soule (64); verified 2026-11-21, HTTP 200, Basque content',
   'eu', 'nouvelle-aquitaine', '64'),
  ('regional:eu:euskal-irratiak', 'Euskal Irratiak', 'presse',
   'https://euskalirratiak.eus', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Basque radio federation in Iparralde (64); verified 2026-11-21, HTTP 200, Basque content',
   'eu', 'nouvelle-aquitaine', '64'),
  ('regional:eu:irulegiko-irratia', 'Irulegiko Irratia', 'presse',
   'https://irulegikoirratia.eus', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Basque community radio in Saint-Jean-Pied-de-Port (64); verified 2026-11-21, HTTP 200, Basque content',
   'eu', 'nouvelle-aquitaine', '64'),
  ('regional:eu:kanaldude', 'Kanaldude', 'presse',
   'https://kanaldude.eus', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Basque community television in Iparralde (64); verified 2026-11-21, HTTP 200, Basque content',
   'eu', 'nouvelle-aquitaine', '64'),
  ('regional:eu:seaska', 'Seaska', 'presse',
   'https://seaska.eus/eu', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Basque ikastola network in Bayonne (64); verified 2026-11-21, HTTP 200, Basque content',
   'eu', 'nouvelle-aquitaine', '64'),
  ('regional:eu:kazeta', 'Kazeta', 'presse',
   'https://www.kazeta.eus/eu', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Basque online media in Bayonne (64); verified 2026-11-21, HTTP 200, Basque content',
   'eu', 'nouvelle-aquitaine', '64'),
  ('regional:oc:radio-pais', 'Ràdio País', 'presse',
   'https://www.radiopais.fr', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Gascon radio created in Béarn (64); verified 2026-11-21, HTTP 200, Occitan content',
   'oc', 'nouvelle-aquitaine', '64'),
  ('regional:oc:capoc', 'Cap''òc', 'presse',
   'https://www.capoc.fr', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Occitan educational network in Pau (64); verified 2026-11-21, HTTP 200, Occitan content',
   'oc', 'nouvelle-aquitaine', '64'),
  ('regional:oc:escola-gaston-febus', 'Escòla Gaston Fèbus', 'presse',
   'https://escolagastonfebus.com', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Gascon language association in Pau (64); verified 2026-11-21, HTTP 200, Occitan content',
   'oc', 'nouvelle-aquitaine', '64'),
  ('regional:oc:reclams', 'Reclams', 'presse',
   'https://www.reclams.org/oc/', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Occitan cultural association in Pau (64); verified 2026-11-21, HTTP 200, Occitan content',
   'oc', 'nouvelle-aquitaine', '64'),
  ('regional:oc:arraton', 'L''Arraton deu Castèth', 'presse',
   'https://arraton.fr', 'public web content, source credited', true,
   'narrative', 'html', '{}'::jsonb, 3600,
   'Gascon cultural association in Pau (64); verified 2026-11-21, HTTP 200, Occitan content',
   'oc', 'nouvelle-aquitaine', '64')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  enabled = true,
  description = EXCLUDED.description,
  language = EXCLUDED.language,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

COMMIT;
