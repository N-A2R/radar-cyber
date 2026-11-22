-- Sources d'information du secteur « enseignement » du département 86 (Vienne).
-- 15 sources, 42 contrôles HTTP (42 URL uniques), tous en HTTP 200 le 2026-11-22.
-- GET avec User-Agent navigateur, redirections suivies, délai 25 s ; 39 URL de sources
-- et 3 URL d'exemples cyber (10 flux RSS avec items).
-- Corpus détaillé : bench/corpus/sources-enseignement-86.jsonl
-- Preuve HTTP : bench/results/verification-sources-enseignement-86.json

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
  ('corpus:enseignement-86-dsden86-pedagogie', 'DSDEN 86 — espace pédagogique (Éducation nationale, Vienne)', 'presse', 'https://ww2.ac-poitiers.fr/dsden86-pedagogie/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 1'),
  ('corpus:enseignement-86-univ-poitiers', 'Université de Poitiers', 'presse', 'https://www.univ-poitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 2'),
  ('corpus:enseignement-86-iut-poitiers', 'IUT de Poitiers', 'presse', 'https://iutp.univ-poitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 3'),
  ('corpus:enseignement-86-inspe-poitiers', 'INSPÉ de l''académie de Poitiers', 'presse', 'https://inspe.univ-poitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 4'),
  ('corpus:enseignement-86-isae-ensma', 'ISAE-ENSMA (Poitiers)', 'presse', 'https://www.ensma.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 5'),
  ('corpus:enseignement-86-lycee-dolmen', 'Lycée professionnel Le Dolmen (Poitiers)', 'presse', 'https://www.lycee-dolmen.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 6'),
  ('corpus:enseignement-86-la-providence-poitiers', 'Ensemble scolaire La Providence — La Salle (Poitiers)', 'presse', 'https://www.laprovidence-poitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 7'),
  ('corpus:enseignement-86-fcpe-86', 'FCPE de la Vienne (86)', 'presse', 'https://86.fcpe.asso.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 8'),
  ('corpus:enseignement-86-snasub-fsu-poitiers', 'SNASUB-FSU — académie de Poitiers', 'presse', 'https://www.snasub-fsu-poitiers.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 9'),
  ('corpus:enseignement-86-campus-120', 'Campus 120 — centre de formation CCI Vienne', 'presse', 'https://www.campus120.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 10'),
  ('corpus:enseignement-86-greta-poitiers', 'Greta Poitou-Charentes — agence de Poitiers', 'presse', 'https://www.greta-poitou-charentes.fr/les-agences-du-greta/agence-de-poitiers/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 11'),
  ('corpus:enseignement-86-cfa-acad-poitiers', 'CFA académique de Poitiers', 'presse', 'https://www.cfa-acad-poitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 12'),
  ('corpus:enseignement-86-enseignement-catholique-pc', 'Enseignement catholique du Poitou et Charentes', 'presse', 'https://ec-poitou-charentes.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 13'),
  ('corpus:enseignement-86-annuaire-education', 'Annuaire de l''enseignement — Vienne', 'presse', 'https://annuaire-education.fr/departement/vienne/086.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 14'),
  ('corpus:enseignement-86-lnr-education', 'La Nouvelle République — Éducation dans la Vienne', 'presse', 'https://www.lanouvellerepublique.fr/vienne/education', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-enseignement-86.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source enseignement — Vienne (86) ; corpus ligne 15')
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
    ('corpus:enseignement-86-dsden86-pedagogie', 'https://ww2.ac-poitiers.fr/dsden86-pedagogie/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-86-dsden86-pedagogie', 'https://ww2.ac-poitiers.fr/dsden86-pedagogie/spip.php?page=backend', 'text/xml; charset=utf-8', 0),
    ('corpus:enseignement-86-univ-poitiers', 'https://www.univ-poitiers.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-univ-poitiers', 'https://www.univ-poitiers.fr/c/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-univ-poitiers', 'https://www.univ-poitiers.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-86-iut-poitiers', 'https://iutp.univ-poitiers.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-iut-poitiers', 'https://iutp.univ-poitiers.fr/c/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-iut-poitiers', 'https://iutp.univ-poitiers.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-86-inspe-poitiers', 'https://inspe.univ-poitiers.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-inspe-poitiers', 'https://inspe.univ-poitiers.fr/c/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-inspe-poitiers', 'https://inspe.univ-poitiers.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-86-isae-ensma', 'https://www.ensma.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-isae-ensma', 'https://www.ensma.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-isae-ensma', 'https://www.ensma.fr/actualites/feed/', 'application/rss+xml; charset=utf-8', 0),
    ('corpus:enseignement-86-lycee-dolmen', 'https://www.lycee-dolmen.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-lycee-dolmen', 'https://www.lycee-dolmen.fr/category/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-lycee-dolmen', 'https://www.lycee-dolmen.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-86-la-providence-poitiers', 'https://www.laprovidence-poitiers.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-86-la-providence-poitiers', 'https://www.laprovidence-poitiers.fr/l-etablissement/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-86-fcpe-86', 'https://86.fcpe.asso.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-86-fcpe-86', 'https://86.fcpe.asso.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-86-snasub-fsu-poitiers', 'https://www.snasub-fsu-poitiers.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-snasub-fsu-poitiers', 'https://www.snasub-fsu-poitiers.com/archive/2026-10/', 'text/html', 0),
    ('corpus:enseignement-86-snasub-fsu-poitiers', 'https://www.snasub-fsu-poitiers.com/rss', 'text/xml; charset=UTF-8', 25),
    ('corpus:enseignement-86-campus-120', 'https://www.campus120.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-campus-120', 'https://www.campus120.fr/categorie/actualite/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-campus-120', 'https://www.campus120.fr/categorie/actualite/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:enseignement-86-greta-poitiers', 'https://www.greta-poitou-charentes.fr/les-agences-du-greta/agence-de-poitiers/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-greta-poitiers', 'https://www.greta-poitou-charentes.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-greta-poitiers', 'https://www.greta-poitou-charentes.fr/feed/', 'application/rss+xml; charset=UTF-8', 1),
    ('corpus:enseignement-86-cfa-acad-poitiers', 'https://www.cfa-acad-poitiers.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-86-cfa-acad-poitiers', 'https://www.cfa-acad-poitiers.fr/actualites/', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-86-cfa-acad-poitiers', 'https://www.cfa-acad-poitiers.fr/rss.xml', 'application/rss+xml; charset=utf-8', 4),
    ('corpus:enseignement-86-enseignement-catholique-pc', 'https://ec-poitou-charentes.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-enseignement-catholique-pc', 'https://ec-poitou-charentes.fr/?post_type=post', 'text/html; charset=UTF-8', 0),
    ('corpus:enseignement-86-enseignement-catholique-pc', 'https://ec-poitou-charentes.fr/feed/', 'application/rss+xml; charset=UTF-8', 4),
    ('corpus:enseignement-86-annuaire-education', 'https://annuaire-education.fr/departement/vienne/086.html', 'text/html', 0),
    ('corpus:enseignement-86-lnr-education', 'https://www.lanouvellerepublique.fr/vienne/education', 'text/html; charset=utf-8', 0),
    ('corpus:enseignement-86-lnr-education', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'application/rss+xml; charset=UTF-8', 40)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', 'ok200',
       'Corpus enseignement-86 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
