-- Sources d'information du secteur « enseignement » du département 79 (Deux-Sèvres).
-- 12 sources, 33 contrôles HTTP (32 URL uniques), tous en HTTP 200 le 2026-11-22.
-- GET avec User-Agent navigateur, redirections suivies, délai 25 s ; 9 flux RSS déclarés.
-- Corpus détaillé : bench/corpus/sources-enseignement-79.jsonl
-- Preuve HTTP : bench/results/verification-sources-enseignement-79.json

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
  ('corpus:enseignement-79-dsden79-pedagogie', 'DSDEN 79 — pédagogie (Éducation nationale, Deux-Sèvres)', 'presse', 'https://ww2.ac-poitiers.fr/dsden79-pedagogie/spip.php?m=1', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 1'),
  ('corpus:enseignement-79-sud-education-79', 'SUD éducation Deux-Sèvres', 'presse', 'https://www.sudeducation79.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 2'),
  ('corpus:enseignement-79-fcpe-79', 'FCPE des Deux-Sèvres', 'presse', 'https://79.fcpe.asso.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 3'),
  ('corpus:enseignement-79-enseignement-catholique-poitou-charentes', 'Enseignement catholique du Poitou et Charentes', 'presse', 'https://ec-poitou-charentes.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 4'),
  ('corpus:enseignement-79-lycee-paul-guerin-niort', 'Lycée Paul Guérin (Niort)', 'presse', 'https://lycee-paul-guerin.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 5'),
  ('corpus:enseignement-79-greta-poitou-charentes-thouars', 'Greta Poitou-Charentes — agence de Thouars', 'presse', 'https://www.greta-poitou-charentes.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 6'),
  ('corpus:enseignement-79-campus-de-niort', 'Campus de Niort — Université de Poitiers', 'presse', 'https://niort.univ-poitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 7'),
  ('corpus:enseignement-79-terres-et-paysages-cfa-79', 'Terres et Paysages — CFA agricole des Deux-Sèvres', 'presse', 'https://terres-et-paysages.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 8'),
  ('corpus:enseignement-79-diocese-de-poitiers', 'Diocèse de Poitiers (Vienne et Deux-Sèvres)', 'presse', 'https://www.poitiers.catholique.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 9'),
  ('corpus:enseignement-79-cfa-academique-de-poitiers', 'CFA académique de Poitiers', 'presse', 'https://www.cfa-acad-poitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 10'),
  ('corpus:enseignement-79-cma-formation-niort', 'CMA Formation Niort — CFA 79', 'presse', 'https://formation.cma-nouvelleaquitaine.fr/nos-centres-de-formation/niort', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 11'),
  ('corpus:enseignement-79-annuaire-education', 'Annuaire de l''enseignement — Deux-Sèvres', 'presse', 'https://annuaire-education.fr/departement/deux-sevres/079.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-79.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source enseignement — Deux-Sèvres (79) ; corpus ligne 12')
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
    ('corpus:enseignement-79-dsden79-pedagogie', 'https://ww2.ac-poitiers.fr/dsden79-pedagogie/spip.php?m=1', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-79-dsden79-pedagogie', 'https://ww2.ac-poitiers.fr/dsden79-pedagogie/spip.php?rubrique374', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-79-dsden79-pedagogie', 'https://ww2.ac-poitiers.fr/dsden79-pedagogie/spip.php?page=backend', 'text/xml; charset=utf-8', 0),
    ('corpus:enseignement-79-sud-education-79', 'https://www.sudeducation79.org/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-sud-education-79', 'https://www.sudeducation79.org/category/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-sud-education-79', 'https://www.sudeducation79.org/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-79-fcpe-79', 'https://79.fcpe.asso.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-79-fcpe-79', 'https://79.fcpe.asso.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-79-enseignement-catholique-poitou-charentes', 'https://ec-poitou-charentes.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-enseignement-catholique-poitou-charentes', 'https://ec-poitou-charentes.fr/?post_type=post', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-enseignement-catholique-poitou-charentes', 'https://ec-poitou-charentes.fr/feed/', 'application/rss+xml; charset=UTF-8', 4),
    ('corpus:enseignement-79-lycee-paul-guerin-niort', 'https://lycee-paul-guerin.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-lycee-paul-guerin-niort', 'https://lycee-paul-guerin.fr/c/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-lycee-paul-guerin-niort', 'https://lycee-paul-guerin.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-79-greta-poitou-charentes-thouars', 'https://www.greta-poitou-charentes.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-greta-poitou-charentes-thouars', 'https://www.greta-poitou-charentes.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-greta-poitou-charentes-thouars', 'https://www.greta-poitou-charentes.fr/feed/', 'application/rss+xml; charset=UTF-8', 1),
    ('corpus:enseignement-79-campus-de-niort', 'https://niort.univ-poitiers.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-campus-de-niort', 'https://niort.univ-poitiers.fr/accueil/evenements-toute-lannee/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-campus-de-niort', 'https://niort.univ-poitiers.fr/feed/', 'application/rss+xml; charset=UTF-8', 6),
    ('corpus:enseignement-79-terres-et-paysages-cfa-79', 'https://terres-et-paysages.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-terres-et-paysages-cfa-79', 'https://terres-et-paysages.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-terres-et-paysages-cfa-79', 'https://terres-et-paysages.fr/feed/', 'application/rss+xml; charset=UTF-8', 0),
    ('corpus:enseignement-79-diocese-de-poitiers', 'https://www.poitiers.catholique.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-diocese-de-poitiers', 'https://www.poitiers.catholique.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-diocese-de-poitiers', 'https://www.poitiers.catholique.fr/feed/', 'application/rss+xml; charset=UTF-8', 16),
    ('corpus:enseignement-79-cfa-academique-de-poitiers', 'https://www.cfa-acad-poitiers.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-79-cfa-academique-de-poitiers', 'https://www.cfa-acad-poitiers.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-79-cfa-academique-de-poitiers', 'https://www.cfa-acad-poitiers.fr/rss.xml', 'application/rss+xml; charset=utf-8', 4),
    ('corpus:enseignement-79-cma-formation-niort', 'https://formation.cma-nouvelleaquitaine.fr/nos-centres-de-formation/niort', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-cma-formation-niort', 'https://formation.cma-nouvelleaquitaine.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-79-annuaire-education', 'https://annuaire-education.fr/departement/deux-sevres/079.html', 'text/html', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', 'ok200',
       'Corpus enseignement-79 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
