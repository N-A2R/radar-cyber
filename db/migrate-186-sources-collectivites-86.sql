-- Sources d'information du secteur « collectivites » du département 86 (Vienne).
-- 21 sources ; 57 traces de vérification sur 57 URL distinctes, toutes en HTTP 200 le 2026-11-22
-- (GET avec User-Agent navigateur, suivi des redirections, délai 25 s).
-- Corpus détaillé : bench/corpus/sources-collectivites-86.jsonl
-- Preuve HTTP : bench/results/verification-collectivites-86.json

BEGIN;

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
  ('corpus:collectivites-86-conseil-departemental-de-la-vienne', 'Conseil départemental de la Vienne', 'cti', 'https://www.lavienne86.fr/fil-infos/actualites/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Conseil départemental de la Vienne (86). Site et fil d actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-86-services-de-letat-dans-la-vienne', 'Services de l''État dans la Vienne (préfecture)', 'cti', 'https://www.vienne.gouv.fr/Actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Préfecture et services de l''État dans la Vienne (86). Vidéoprotection : indisponibilité temporaire du service de télédéclaration (03/11/2026).'),
  ('corpus:collectivites-86-ville-de-poitiers', 'Ville de Poitiers', 'cti', 'https://www.poitiers.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Ville de Poitiers (86). Cyberattaque du 29/08/2025 touchant la ville, le CCAS et Grand Poitiers — https://www.le7.info/article/25955-ccas-et-ville-de-poitiers-victimes-dune-cyberattaque'),
  ('corpus:collectivites-86-grand-poitiers-communaute-urbaine', 'Grand Poitiers Communauté urbaine', 'cti', 'https://www.grandpoitiers.fr/information-transversale/actualites/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Grand Poitiers Communauté urbaine (86). Cyberattaque des collectivités de Poitiers et Grand-Poitiers (02/09/2025) — https://www.ici.fr/nouvelle-aquitaine/vienne-86/poitiers/les-collectivites-de-poitiers-et-grand-poitiers-victimes-d-une-importante-cyberattaque-7518733'),
  ('corpus:collectivites-86-ville-de-chatellerault', 'Ville de Châtellerault', 'cti', 'https://www.chatellerault.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Ville de Châtellerault (86). Flux /feed/ en 200 mais sans item : url_flux laissée vide.'),
  ('corpus:collectivites-86-ville-de-la-roche-posay', 'Ville de La Roche-Posay', 'cti', 'https://www.larocheposay.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Ville de La Roche-Posay (86). Site, actualités et flux vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-86-ville-de-lusignan', 'Ville de Lusignan', 'cti', 'https://lusignan.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Ville de Lusignan (86). Site, actualités et flux vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-86-communaute-de-communes-vienne-et-gartempe', 'Communauté de communes Vienne et Gartempe', 'cti', 'https://www.vienneetgartempe.fr/actualites/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'CC Vienne et Gartempe (86). Réunion publique : stop aux arnaques de la rénovation (04/11/2026) — https://www.vienneetgartempe.fr/reunionpubliquehabitat/'),
  ('corpus:collectivites-86-communaute-de-communes-du-pays-loudunais', 'Communauté de communes du Pays Loudunais', 'cti', 'https://www.pays-loudunais.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Communauté de communes du Pays Loudunais (86). Site, actualités et flux vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-86-amf-86', 'AMF 86 (Association des maires de la Vienne)', 'cti', 'https://amf86.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Association des maires et présidents d intercommunalité de la Vienne (86).'),
  ('corpus:collectivites-86-cci-de-la-vienne', 'CCI de la Vienne', 'cti', 'https://www.poitiers.cci.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Chambre de commerce et d industrie de la Vienne (86), via le site poitiers.cci.fr.'),
  ('corpus:collectivites-86-grand-chatellerault', 'Grand Châtellerault', 'cti', 'https://www.grand-chatellerault.fr/vivre/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Communauté d agglomération Grand Châtellerault (86).'),
  ('corpus:collectivites-86-la-nouvelle-republique-vienne', 'La Nouvelle République — Vienne', 'cti', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Édition Vienne de La Nouvelle République. Cyberattaque de Poitiers et Grand Poitiers (02/09/2025) — https://www.lanouvellerepublique.fr/poitiers/vienne-poitiers-et-grand-poitiers-victimes-d-une-cyberattaque-depuis-vendredi-dernier-1756806836'),
  ('corpus:collectivites-86-centre-presse-vienne', 'Centre Presse (Vienne)', 'cti', 'https://www.lanouvellerepublique.fr/api/v1/rss/670536b0605bd4c91a8b4583', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Centre Presse, édition de la Vienne (86).'),
  ('corpus:collectivites-86-la-vienne-rurale-caracterres', 'La Vienne Rurale (Caracterres)', 'cti', 'https://www.caracterres.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Hebdomadaire La Vienne Rurale, éditeur Caracterres (86).'),
  ('corpus:collectivites-86-le7-info', 'Le7.info', 'cti', 'https://www.le7.info/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Le7.info, actualités de Poitiers et de la Vienne (86). Cyberattaque du CCAS et de la ville de Poitiers (02/09/2025) — https://www.le7.info/article/25955-ccas-et-ville-de-poitiers-victimes-dune-cyberattaque'),
  ('corpus:collectivites-86-ici-poitou-radio-france', 'ICI Poitou (Radio France)', 'cti', 'https://www.ici.fr/rss/poitou/a-la-une.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'ICI Poitou, rubrique Vienne (86). Cyberattaque des collectivités de Poitiers et Grand-Poitiers (02/09/2025) — https://www.ici.fr/nouvelle-aquitaine/vienne-86/poitiers/les-collectivites-de-poitiers-et-grand-poitiers-victimes-d-une-importante-cyberattaque-7518733'),
  ('corpus:collectivites-86-france-3-nouvelle-aquitaine-vienne', 'France 3 Nouvelle-Aquitaine — Vienne', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'France 3 Nouvelle-Aquitaine, édition Vienne (86).'),
  ('corpus:collectivites-86-radio-pulsar', 'Radio Pulsar', 'cti', 'https://www.radio-pulsar.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Radio Pulsar, média local de la Vienne (86).'),
  ('corpus:collectivites-86-actu-vienne-actu-fr', 'Actu Vienne (actu.fr)', 'cti', 'https://actu.fr/pays-de-la-loire/vienne_86/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Actu.fr, édition du département de la Vienne (86).'),
  ('corpus:collectivites-86-le-populaire-du-centre-poitiers', 'Le Populaire du Centre — Poitiers', 'cti', 'https://www.lepopulaire.fr/actualites/politique', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-86.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Le Populaire du Centre, édition de Poitiers (86).')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- 57 traces HTTP 200 vérifiées le 2026-11-22 (site, actualités, flux, article cyber).
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:collectivites-86-conseil-departemental-de-la-vienne', ARRAY['https://www.lavienne86.fr/', 'https://www.lavienne86.fr/fil-infos/actualites', 'https://www.lavienne86.fr/fil-infos/actualites/rss']),
    ('corpus:collectivites-86-services-de-letat-dans-la-vienne', ARRAY['https://www.vienne.gouv.fr/', 'https://www.vienne.gouv.fr/Actualites']),
    ('corpus:collectivites-86-ville-de-poitiers', ARRAY['https://www.poitiers.fr/', 'https://www.poitiers.fr/actualites', 'https://www.poitiers.fr/rss.xml', 'https://www.le7.info/article/25955-ccas-et-ville-de-poitiers-victimes-dune-cyberattaque']),
    ('corpus:collectivites-86-grand-poitiers-communaute-urbaine', ARRAY['https://www.grandpoitiers.fr/', 'https://www.grandpoitiers.fr/information-transversale/actualites', 'https://www.grandpoitiers.fr/information-transversale/actualites/rss', 'https://www.ici.fr/nouvelle-aquitaine/vienne-86/poitiers/les-collectivites-de-poitiers-et-grand-poitiers-victimes-d-une-importante-cyberattaque-7518733']),
    ('corpus:collectivites-86-ville-de-chatellerault', ARRAY['https://www.chatellerault.fr/', 'https://www.chatellerault.fr/actualites/', 'https://www.chatellerault.fr/feed/']),
    ('corpus:collectivites-86-ville-de-la-roche-posay', ARRAY['https://www.larocheposay.com/', 'https://www.larocheposay.com/systeme/actualites/', 'https://www.larocheposay.com/feed/']),
    ('corpus:collectivites-86-ville-de-lusignan', ARRAY['https://lusignan.fr/', 'https://lusignan.fr/actualites/', 'https://lusignan.fr/feed/']),
    ('corpus:collectivites-86-communaute-de-communes-vienne-et-gartempe', ARRAY['https://www.vienneetgartempe.fr/', 'https://www.vienneetgartempe.fr/actualites/', 'https://www.vienneetgartempe.fr/actualites/feed/', 'https://www.vienneetgartempe.fr/reunionpubliquehabitat/']),
    ('corpus:collectivites-86-communaute-de-communes-du-pays-loudunais', ARRAY['https://www.pays-loudunais.fr/', 'https://www.pays-loudunais.fr/category/actualites/', 'https://www.pays-loudunais.fr/feed/']),
    ('corpus:collectivites-86-amf-86', ARRAY['https://amf86.fr/', 'https://amf86.fr/actualites-de-lassociation/', 'https://amf86.fr/feed/']),
    ('corpus:collectivites-86-cci-de-la-vienne', ARRAY['https://www.poitiers.cci.fr/', 'https://www.poitiers.cci.fr/actualites/']),
    ('corpus:collectivites-86-grand-chatellerault', ARRAY['https://www.grand-chatellerault.fr/', 'https://www.grand-chatellerault.fr/vivre/actualites']),
    ('corpus:collectivites-86-la-nouvelle-republique-vienne', ARRAY['https://www.lanouvellerepublique.fr/vienne', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'https://www.lanouvellerepublique.fr/poitiers/vienne-poitiers-et-grand-poitiers-victimes-d-une-cyberattaque-depuis-vendredi-dernier-1756806836']),
    ('corpus:collectivites-86-centre-presse-vienne', ARRAY['https://www.lanouvellerepublique.fr/centre-presse', 'https://www.lanouvellerepublique.fr/api/v1/rss/670536b0605bd4c91a8b4583']),
    ('corpus:collectivites-86-la-vienne-rurale-caracterres', ARRAY['https://www.caracterres.fr/', 'https://www.caracterres.fr/region/vienne-rurale', 'https://www.caracterres.fr/rss.xml']),
    ('corpus:collectivites-86-le7-info', ARRAY['https://www.le7.info/', 'https://www.le7.info/actus', 'https://www.le7.info/rss.xml']),
    ('corpus:collectivites-86-ici-poitou-radio-france', ARRAY['https://www.ici.fr/radio/poitou', 'https://www.ici.fr/nouvelle-aquitaine/vienne-86', 'https://www.ici.fr/rss/poitou/a-la-une.xml']),
    ('corpus:collectivites-86-france-3-nouvelle-aquitaine-vienne', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss']),
    ('corpus:collectivites-86-radio-pulsar', ARRAY['https://www.radio-pulsar.org/', 'https://www.radio-pulsar.org/feed/']),
    ('corpus:collectivites-86-actu-vienne-actu-fr', ARRAY['https://actu.fr/pays-de-la-loire/vienne_86/']),
    ('corpus:collectivites-86-le-populaire-du-centre-poitiers', ARRAY['https://www.lepopulaire.fr/poitiers-86000/', 'https://www.lepopulaire.fr/actualites/politique'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-86 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://www.lavienne86.fr/', 'text/html; charset=utf-8'),
       ('https://www.lavienne86.fr/fil-infos/actualites', 'text/html; charset=utf-8'),
       ('https://www.lavienne86.fr/fil-infos/actualites/rss', 'text/xml;charset=utf-8'),
       ('https://www.vienne.gouv.fr/', 'text/html; charset=utf-8'),
       ('https://www.vienne.gouv.fr/Actualites', 'text/html; charset=utf-8'),
       ('https://www.poitiers.fr/', 'text/html; charset=UTF-8'),
       ('https://www.poitiers.fr/actualites', 'text/html; charset=UTF-8'),
       ('https://www.poitiers.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://www.le7.info/article/25955-ccas-et-ville-de-poitiers-victimes-dune-cyberattaque', 'text/html; charset=UTF-8'),
       ('https://www.grandpoitiers.fr/', 'text/html; charset=utf-8'),
       ('https://www.grandpoitiers.fr/information-transversale/actualites', 'text/html; charset=utf-8'),
       ('https://www.grandpoitiers.fr/information-transversale/actualites/rss', 'text/xml;charset=utf-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/vienne-86/poitiers/les-collectivites-de-poitiers-et-grand-poitiers-victimes-d-une-importante-cyberattaque-7518733', 'text/html; charset=UTF-8'),
       ('https://www.chatellerault.fr/', 'text/html; charset=UTF-8'),
       ('https://www.chatellerault.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.chatellerault.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.larocheposay.com/', 'text/html; charset=UTF-8'),
       ('https://www.larocheposay.com/systeme/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.larocheposay.com/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://lusignan.fr/', 'text/html; charset=UTF-8'),
       ('https://lusignan.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://lusignan.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.vienneetgartempe.fr/', 'text/html; charset=UTF-8'),
       ('https://www.vienneetgartempe.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.vienneetgartempe.fr/actualites/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.vienneetgartempe.fr/reunionpubliquehabitat/', 'text/html; charset=UTF-8'),
       ('https://www.pays-loudunais.fr/', 'text/html; charset=UTF-8'),
       ('https://www.pays-loudunais.fr/category/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.pays-loudunais.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://amf86.fr/', 'text/html; charset=UTF-8'),
       ('https://amf86.fr/actualites-de-lassociation/', 'text/html; charset=UTF-8'),
       ('https://amf86.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.poitiers.cci.fr/', 'text/html; charset=UTF-8'),
       ('https://www.poitiers.cci.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.grand-chatellerault.fr/', 'text/html;charset=UTF-8'),
       ('https://www.grand-chatellerault.fr/vivre/actualites', 'text/html;charset=UTF-8'),
       ('https://www.lanouvellerepublique.fr/vienne', 'text/html; charset=utf-8'),
       ('https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'application/rss+xml; charset=UTF-8'),
       ('https://www.lanouvellerepublique.fr/poitiers/vienne-poitiers-et-grand-poitiers-victimes-d-une-cyberattaque-depuis-vendredi-dernier-1756806836', 'text/html; charset=utf-8'),
       ('https://www.lanouvellerepublique.fr/centre-presse', 'text/html; charset=utf-8'),
       ('https://www.lanouvellerepublique.fr/api/v1/rss/670536b0605bd4c91a8b4583', 'application/rss+xml; charset=UTF-8'),
       ('https://www.caracterres.fr/', 'text/html; charset=utf-8'),
       ('https://www.caracterres.fr/region/vienne-rurale', 'text/html; charset=utf-8'),
       ('https://www.caracterres.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://www.le7.info/', 'text/html; charset=UTF-8'),
       ('https://www.le7.info/actus', 'text/html; charset=UTF-8'),
       ('https://www.le7.info/rss.xml', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/radio/poitou', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/vienne-86', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/rss/poitou/a-la-une.xml', 'application/xml'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss', 'text/xml; charset=UTF-8'),
       ('https://www.radio-pulsar.org/', 'text/html; charset=UTF-8'),
       ('https://www.radio-pulsar.org/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://actu.fr/pays-de-la-loire/vienne_86/', 'text/html; charset=UTF-8'),
       ('https://www.lepopulaire.fr/poitiers-86000/', 'text/html; charset=utf-8'),
       ('https://www.lepopulaire.fr/actualites/politique', 'text/html; charset=utf-8')
) AS t(url, type_contenu) ON t.url = a.url;

COMMIT;
