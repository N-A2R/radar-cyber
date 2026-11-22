-- Sources d'information du secteur « agriculture » du département 40 (Landes).
-- 15 sources, 30 URLs contrôlées en HTTP 200 le 2026-11-22 (scripts/verifier-sources.mts, GET avec User-Agent navigateur, redirections suivies, 3 flux RSS).
-- Corpus détaillé : bench/corpus/sources-agriculture-40.jsonl
-- Preuve HTTP : bench/results/verification-agriculture-40.json

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
  ('corpus:agriculture-40-fdsea-des-landes', 'FDSEA des Landes', 'presse', 'http://fdsea40.sacea.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 1'),
  ('corpus:agriculture-40-modef-40', 'MODEF 40', 'presse', 'https://www.modef40.fr/notre-actu/le-fil-infos', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 2'),
  ('corpus:agriculture-40-chambre-d-agriculture-des-landes', 'Chambre d''agriculture des Landes', 'presse', 'https://landes.chambres-agriculture.fr/actualites-1', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 3'),
  ('corpus:agriculture-40-cerfrance-adour-ocean-landes', 'Cerfrance Adour-Océan (Landes)', 'presse', 'https://www.cerfrance-adourocean.fr/actualites.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 4'),
  ('corpus:agriculture-40-safer-nouvelle-aquitaine-antenne-landes', 'SAFER Nouvelle-Aquitaine (antenne Landes)', 'presse', 'https://www.saferna.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 5'),
  ('corpus:agriculture-40-federation-regionale-des-cuma-nouvelle-aquitaine', 'Fédération régionale des Cuma Nouvelle-Aquitaine', 'presse', 'https://nouvelle-aquitaine.cuma.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 6'),
  ('corpus:agriculture-40-fncuma-annuaire-federation-cuma-landes', 'FNCuma — annuaire fédération Cuma Landes', 'presse', 'https://www.cuma.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 7'),
  ('corpus:agriculture-40-annuaire-des-chambres-d-agriculture-france', 'Annuaire des Chambres d''agriculture France', 'presse', 'https://chambres-agriculture.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 8'),
  ('corpus:agriculture-40-chambre-regionale-d-agriculture-nouvelle-aquitaine', 'Chambre régionale d''agriculture Nouvelle-Aquitaine', 'presse', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 9'),
  ('corpus:agriculture-40-ici-landes-radio-france', 'ICI Landes (Radio France)', 'presse', 'https://www.ici.fr/nouvelle-aquitaine/landes-40/actu', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 10'),
  ('corpus:agriculture-40-france-3-nouvelle-aquitaine-landes', 'France 3 Nouvelle-Aquitaine — Landes', 'presse', 'https://france3-regions.franceinfo.fr/economie/agriculture', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 11'),
  ('corpus:agriculture-40-actu-fr-landes', 'actu.fr — Landes', 'presse', 'https://actu.fr/nouvelle-aquitaine/landes_40/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 12'),
  ('corpus:agriculture-40-le-parisien-landes-40', 'Le Parisien — Landes (40)', 'presse', 'https://www.leparisien.fr/landes-40/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 13'),
  ('corpus:agriculture-40-reussir-presse-agricole-specialisee', 'Réussir (presse agricole spécialisée)', 'presse', 'https://www.reussir.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 14'),
  ('corpus:agriculture-40-la-france-agricole', 'La France Agricole', 'presse', 'https://www.lafranceagricole.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-40.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Source agriculture — Landes (40) ; corpus ligne 15');

WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:agriculture-40-fdsea-des-landes', 'http://fdsea40.sacea.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-modef-40', 'https://www.modef40.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-modef-40', 'https://www.modef40.fr/notre-actu/le-fil-infos', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-chambre-d-agriculture-des-landes', 'https://landes.chambres-agriculture.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-chambre-d-agriculture-des-landes', 'https://landes.chambres-agriculture.fr/actualites-1', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-cerfrance-adour-ocean-landes', 'https://www.cerfrance-adourocean.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-cerfrance-adour-ocean-landes', 'https://www.cerfrance-adourocean.fr/actualites.html', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-safer-nouvelle-aquitaine-antenne-landes', 'https://www.saferna.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-safer-nouvelle-aquitaine-antenne-landes', 'https://www.saferna.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-safer-nouvelle-aquitaine-antenne-landes', 'https://www.saferna.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-40-federation-regionale-des-cuma-nouvelle-aquitaine', 'https://nouvelle-aquitaine.cuma.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-federation-regionale-des-cuma-nouvelle-aquitaine', 'https://nouvelle-aquitaine.cuma.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-fncuma-annuaire-federation-cuma-landes', 'https://www.cuma.fr/contacter-une-federation/?_fselect_department=40', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-fncuma-annuaire-federation-cuma-landes', 'https://www.cuma.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-annuaire-des-chambres-d-agriculture-france', 'https://chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-annuaire-des-chambres-d-agriculture-france', 'https://chambres-agriculture.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-chambre-regionale-d-agriculture-nouvelle-aquitaine', 'https://nouvelle-aquitaine.chambres-agriculture.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-chambre-regionale-d-agriculture-nouvelle-aquitaine', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-ici-landes-radio-france', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-ici-landes-radio-france', 'https://www.ici.fr/nouvelle-aquitaine/landes-40/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-france-3-nouvelle-aquitaine-landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-france-3-nouvelle-aquitaine-landes', 'https://france3-regions.franceinfo.fr/economie/agriculture', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-40-actu-fr-landes', 'https://actu.fr/nouvelle-aquitaine/landes_40/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-le-parisien-landes-40', 'https://www.leparisien.fr/landes-40/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-le-parisien-landes-40', 'https://www.leparisien.fr/landes-40/rss.xml', 'application/xml; charset=utf-8', 100),
    ('corpus:agriculture-40-reussir-presse-agricole-specialisee', 'https://www.reussir.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-reussir-presse-agricole-specialisee', 'https://www.reussir.fr/fil-actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-reussir-presse-agricole-specialisee', 'https://www.reussir.fr/rss.xml', 'application/xml;charset=UTF-8', 20),
    ('corpus:agriculture-40-la-france-agricole', 'https://www.lafranceagricole.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-40-la-france-agricole', 'https://www.lafranceagricole.fr/actualites/', 'text/html; charset=utf-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', 'ok200',
       'Corpus agriculture-40 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
