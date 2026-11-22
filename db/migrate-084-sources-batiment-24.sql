-- Sources d'information du secteur bâtiment dans le département 24 (Dordogne).
-- 18 sources, 42 contrôles HTTP sur 42 URLs distinctes (sites, pages actualités et flux), toutes en 200 le 2026-11-22.
-- Corpus détaillé : bench/corpus/sources-batiment-24.jsonl
-- Preuve HTTP : bench/results/verification-sources-batiment-24.json

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
  ('corpus:batiment-24-capeb-24', 'CAPEB 24 — L''artisanat du bâtiment', 'cti', 'https://capeb24.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":1}}'::jsonb, 3600, 'Syndicat professionnel du bâtiment de la Dordogne (24) ; corpus ligne 1.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-caue-24', 'CAUE 24 — Conseil d''architecture, d''urbanisme et de l''environnement de la Dordogne', 'cti', 'https://cauedordogne.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":2}}'::jsonb, 3600, 'Conseil d architecture, d urbanisme et de l environnement de la Dordogne (24) ; corpus ligne 2.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-pro-rge-dordogne', 'Pro-RGE — Entreprises RGE en Dordogne', 'cti', 'https://pro-rge.fr/entreprises/dordogne-24/', 'annuaire professionnel public', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":3}}'::jsonb, 86400, 'Annuaire des professionnels RGE de la Dordogne (24), travaux et renovation ; corpus ligne 3.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-cma-nouvelle-aquitaine-dordogne', 'CMA Nouvelle-Aquitaine — antenne Dordogne (chambre des métiers et de l''artisanat)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":4}}'::jsonb, 3600, 'Chambre des metiers et de l artisanat couvrant la Dordogne (24) ; corpus ligne 4.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-cci-dordogne', 'CCI Dordogne — Chambre de commerce et d''industrie', 'cti', 'https://dordogne.cci.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":5}}'::jsonb, 3600, 'Chambre de commerce et d industrie de la Dordogne (24) ; corpus ligne 5.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-sud-ouest-dordogne', 'Sud Ouest — Dordogne', 'presse', 'https://www.sudouest.fr/dordogne/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":6}}'::jsonb, 3600, 'Presse quotidienne locale de la Dordogne (24) ; corpus ligne 6.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-dordogne-libre', 'Dordogne Libre', 'presse', 'https://www.dordognelibre.fr/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":7}}'::jsonb, 3600, 'Hebdomadaire local de la Dordogne (24) ; corpus ligne 7.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-reussir-le-perigord', 'Réussir le Périgord', 'presse', 'https://www.reussirleperigord.fr/feed', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":8}}'::jsonb, 3600, 'Hebdomadaire départemental de la Dordogne (24) ; corpus ligne 8.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-actu-fr-dordogne', 'actu.fr — Dordogne', 'presse', 'https://actu.fr/nouvelle-aquitaine/dordogne_24/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":9}}'::jsonb, 3600, 'Presse en ligne de la Dordogne (24) ; corpus ligne 9.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-france-3-dordogne', 'France 3 Nouvelle-Aquitaine — Dordogne', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":10}}'::jsonb, 3600, 'Television publique locale de la Dordogne (24) ; corpus ligne 10.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-ici-perigord', 'ICI Périgord — Dordogne (24)', 'presse', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":11}}'::jsonb, 3600, 'Radio publique locale de la Dordogne (24) ; corpus ligne 11.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-franceinfo-dordogne', 'franceinfo — Dordogne', 'presse', 'https://www.franceinfo.fr/france/nouvelle-aquitaine/dordogne/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":12}}'::jsonb, 3600, 'Media public numérique, fil Dordogne (24) ; corpus ligne 12.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-democrate-independant', 'Le Démocrate Indépendant — Bergerac', 'presse', 'https://www.ledemocratedebergerac.fr/feed/', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":13}}'::jsonb, 3600, 'Hebdomadaire local et JAL habilite de la Dordogne (24) ; corpus ligne 13.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-courrier-francais-dordogne', 'Le Courrier Français — Dordogne', 'presse', 'https://www.courrier-francais.com/actualites-dordogne.html', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":14}}'::jsonb, 3600, 'Hebdomadaire regional et JAL habilite de la Dordogne (24) ; corpus ligne 14.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-annonces-legales-dordogne', 'Annonces-légales.fr — Dordogne (24)', 'presse', 'https://www.annonces-legales.fr/actualite/feed/', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":15}}'::jsonb, 86400, 'Portail des annonces legales de la Dordogne (24) ; corpus ligne 15.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-ville-perigueux', 'Ville de Périgueux — Actualités', 'cti', 'https://perigueux.fr/actualites/flux-actualites/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":16}}'::jsonb, 3600, 'Actualites de Périgueux (24), urbanisme et habitat ; corpus ligne 16.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-ville-bergerac', 'Ville de Bergerac — Actualités', 'cti', 'https://www.bergerac.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":17}}'::jsonb, 3600, 'Actualites de Bergerac (24), urbanisme et habitat ; corpus ligne 17.', 'Nouvelle-Aquitaine', '24'),
  ('corpus:batiment-24-prefecture-dordogne-ddt', 'Préfecture de la Dordogne — DDT (urbanisme et construction)', 'cti', 'https://www.dordogne.gouv.fr/Actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-24.jsonl","ligne":18}}'::jsonb, 3600, 'Direction départementale des territoires de la Dordogne (24), permis de construire et urbanisme ; corpus ligne 18.', 'Nouvelle-Aquitaine', '24')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;
