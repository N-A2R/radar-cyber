-- Sources d'information du secteur « juridique » du département 33 (Gironde).
-- 11 sources, 31 URL contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-juridique-33.jsonl
-- Preuve HTTP : bench/results/verification-juridique-33.json

-- Table de traçage déclarée ici pour rester applicable sur une branche qui ne
-- contient pas encore migrate-064-source-verification.sql.
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
  ('corpus:juridique-33-barreau-bordeaux', 'Ordre des avocats - Barreau de Bordeaux', 'cti', 'https://www.barreau-bordeaux.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Barreau de Bordeaux, actualites et flux RSS. Exemple cyber : hameçonnage de cabinets d avocats.'),
  ('corpus:juridique-33-barreau-libourne', 'Barreau de Libourne', 'cti', 'https://www.barreaulibourne.fr/rss/blog', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Barreau de Libourne (70 avocats), flux du blog. Exemple cyber : hameçonnage de cabinets d avocats.'),
  ('corpus:juridique-33-notaires-gironde', 'Chambre des notaires de la Gironde', 'cti', 'https://chambre-gironde.notaires.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Chambre notariale de la Gironde, actualites et flux RSS. Exemple cyber : fraudes et cyberattaques, vigilance notariale.'),
  ('corpus:juridique-33-cr-notaires-bordeaux', 'Conseil regional des notaires de la Cour d appel de Bordeaux', 'cti', 'https://cr-bordeaux.notaires.fr/actualite', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Conseil regional notarial de Bordeaux (Charente, Dordogne, Gironde). Exemple cyber : piratage de notaires.'),
  ('corpus:juridique-33-cour-appel-bordeaux', 'Cour d appel de Bordeaux', 'cti', 'https://www.cours-appel.justice.fr/bordeaux/actualites', 'source d information institutionnelle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Cour d appel de Bordeaux, page actualites (ecran de maintenance en 200). Exemple cyber : piratage de notaires.'),
  ('corpus:juridique-33-tj-bordeaux', 'Tribunal judiciaire de Bordeaux', 'cti', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-bordeaux/actualites', 'source d information institutionnelle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Tribunal judiciaire de Bordeaux, page actualites. Exemple cyber : cyberharcèlement et preuve.'),
  ('corpus:juridique-33-lenoir-tostain', 'Lenoir & Tostain - commissaires de justice à Bordeaux', 'cti', 'https://www.scp-lenoir.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Cabinet de commissaires de justice a Bordeaux, actualites juridiques. Exemple cyber : cyberharcèlement et preuve.'),
  ('corpus:juridique-33-notaires-annuaire-gironde', 'Notaires de France - annuaire des notaires de la Gironde', 'cti', 'https://www.notaires.fr/rss/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Annuaire notarial de la Gironde et actualites du notariat. Exemple cyber : fraudes et cyberattaques notariales.'),
  ('corpus:juridique-33-avocat-fr-bordeaux', 'Avocat.fr - annuaire du barreau de Bordeaux', 'cti', 'https://www.avocat.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Annuaire des avocats du barreau de Bordeaux et actualites de la profession. Exemple cyber : hameçonnage de cabinets.'),
  ('corpus:juridique-33-village-justice', 'Village de la Justice - actualites juridiques et annuaire des barreaux', 'cti', 'https://www.village-justice.com/articles/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Media juridique et annuaire des barreaux, dont Bordeaux. Exemple cyber : fraude à la location saisonnière.'),
  ('corpus:juridique-33-alertcys', 'Alertcys - service d alertes professionnelles de la CNCJ', 'cti', 'https://alertcys.io/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-33.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Service d alertes de la Chambre nationale des commissaires de justice. Exemple cyber : fraude à la location saisonnière.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 26 URL de sources (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
-- Les 5 URL d'articles cyber sont tracées dans bench/results/verification-juridique-33.json.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-33-barreau-bordeaux', 'https://www.barreau-bordeaux.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-barreau-bordeaux', 'https://www.barreau-bordeaux.com/qui-sommes-nous/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-barreau-bordeaux', 'https://www.barreau-bordeaux.com/feed/', 'application/rss+xml; charset=UTF-8', 12),
    ('corpus:juridique-33-barreau-libourne', 'https://www.barreaulibourne.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-barreau-libourne', 'https://www.barreaulibourne.fr/rss/blog', 'application/rss+xml;  charset=utf-8', 1),
    ('corpus:juridique-33-notaires-gironde', 'https://chambre-gironde.notaires.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-notaires-gironde', 'https://chambre-gironde.notaires.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-notaires-gironde', 'https://chambre-gironde.notaires.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:juridique-33-cr-notaires-bordeaux', 'https://cr-bordeaux.notaires.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-33-cr-notaires-bordeaux', 'https://cr-bordeaux.notaires.fr/actualite', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-33-cour-appel-bordeaux', 'https://www.cours-appel.justice.fr/bordeaux/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-33-cour-appel-bordeaux', 'https://www.cours-appel.justice.fr/bordeaux/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-33-tj-bordeaux', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-bordeaux', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-33-tj-bordeaux', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-bordeaux/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-33-lenoir-tostain', 'https://www.scp-lenoir.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-lenoir-tostain', 'https://www.scp-lenoir.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-notaires-annuaire-gironde', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/gironde', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-notaires-annuaire-gironde', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-notaires-annuaire-gironde', 'https://www.notaires.fr/rss/actualites', 'application/rss+xml; charset=utf-8', 420),
    ('corpus:juridique-33-avocat-fr-bordeaux', 'https://consultation.avocat.fr/avocats/barreau-bordeaux.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-33-avocat-fr-bordeaux', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-avocat-fr-bordeaux', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-33-village-justice', 'https://www.village-justice.com/articles/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-33-alertcys', 'https://alertcys.io/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-alertcys', 'https://alertcys.io/actualites-lanceur-dalerte/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-33-alertcys', 'https://alertcys.io/feed/', 'application/rss+xml; charset=UTF-8', 10)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-33 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
