-- Sources d'information du secteur « juridique » du département 79 (Deux-Sèvres).
-- 18 sources, 44 URL uniques contrôlées en HTTP 200 le 2026-11-22
-- (GET avec User-Agent navigateur, redirections suivies, 12 flux avec items ;
-- 9 articles cyber vérifiés ; 52 traces source_verification).
-- Corpus détaillé : bench/corpus/sources-juridique-79.jsonl
-- Preuve HTTP : bench/results/verification-sources-juridique-79.json

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
  ('corpus:juridique-79-e-niort-rubrique-faits-divers-et-justice', 'E.Niort — rubrique faits divers et justice', 'cti', 'https://eniort.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 1'),
  ('corpus:juridique-79-ici-poitou-actualites-niort-et-deux-sevres', 'ICI Poitou — actualités Niort et Deux-Sèvres', 'cti', 'https://www.ici.fr/poitou', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 2'),
  ('corpus:juridique-79-actu-fr-actu-deux-sevres', 'actu.fr — Actu Deux-Sèvres', 'cti', 'https://actu.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 3'),
  ('corpus:juridique-79-la-nouvelle-republique-deux-sevres-faits-divers-et-justice', 'La Nouvelle République — Deux-Sèvres, faits divers et justice', 'cti', 'https://www.lanouvellerepublique.fr/deux-sevres', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 4'),
  ('corpus:juridique-79-niort-info-rubrique-justice', 'Niort info — rubrique justice', 'cti', 'https://niortinfo.media/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 5'),
  ('corpus:juridique-79-tribunal-judiciaire-de-niort', 'Tribunal judiciaire de Niort', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-judiciaire-de-niort', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 6'),
  ('corpus:juridique-79-tribunal-de-commerce-de-niort', 'Tribunal de commerce de Niort', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-de-commerce-de-niort', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 7'),
  ('corpus:juridique-79-cour-d-appel-de-poitiers-ressort-du-79', 'Cour d''appel de Poitiers (ressort du 79)', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/cour-d-appel-de-poitiers', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 8'),
  ('corpus:juridique-79-ministere-de-la-justice-actualites-et-annuaire', 'Ministère de la Justice — actualités et annuaire', 'cti', 'https://www.justice.gouv.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 9'),
  ('corpus:juridique-79-avocat-fr-actualites-du-barreau', 'Avocat.fr — actualités du barreau', 'cti', 'https://www.avocat.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 10'),
  ('corpus:juridique-79-chambre-nationale-des-commissaires-de-justice', 'Chambre nationale des commissaires de justice', 'cti', 'https://commissaire-justice.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 11'),
  ('corpus:juridique-79-notaires-fr-annuaire-et-actualites-des-notaires', 'Notaires.fr — annuaire et actualités des notaires', 'cti', 'https://www.notaires.fr/fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 12'),
  ('corpus:juridique-79-barreau-des-deux-sevres-avocats-de-niort', 'Barreau des Deux-Sèvres — avocats de Niort', 'cti', 'https://www.avocats-deux-sevres.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 13'),
  ('corpus:juridique-79-petites-affiches-annuaire-des-avocats-du-barreau-de-niort', 'Petites Affiches — annuaire des avocats du barreau de Niort', 'cti', 'https://www.petitesaffiches.fr/annuaire/avocats/barreau-niort.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 14'),
  ('corpus:juridique-79-gdroit-annuaire-du-barreau-des-deux-sevres', 'Gdroit — annuaire du barreau des Deux-Sèvres', 'cti', 'https://gdroit.fr/barreau/deux-sevres/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 15'),
  ('corpus:juridique-79-avocats-notaires-de-france-annuaire-des-deux-sevres', 'Avocats & Notaires de France — annuaire des Deux-Sèvres', 'cti', 'https://avocatsnotaires.fr/departement/deux-sevres/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 16'),
  ('corpus:juridique-79-dalloz-actualite-actualites-juridiques-et-cybersecurite', 'Dalloz Actualité — actualités juridiques et cybersécurité', 'cti', 'https://www.dalloz-actualite.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 17'),
  ('corpus:juridique-79-bureau-d-aide-juridictionnelle-du-tribunal-judiciaire-de-niort', 'Bureau d''aide juridictionnelle du tribunal judiciaire de Niort', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/bureau-d-aide-juridictionnelle-du-tribunal-judiciaire-de-niort', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-79.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source juridique — Deux-Sèvres (79) ; corpus ligne 18')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family, url = EXCLUDED.url,
  format = EXCLUDED.format, parser = EXCLUDED.parser, description = EXCLUDED.description,
  region = EXCLUDED.region, department = EXCLUDED.department;

WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-79-e-niort-rubrique-faits-divers-et-justice', 'https://eniort.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-e-niort-rubrique-faits-divers-et-justice', 'https://eniort.com/category/faits-divers-justice/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-e-niort-rubrique-faits-divers-et-justice', 'https://eniort.com/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:juridique-79-ici-poitou-actualites-niort-et-deux-sevres', 'https://www.ici.fr/poitou', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-ici-poitou-actualites-niort-et-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/niort', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-ici-poitou-actualites-niort-et-deux-sevres', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:juridique-79-actu-fr-actu-deux-sevres', 'https://actu.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-actu-fr-actu-deux-sevres', 'https://actu.fr/deux-sevres/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-actu-fr-actu-deux-sevres', 'https://actu.fr/deux-sevres/rss.xml', 'application/rss+xml; charset=utf-8', 20),
    ('corpus:juridique-79-la-nouvelle-republique-deux-sevres-faits-divers-et-justice', 'https://www.lanouvellerepublique.fr/deux-sevres', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-la-nouvelle-republique-deux-sevres-faits-divers-et-justice', 'https://www.lanouvellerepublique.fr/deux-sevres/faits-divers-justice', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-la-nouvelle-republique-deux-sevres-faits-divers-et-justice', 'https://www.lanouvellerepublique.fr/api/v1/rss/6705274cc13a66a7408b456a', 'application/rss+xml; charset=UTF-8', 40),
    ('corpus:juridique-79-niort-info-rubrique-justice', 'https://niortinfo.media/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-niort-info-rubrique-justice', 'https://niortinfo.media/category/justice/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-niort-info-rubrique-justice', 'https://niortinfo.media/category/justice/feed/', 'application/rss+xml; charset=UTF-8', 6),
    ('corpus:juridique-79-tribunal-judiciaire-de-niort', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-judiciaire-de-niort', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-tribunal-judiciaire-de-niort', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-tribunal-judiciaire-de-niort', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-79-tribunal-de-commerce-de-niort', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-de-commerce-de-niort', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-tribunal-de-commerce-de-niort', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-tribunal-de-commerce-de-niort', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-79-cour-d-appel-de-poitiers-ressort-du-79', 'https://www.justice.gouv.fr/annuaire/fiche/cour-d-appel-de-poitiers', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-cour-d-appel-de-poitiers-ressort-du-79', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-cour-d-appel-de-poitiers-ressort-du-79', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-79-ministere-de-la-justice-actualites-et-annuaire', 'https://www.justice.gouv.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-ministere-de-la-justice-actualites-et-annuaire', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-ministere-de-la-justice-actualites-et-annuaire', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-79-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-79-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/feed/', 'text/xml;charset=UTF-8', 10),
    ('corpus:juridique-79-notaires-fr-annuaire-et-actualites-des-notaires', 'https://www.notaires.fr/fr', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-notaires-fr-annuaire-et-actualites-des-notaires', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-barreau-des-deux-sevres-avocats-de-niort', 'https://www.avocats-deux-sevres.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-barreau-des-deux-sevres-avocats-de-niort', 'https://www.avocats-deux-sevres.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-barreau-des-deux-sevres-avocats-de-niort', 'https://www.avocats-deux-sevres.fr/feed/', 'application/rss+xml; charset=UTF-8', 6),
    ('corpus:juridique-79-petites-affiches-annuaire-des-avocats-du-barreau-de-niort', 'https://www.petitesaffiches.fr/annuaire/avocats/barreau-niort.html', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-petites-affiches-annuaire-des-avocats-du-barreau-de-niort', 'https://www.petitesaffiches.fr/actualites,069/droit,044/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-petites-affiches-annuaire-des-avocats-du-barreau-de-niort', 'https://www.petitesaffiches.fr/feed/', 'text/xml; charset=utf-8', 10),
    ('corpus:juridique-79-gdroit-annuaire-du-barreau-des-deux-sevres', 'https://gdroit.fr/barreau/deux-sevres/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-gdroit-annuaire-du-barreau-des-deux-sevres', 'https://gdroit.fr/page-generale-fiches/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-gdroit-annuaire-du-barreau-des-deux-sevres', 'https://gdroit.fr/feed/', 'application/rss+xml', 8),
    ('corpus:juridique-79-avocats-notaires-de-france-annuaire-des-deux-sevres', 'https://avocatsnotaires.fr/departement/deux-sevres/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-avocats-notaires-de-france-annuaire-des-deux-sevres', 'https://avocatsnotaires.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-79-dalloz-actualite-actualites-juridiques-et-cybersecurite', 'https://www.dalloz-actualite.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-dalloz-actualite-actualites-juridiques-et-cybersecurite', 'https://www.dalloz-actualite.fr/editions-precedentes/2026-11', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-dalloz-actualite-actualites-juridiques-et-cybersecurite', 'https://www.dalloz-actualite.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-79-bureau-d-aide-juridictionnelle-du-tribunal-judiciaire-de-niort', 'https://www.justice.gouv.fr/annuaire/fiche/bureau-d-aide-juridictionnelle-du-tribunal-judiciaire-de-niort', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-bureau-d-aide-juridictionnelle-du-tribunal-judiciaire-de-niort', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-79-bureau-d-aide-juridictionnelle-du-tribunal-judiciaire-de-niort', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(),
       'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', 'ok200',
       'Corpus juridique-79 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
