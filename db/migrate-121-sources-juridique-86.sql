-- Sources d'information du secteur « juridique » du département 86 (Vienne).
-- 12 sources, 36 URL uniques contrôlées en HTTP 200 le 2026-11-22
-- (GET avec User-Agent navigateur, redirections suivies, 7 flux avec items).
-- Corpus détaillé : bench/corpus/sources-juridique-86.jsonl
-- Preuve HTTP : bench/results/verification-sources-juridique-86.json

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
  ('corpus:juridique-86-ordre-des-avocats-de-poitiers-barreau-de-la-vienne-86', 'Ordre des avocats de Poitiers — barreau de la Vienne (86)', 'cti', 'https://www.avocats-poitiers.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 1'),
  ('corpus:juridique-86-conseil-national-des-barreaux-actualites-de-la-profession', 'Conseil national des barreaux — actualités de la profession', 'cti', 'https://cnb.avocat.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 2'),
  ('corpus:juridique-86-chambre-regionale-des-commissaires-de-justice-de-la-cour-dappel-de-poitiers', 'Chambre régionale des commissaires de justice de la Cour d’appel de Poitiers', 'cti', 'https://www.crcjpoitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 3'),
  ('corpus:juridique-86-chambre-interdepartementale-des-notaires-datlantique-poitou-17-79-85-86', 'Chambre interdépartementale des notaires d’Atlantique-Poitou (17-79-85-86)', 'cti', 'https://atlantiquepoitou.notaires.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 4'),
  ('corpus:juridique-86-notaires-fr-annuaire-et-actualites-des-notaires', 'Notaires.fr — annuaire et actualités des notaires', 'cti', 'https://www.notaires.fr/fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 5'),
  ('corpus:juridique-86-cdad-de-la-vienne-conseil-departemental-de-lacces-au-droit', 'CDAD de la Vienne — Conseil départemental de l’accès au droit', 'cti', 'https://www.cdad-vienne.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 6'),
  ('corpus:juridique-86-tribunal-judiciaire-de-poitiers-annuaire-officiel-justice', 'Tribunal judiciaire de Poitiers — annuaire officiel Justice', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-judiciaire-de-poitiers', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 7'),
  ('corpus:juridique-86-gdroit-annuaire-du-barreau-de-poitiers-86', 'Gdroit — annuaire du barreau de Poitiers (86)', 'cti', 'https://gdroit.fr/barreau/poitiers/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 8'),
  ('corpus:juridique-86-petites-affiches-annuaire-des-avocats-du-barreau-de-poitiers', 'Petites Affiches — annuaire des avocats du barreau de Poitiers', 'cti', 'https://www.petitesaffiches.fr/annuaire/avocats/barreau-poitiers.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 9'),
  ('corpus:juridique-86-la-nouvelle-republique-vienne-faits-divers-et-justice', 'La Nouvelle République — Vienne, faits divers et justice', 'cti', 'https://www.lanouvellerepublique.fr/vienne/faits-divers-justice', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 10'),
  ('corpus:juridique-86-ici-poitou-actualites-de-la-vienne-86', 'ICI Poitou — actualités de la Vienne (86)', 'cti', 'https://www.ici.fr/poitou', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 11'),
  ('corpus:juridique-86-le7-info-rubrique-justice-de-la-vienne-86', 'Le7.info — rubrique justice de la Vienne (86)', 'cti', 'https://www.le7.info/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-86.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source juridique — Vienne (86) ; corpus ligne 12')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family, url = EXCLUDED.url,
  format = EXCLUDED.format, parser = EXCLUDED.parser, description = EXCLUDED.description,
  region = EXCLUDED.region, department = EXCLUDED.department;

WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-86-ordre-des-avocats-de-poitiers-barreau-de-la-vienne-86', 'https://www.avocats-poitiers.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-ordre-des-avocats-de-poitiers-barreau-de-la-vienne-86', 'https://www.avocats-poitiers.com/notre-actualite/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-ordre-des-avocats-de-poitiers-barreau-de-la-vienne-86', 'https://www.avocats-poitiers.com/feed/', 'application/rss+xml; charset=UTF-8', 0),
    ('corpus:juridique-86-ordre-des-avocats-de-poitiers-barreau-de-la-vienne-86', 'https://www.lanouvellerepublique.fr/poitiers/un-cabinet-d-avocats-frappe-par-une-cyberattaque', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-conseil-national-des-barreaux-actualites-de-la-profession', 'https://cnb.avocat.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-conseil-national-des-barreaux-actualites-de-la-profession', 'https://cnb.avocat.fr/nos-actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-conseil-national-des-barreaux-actualites-de-la-profession', 'https://cnb.avocat.fr/actualite/menaces-cyber-le-cnb-fait-le-point', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-chambre-regionale-des-commissaires-de-justice-de-la-cour-dappel-de-poitiers', 'https://www.crcjpoitiers.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-chambre-regionale-des-commissaires-de-justice-de-la-cour-dappel-de-poitiers', 'https://www.crcjpoitiers.fr/feed/', 'text/xml;charset=UTF-8', 1),
    ('corpus:juridique-86-chambre-regionale-des-commissaires-de-justice-de-la-cour-dappel-de-poitiers', 'https://www.lanouvellerepublique.fr/poitiers/un-cabinet-d-avocats-frappe-par-une-cyberattaque', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-chambre-interdepartementale-des-notaires-datlantique-poitou-17-79-85-86', 'https://atlantiquepoitou.notaires.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-chambre-interdepartementale-des-notaires-datlantique-poitou-17-79-85-86', 'https://atlantiquepoitou.notaires.fr/actualite', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-chambre-interdepartementale-des-notaires-datlantique-poitou-17-79-85-86', 'https://www.lanouvellerepublique.fr/poitiers/un-cabinet-d-avocats-frappe-par-une-cyberattaque', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-notaires-fr-annuaire-et-actualites-des-notaires', 'https://www.notaires.fr/fr', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-notaires-fr-annuaire-et-actualites-des-notaires', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-notaires-fr-annuaire-et-actualites-des-notaires', 'https://www.lanouvellerepublique.fr/poitiers/un-cabinet-d-avocats-frappe-par-une-cyberattaque', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-cdad-de-la-vienne-conseil-departemental-de-lacces-au-droit', 'https://www.cdad-vienne.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-cdad-de-la-vienne-conseil-departemental-de-lacces-au-droit', 'https://www.cdad-vienne.fr/category/vos-droits/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-cdad-de-la-vienne-conseil-departemental-de-lacces-au-droit', 'https://www.lanouvellerepublique.fr/vienne/grand-poitiers/cyberattaque-des-reseaux-de-poitiers-et-grand-poitiers-elle-voulait-crypter-nos-donnees-avec-demande-de-rancon-nous-l-avons-stoppee-1757000752', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-tribunal-judiciaire-de-poitiers-annuaire-officiel-justice', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-judiciaire-de-poitiers', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-tribunal-judiciaire-de-poitiers-annuaire-officiel-justice', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-tribunal-judiciaire-de-poitiers-annuaire-officiel-justice', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-86-tribunal-judiciaire-de-poitiers-annuaire-officiel-justice', 'https://www.lanouvellerepublique.fr/poitiers/un-cabinet-d-avocats-frappe-par-une-cyberattaque', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-gdroit-annuaire-du-barreau-de-poitiers-86', 'https://gdroit.fr/barreau/poitiers/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-gdroit-annuaire-du-barreau-de-poitiers-86', 'https://gdroit.fr/page-generale-fiches/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-gdroit-annuaire-du-barreau-de-poitiers-86', 'https://gdroit.fr/feed/', 'application/rss+xml', 8),
    ('corpus:juridique-86-gdroit-annuaire-du-barreau-de-poitiers-86', 'https://cnb.avocat.fr/actualite/menaces-cyber-le-cnb-fait-le-point', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-petites-affiches-annuaire-des-avocats-du-barreau-de-poitiers', 'https://www.petitesaffiches.fr/annuaire/avocats/barreau-poitiers.html', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-petites-affiches-annuaire-des-avocats-du-barreau-de-poitiers', 'https://www.petitesaffiches.fr/actualites,069/droit,044/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-petites-affiches-annuaire-des-avocats-du-barreau-de-poitiers', 'https://www.petitesaffiches.fr/feed/', 'text/xml; charset=utf-8', 10),
    ('corpus:juridique-86-petites-affiches-annuaire-des-avocats-du-barreau-de-poitiers', 'https://www.petitesaffiches.fr/actualites,069/tech,080/sophia-optivalue-ai-a-recu-le,47775.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-la-nouvelle-republique-vienne-faits-divers-et-justice', 'https://www.lanouvellerepublique.fr/vienne/faits-divers-justice', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-la-nouvelle-republique-vienne-faits-divers-et-justice', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'application/rss+xml; charset=UTF-8', 40),
    ('corpus:juridique-86-la-nouvelle-republique-vienne-faits-divers-et-justice', 'https://www.lanouvellerepublique.fr/vienne/grand-poitiers/cyberattaque-des-reseaux-de-poitiers-et-grand-poitiers-elle-voulait-crypter-nos-donnees-avec-demande-de-rancon-nous-l-avons-stoppee-1757000752', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-86-ici-poitou-actualites-de-la-vienne-86', 'https://www.ici.fr/poitou', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-ici-poitou-actualites-de-la-vienne-86', 'https://www.ici.fr/nouvelle-aquitaine/vienne-86', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-ici-poitou-actualites-de-la-vienne-86', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:juridique-86-ici-poitou-actualites-de-la-vienne-86', 'https://www.ici.fr/nouvelle-aquitaine/vienne-86/poitiers/les-collectivites-de-poitiers-et-grand-poitiers-victimes-d-une-importante-cyberattaque-7518733', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-le7-info-rubrique-justice-de-la-vienne-86', 'https://www.le7.info/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-le7-info-rubrique-justice-de-la-vienne-86', 'https://www.le7.info/tag/38-justice', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-86-le7-info-rubrique-justice-de-la-vienne-86', 'https://www.le7.info/rss.xml', 'text/html; charset=UTF-8', 10),
    ('corpus:juridique-86-le7-info-rubrique-justice-de-la-vienne-86', 'https://www.le7.info/article/27884-poitiers-cinq-mineurs-poursuivis-pour-violences-et-cyberharcelement', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(),
       'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', 'ok200',
       'Corpus juridique-86 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
