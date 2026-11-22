-- Sources d'information du secteur bâtiment dans le département 19 (Corrèze).
-- 12 sources, 22 contrôles HTTP sur 22 URLs distinctes (sites, pages actualités et flux), toutes en 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-batiment-19.jsonl
-- Preuve HTTP : bench/results/verification-sources-batiment-19.json

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
  ('corpus:batiment-19-capeb-correze', 'CAPEB Corrèze', 'cti', 'https://www.capeb.fr/correze/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":1}}'::jsonb, 3600, 'Syndicat professionnel du bâtiment de la Corrèze (19) ; corpus ligne 1.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-cma-nouvelle-aquitaine-correze', 'CMA Nouvelle-Aquitaine — Corrèze (chambre des métiers et de l''artisanat)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":2}}'::jsonb, 3600, 'Chambre des metiers et de l artisanat couvrant la Corrèze (19) ; corpus ligne 2.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-caue-19', 'CAUE 19 — Conseil d''architecture, d''urbanisme et de l''environnement de la Corrèze', 'cti', 'https://www.caue19.fr/news/category/actualite/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":3}}'::jsonb, 3600, 'Conseil d architecture, d urbanisme et de l environnement de la Corrèze (19) ; corpus ligne 3.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-pro-rge-correze', 'Pro-RGE — Entreprises RGE en Corrèze', 'cti', 'https://pro-rge.fr/entreprises/correze-19/', 'annuaire professionnel public', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":4}}'::jsonb, 86400, 'Annuaire des professionnels RGE de la Corrèze (19), travaux et renovation ; corpus ligne 4.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-la-montagne-correze', 'La Montagne — Corrèze', 'presse', 'https://www.lamontagne.fr/correze/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":5}}'::jsonb, 3600, 'Presse quotidienne locale de la Corrèze (19) ; corpus ligne 5.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-actu-fr-correze', 'actu.fr — Corrèze', 'presse', 'https://actu.fr/nouvelle-aquitaine/correze_19/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":6}}'::jsonb, 3600, 'Presse en ligne de la Corrèze (19) ; corpus ligne 6.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-france-3-correze', 'France 3 Nouvelle-Aquitaine — Corrèze', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":7}}'::jsonb, 3600, 'Television publique locale de la Corrèze (19) ; corpus ligne 7.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-ici-correze', 'ici Corrèze — Radio France', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":8}}'::jsonb, 3600, 'Radio publique locale de la Corrèze (19) ; corpus ligne 8.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-tulle-agglo', 'Tulle agglo — Actualités', 'cti', 'https://www.tulleagglo.fr/lagglo/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":9}}'::jsonb, 3600, 'Actualites de Tulle agglo (19), urbanisme, habitat et construction ; corpus ligne 9.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-la-vie-correzienne', 'La Vie Corrézienne — Actualités', 'presse', 'https://www.laviecorrezienne.fr/actualites-actualites.html', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":10}}'::jsonb, 3600, 'Hebdomadaire local de la Corrèze (19) ; corpus ligne 10.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-prefecture-correze', 'Préfecture de la Corrèze — Actualités', 'cti', 'https://www.correze.gouv.fr/Actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":11}}'::jsonb, 3600, 'Services de l Etat en Corrèze (19), urbanisme et construction ; corpus ligne 11.', 'Nouvelle-Aquitaine', '19'),
  ('corpus:batiment-19-brive-la-gaillarde', 'Ville de Brive-la-Gaillarde — Actualités', 'cti', 'https://www.brive.fr/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-19.jsonl","ligne":12}}'::jsonb, 3600, 'Actualites de Brive-la-Gaillarde (19), urbanisme et habitat ; corpus ligne 12.', 'Nouvelle-Aquitaine', '19')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;
