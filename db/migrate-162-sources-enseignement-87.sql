-- Sources d'information du secteur « enseignement » du département 87 (Haute-Vienne).
-- 12 sources, 31 contrôles HTTP (28 URL uniques), tous en HTTP 200 le 2026-11-22.
-- GET avec User-Agent navigateur, redirections suivies, délai 25 s ; 7 flux RSS déclarés.
-- Corpus détaillé : bench/corpus/sources-enseignement-87.jsonl
-- Preuve HTTP : bench/results/verification-sources-enseignement-87.json

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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:enseignement-87-universite-limoges', 'Université de Limoges', 'presse', 'https://www.unilim.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 1'),
  ('corpus:enseignement-87-iae-limoges', 'IAE Limoges — École universitaire de management', 'presse', 'https://www.iae.unilim.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 2'),
  ('corpus:enseignement-87-dfca-limoges', 'Direction de la Formation Continue et de l''Apprentissage (Université de Limoges)', 'presse', 'https://www.unilim.fr/dfca/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 3'),
  ('corpus:enseignement-87-crous-limoges', 'CROUS de Limoges', 'presse', 'https://www.crous-limoges.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 4'),
  ('corpus:enseignement-87-lycee-turgot', 'Lycée Turgot (Limoges)', 'presse', 'https://www.lyc-turgot.ac-limoges.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 5'),
  ('corpus:enseignement-87-snes-limoges', 'SNES-FSU Limoges (section académique)', 'presse', 'https://www.limoges.snes.edu/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 6'),
  ('corpus:enseignement-87-fcpe-87', 'FCPE Haute-Vienne', 'presse', 'https://87.fcpe.asso.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 7'),
  ('corpus:enseignement-87-greta-limousin', 'GRETA du Limousin', 'presse', 'https://www.greta-du-limousin.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 8'),
  ('corpus:enseignement-87-annuaire-education', 'Annuaire de l''enseignement — Haute-Vienne', 'presse', 'https://annuaire-education.fr/departement/haute-vienne/087.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 9'),
  ('corpus:enseignement-87-lepopulaire-education', 'Le Populaire du Centre — rubrique Éducation', 'presse', 'https://www.lepopulaire.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 10'),
  ('corpus:enseignement-87-ici-limousin', 'ICI Limousin — Haute-Vienne (Radio France)', 'presse', 'https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 11'),
  ('corpus:enseignement-87-cma-haute-vienne', 'CMA Nouvelle-Aquitaine — Haute-Vienne', 'presse', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-haute-vienne', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-87.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Source enseignement — Haute-Vienne (87) ; corpus ligne 12')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  license = EXCLUDED.license,
  enabled = EXCLUDED.enabled,
  kind = EXCLUDED.kind,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  interval_sec = EXCLUDED.interval_sec,
  region = EXCLUDED.region,
  department = EXCLUDED.department,
  description = EXCLUDED.description;

WITH urls (source_id, url, content_type, items) AS (
  VALUES
    ('corpus:enseignement-87-universite-limoges', 'https://www.unilim.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-universite-limoges', 'https://www.unilim.fr/category/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-universite-limoges', 'https://www.unilim.fr/feed/', 'application/rss+xml; charset=UTF-8', 20),
    ('corpus:enseignement-87-iae-limoges', 'https://www.iae.unilim.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-iae-limoges', 'https://www.iae.unilim.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-iae-limoges', 'https://www.iae.unilim.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-87-dfca-limoges', 'https://www.unilim.fr/dfca/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-dfca-limoges', 'https://www.unilim.fr/dfca/feed/', 'application/rss+xml; charset=UTF-8', 8),
    ('corpus:enseignement-87-crous-limoges', 'https://www.crous-limoges.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-crous-limoges', 'https://www.crous-limoges.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-crous-limoges', 'https://www.crous-limoges.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-87-lycee-turgot', 'https://www.lyc-turgot.ac-limoges.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-lycee-turgot', 'https://www.lyc-turgot.ac-limoges.fr/?post_type=post', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-lycee-turgot', 'https://www.lyc-turgot.ac-limoges.fr/feed/', 'application/rss+xml; charset=UTF-8', 0),
    ('corpus:enseignement-87-snes-limoges', 'https://www.limoges.snes.edu/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-87-snes-limoges', 'https://www.limoges.snes.edu/spip.php?rubrique2', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-87-snes-limoges', 'https://www.limoges.snes.edu/spip.php?page=backend', 'text/xml; charset=utf-8', 10),
    ('corpus:enseignement-87-fcpe-87', 'https://87.fcpe.asso.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-87-fcpe-87', 'https://87.fcpe.asso.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-87-greta-limousin', 'https://www.greta-du-limousin.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-greta-limousin', 'https://www.greta-du-limousin.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-annuaire-education', 'https://annuaire-education.fr/departement/haute-vienne/087.html', 'text/html', 0),
    ('corpus:enseignement-87-lepopulaire-education', 'https://www.lepopulaire.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-87-lepopulaire-education', 'https://www.lepopulaire.fr/actualites/education', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-87-ici-limousin', 'https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-ici-limousin', 'https://www.ici.fr/rss/limousin/a-la-une.xml', 'application/xml', 40),
    ('corpus:enseignement-87-cma-haute-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-haute-vienne', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-87-cma-haute-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/evenements/rendez-vous-artisanat-haute-vienne', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', 'ok200',
       'Corpus enseignement-87 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
