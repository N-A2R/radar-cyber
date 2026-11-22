-- Sources d'information du secteur bâtiment dans le département 17 (Charente-Maritime).
-- 16 sources, 29 contrôles HTTP sur 29 URLs distinctes (sites, pages actualités et flux), toutes en 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-batiment-17.jsonl
-- Preuve HTTP : bench/results/verification-sources-batiment-17.json

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
  ('corpus:batiment-17-capeb-charente-maritime', 'CAPEB Charente-Maritime', 'cti', 'https://www.capeb.fr/charente-maritime/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":1}}'::jsonb, 3600, 'Syndicat professionnel du bâtiment de la Charente-Maritime (17) ; corpus ligne 1.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-cma-la-rochelle-charente-maritime', 'CMA La Rochelle — Charente-Maritime', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":2}}'::jsonb, 3600, 'Chambre des metiers et de l artisanat de la Charente-Maritime (17) ; corpus ligne 2.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-caue-17', 'CAUE 17 — Conseil d''architecture, d''urbanisme et de l''environnement de la Charente-Maritime', 'cti', 'https://www.caue17.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":3}}'::jsonb, 3600, 'Conseil d architecture, d urbanisme et de l environnement de la Charente-Maritime (17) ; corpus ligne 3.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-habitat17', 'Habitat17 — Office public de l''habitat de la Charente-Maritime', 'cti', 'https://www.habitat17.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":4}}'::jsonb, 3600, 'Office public de l habitat de la Charente-Maritime (17), construction et renovation ; corpus ligne 4.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-sud-ouest-charente-maritime', 'Sud Ouest — Charente-Maritime', 'presse', 'https://www.sudouest.fr/charente-maritime/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":5}}'::jsonb, 3600, 'Presse quotidienne locale de Charente-Maritime (17) ; corpus ligne 5.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-la-nouvelle-republique-charente-maritime', 'La Nouvelle République — Charente-Maritime', 'presse', 'https://www.lanouvellerepublique.fr/charente-maritime', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":6}}'::jsonb, 3600, 'Presse quotidienne locale de Charente-Maritime (17) ; corpus ligne 6.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-ici-charente-maritime-radio-france', 'ici Charente-Maritime — Radio France', 'presse', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":7}}'::jsonb, 3600, 'Radio publique locale de Charente-Maritime (17) ; corpus ligne 7.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-le-littoral', 'Le Littoral', 'presse', 'https://www.le-littoral.com/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":8}}'::jsonb, 3600, 'Hebdomadaire local de Charente-Maritime (17) ; corpus ligne 8.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-haute-saintonge', 'Haute Saintonge', 'presse', 'https://www.hautesaintonge.fr/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":9}}'::jsonb, 3600, 'Hebdomadaire local de Charente-Maritime (17) ; corpus ligne 9.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-l-hebdo-17', 'L''Hebdo 17', 'presse', 'https://www.lhebdo17.fr/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":10}}'::jsonb, 3600, 'Hebdomadaire du nord de la Charente-Maritime (17) ; corpus ligne 10.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-pro-rge-charente-maritime', 'Pro-RGE — Entreprises RGE en Charente-Maritime', 'cti', 'https://pro-rge.fr/entreprises/charente-maritime-17/', 'annuaire professionnel public', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":11}}'::jsonb, 86400, 'Annuaire des professionnels RGE de Charente-Maritime (17), travaux et renovation ; corpus ligne 11.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-inf-la-rochelle', 'INF la Rochelle', 'presse', 'https://inf-info.fr/feed/', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":12}}'::jsonb, 3600, 'Presse en ligne de La Rochelle et de la Charente-Maritime (17) ; corpus ligne 12.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-france-3-nouvelle-aquitaine-charente-maritime', 'France 3 Nouvelle-Aquitaine — Charente-Maritime', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente-maritime/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":13}}'::jsonb, 3600, 'Television publique locale de Charente-Maritime (17) ; corpus ligne 13.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-actu-fr-charente-maritime', 'actu.fr — Charente-Maritime', 'presse', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":14}}'::jsonb, 3600, 'Presse en ligne de Charente-Maritime (17) ; corpus ligne 14.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-helene-fm', 'Hélène FM', 'presse', 'https://www.helenefm.com/?feed=rss2', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":15}}'::jsonb, 3600, 'Radio locale de Charente-Maritime (17) ; corpus ligne 15.', 'Nouvelle-Aquitaine', '17'),
  ('corpus:batiment-17-l-angerien-libre', 'L''Angérien Libre', 'presse', 'https://www.langerienlibre.fr/actualites-actualites.html', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-17.jsonl","ligne":16}}'::jsonb, 3600, 'Hebdomadaire de Saint-Jean-d''Angely et de la Charente-Maritime (17) ; corpus ligne 16.', 'Nouvelle-Aquitaine', '17')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;
