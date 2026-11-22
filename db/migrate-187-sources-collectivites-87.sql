-- Sources d'information du secteur « collectivites » du département 87 (Haute-Vienne).
-- 21 sources ; 56 traces de vérification sur 56 URL distinctes, toutes en HTTP 200 le 2026-11-22
-- (GET avec User-Agent navigateur, retries, suivi des redirections, délai 25 s).
-- Corpus détaillé : bench/corpus/sources-collectivites-87.jsonl
-- Preuve HTTP : bench/results/verification-collectivites-87.json

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
  ('corpus:collectivites-87-conseil-departemental-de-la-haute-vienne', 'Conseil départemental de la Haute-Vienne', 'cti', 'https://www.haute-vienne.fr/tous-les-actualites-et-evenements', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Conseil départemental de la Haute-Vienne (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-87-limoges-metropole', 'Limoges Métropole', 'cti', 'https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Limoges Métropole (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : SMS frauduleux sur les colis de Noël visant la Ville de Limoges (France 3 Haute-Vienne, 07/11/2024) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/cette-commune-est-victime-de-sms-frauduleux-pour-la-distribution-de-ses-colis-de-noel-3056836.html'),
  ('corpus:collectivites-87-ville-de-saint-junien', 'Ville de Saint-Junien', 'cti', 'https://www.saint-junien.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Ville de Saint-Junien (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Vidéoprotection et lutte contre la délinquance annoncées à Limoges (France 3 Haute-Vienne) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/taper-le-consommateur-au-portefeuille-amendes-renforcees-cameras-supplementaires-lutte-contre-la-delinquance-les-annonces-du-ministre-de-la-securite-a-limoges-3333281.html'),
  ('corpus:collectivites-87-ville-de-couzeix', 'Ville de Couzeix', 'cti', 'https://www.couzeix.fr/actualites/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Ville de Couzeix (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Vidéoprotection et lutte contre la délinquance annoncées à Limoges (France 3 Haute-Vienne) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/taper-le-consommateur-au-portefeuille-amendes-renforcees-cameras-supplementaires-lutte-contre-la-delinquance-les-annonces-du-ministre-de-la-securite-a-limoges-3333281.html'),
  ('corpus:collectivites-87-ville-de-bellac', 'Ville de Bellac', 'cti', 'https://www.bellac.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Ville de Bellac (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-87-communaute-de-communes-du-val-de-vienne', 'Communauté de communes du Val de Vienne', 'cti', 'https://valdevienne.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Communauté de communes du Val de Vienne (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Arnaque Facebook usurpant la STCLM (transports de Limoges Métropole) — https://www.lepopulaire.fr/limoges-87000/actualites/arnaque-sur-facebook-non-la-societe-de-transports-en-commun-de-limoges-metropole-n-offre-pas-d-abonnements-gratuits_14500861/'),
  ('corpus:collectivites-87-sdis-87-pompiers-de-la-haute-vienne', 'SDIS 87 (pompiers de la Haute-Vienne)', 'cti', 'https://sdis-87.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'SDIS 87 (pompiers de la Haute-Vienne) (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : SMS frauduleux sur les colis de Noël visant une commune de Haute-Vienne (France 3, 07/11/2024) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/cette-commune-est-victime-de-sms-frauduleux-pour-la-distribution-de-ses-colis-de-noel-3056836.html'),
  ('corpus:collectivites-87-chambre-d-agriculture-de-la-haute-vienne', 'Chambre d''agriculture de la Haute-Vienne', 'cti', 'https://haute-vienne.chambres-agriculture.fr/actualites-1', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Chambre d''agriculture de la Haute-Vienne (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Cyberattaque du service d''identification des bovins et ovins perturbant les éleveurs limousins (France 3, 31/12/2024) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/le-service-d-identification-des-bovins-et-ovins-victime-d-une-cyberattaque-le-travail-des-eleveurs-limousins-perturbe-3084484.html'),
  ('corpus:collectivites-87-amf-87-association-des-maires-de-la-haute-vienne', 'AMF 87 (Association des maires de la Haute-Vienne)', 'cti', 'https://www.amf87.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'AMF 87 (Association des maires de la Haute-Vienne) (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-87-commune-de-boisseuil', 'Commune de Boisseuil', 'cti', 'https://boisseuil87.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Commune de Boisseuil (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Revue de presse sur les cybermenaces de la commune de Boisseuil — https://boisseuil87.fr/revue-de-presse/'),
  ('corpus:collectivites-87-commune-de-nexon', 'Commune de Nexon', 'cti', 'https://www.nexon.fr/nos-actualites.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Commune de Nexon (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-87-commune-de-chaptelat', 'Commune de Chaptelat', 'cti', 'https://www.chaptelat.fr/index.php/lactualite.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Commune de Chaptelat (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-87-le-populaire-du-centre-haute-vienne', 'Le Populaire du Centre — Haute-Vienne', 'cti', 'https://www.lepopulaire.fr/haute-vienne/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Le Populaire du Centre — Haute-Vienne (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Arnaque Facebook usurpant la STCLM ( transports de Limoges Métropole) — https://www.lepopulaire.fr/limoges-87000/actualites/arnaque-sur-facebook-non-la-societe-de-transports-en-commun-de-limoges-metropole-n-offre-pas-d-abonnements-gratuits_14500861/'),
  ('corpus:collectivites-87-le-populaire-du-centre-limoges', 'Le Populaire du Centre — Limoges', 'cti', 'https://www.lepopulaire.fr/limoges-87000/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Le Populaire du Centre — Limoges (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Arnaque Facebook usurpant la STCLM ( transports de Limoges Métropole) — https://www.lepopulaire.fr/limoges-87000/actualites/arnaque-sur-facebook-non-la-societe-de-transports-en-commun-de-limoges-metropole-n-offre-pas-d-abonnements-gratuits_14500861/'),
  ('corpus:collectivites-87-passion-aquitaine-ouest-france-haute-vienne', 'Passion Aquitaine (Ouest-France) — Haute-Vienne', 'cti', 'https://passion-aquitaine.ouest-france.fr/haute-vienne/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Passion Aquitaine (Ouest-France) — Haute-Vienne (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-87-ici-limousin-haute-vienne', 'ICI Limousin — Haute-Vienne', 'cti', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'ICI Limousin — Haute-Vienne (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Le suspect du piratage du ministère de l''Intérieur interpellé en Haute-Vienne — https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/le-suspect-du-piratage-du-ministere-de-l-interieur-a-ete-interpelle-en-haute-vienne-au-nord-de-limoges-8877920'),
  ('corpus:collectivites-87-france-3-nouvelle-aquitaine-haute-vienne', 'France 3 Nouvelle-Aquitaine — Haute-Vienne', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'France 3 Nouvelle-Aquitaine — Haute-Vienne (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : SMS frauduleux sur les colis de Noël visant une commune de Haute-Vienne — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/cette-commune-est-victime-de-sms-frauduleux-pour-la-distribution-de-ses-colis-de-noel-3056836.html'),
  ('corpus:collectivites-87-actu-fr-haute-vienne', 'Actu.fr — Haute-Vienne', 'cti', 'https://actu.fr/nouvelle-aquitaine/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Actu.fr — Haute-Vienne (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22. Exemple cyber : Piratage du ministère de l''Intérieur : un homme interpellé près de Limoges — https://actu.fr/nouvelle-aquitaine/limoges_87085/piratage-au-ministere-de-l-interieur-un-homme-de-22-ans-interpelle-pres-de-limoges-et-place-en-garde-a-vue_63592916.html'),
  ('corpus:collectivites-87-actus-limousin-mesinfos-fr-collectivites', 'Actus Limousin (mesinfos.fr) — Collectivités', 'cti', 'https://mesinfos.fr/actus-limousin/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Actus Limousin (mesinfos.fr) — Collectivités (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-87-7alimoges', '7ALimoges', 'cti', 'https://www.7alimoges.tv/xml/syndication.rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', '7ALimoges (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.'),
  ('corpus:collectivites-87-flash-fm-actualites', 'Flash FM — actualités', 'cti', 'https://www.flashfm.fr/actualites/1', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-87.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Flash FM — actualités (87). Site et actualités vérifiés en HTTP 200 le 2026-11-22.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- 56 traces HTTP 200 vérifiées le 2026-11-22 (site, actualités, flux, article cyber).
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:collectivites-87-conseil-departemental-de-la-haute-vienne', ARRAY['https://www.haute-vienne.fr/', 'https://www.haute-vienne.fr/tous-les-actualites-et-evenements']),
    ('corpus:collectivites-87-limoges-metropole', ARRAY['https://www.limoges-metropole.fr/', 'https://www.limoges-metropole.fr/informations-transversales/actualites', 'https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/cette-commune-est-victime-de-sms-frauduleux-pour-la-distribution-de-ses-colis-de-noel-3056836.html']),
    ('corpus:collectivites-87-ville-de-saint-junien', ARRAY['https://www.saint-junien.fr/', 'https://www.saint-junien.fr/actualites/', 'https://www.saint-junien.fr/feed/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/taper-le-consommateur-au-portefeuille-amendes-renforcees-cameras-supplementaires-lutte-contre-la-delinquance-les-annonces-du-ministre-de-la-securite-a-limoges-3333281.html']),
    ('corpus:collectivites-87-ville-de-couzeix', ARRAY['https://www.couzeix.fr/', 'https://www.couzeix.fr/actualites/', 'https://www.couzeix.fr/actualites/feed/']),
    ('corpus:collectivites-87-ville-de-bellac', ARRAY['https://www.bellac.fr/', 'https://www.bellac.fr/categorie/a-la-une', 'https://www.bellac.fr/feed/']),
    ('corpus:collectivites-87-communaute-de-communes-du-val-de-vienne', ARRAY['https://valdevienne.fr/', 'https://valdevienne.fr/actualites/', 'https://valdevienne.fr/feed/', 'https://www.lepopulaire.fr/limoges-87000/actualites/arnaque-sur-facebook-non-la-societe-de-transports-en-commun-de-limoges-metropole-n-offre-pas-d-abonnements-gratuits_14500861/']),
    ('corpus:collectivites-87-sdis-87-pompiers-de-la-haute-vienne', ARRAY['https://sdis-87.fr/', 'https://sdis-87.fr/actualites/', 'https://sdis-87.fr/feed/']),
    ('corpus:collectivites-87-chambre-d-agriculture-de-la-haute-vienne', ARRAY['https://haute-vienne.chambres-agriculture.fr/', 'https://haute-vienne.chambres-agriculture.fr/actualites-1', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/le-service-d-identification-des-bovins-et-ovins-victime-d-une-cyberattaque-le-travail-des-eleveurs-limousins-perturbe-3084484.html']),
    ('corpus:collectivites-87-amf-87-association-des-maires-de-la-haute-vienne', ARRAY['https://www.amf87.fr/', 'https://www.amf87.fr/actualites/']),
    ('corpus:collectivites-87-commune-de-boisseuil', ARRAY['https://boisseuil87.fr/', 'https://boisseuil87.fr/actualite/', 'https://boisseuil87.fr/feed/', 'https://boisseuil87.fr/revue-de-presse/']),
    ('corpus:collectivites-87-commune-de-nexon', ARRAY['https://www.nexon.fr/', 'https://www.nexon.fr/nos-actualites.html']),
    ('corpus:collectivites-87-commune-de-chaptelat', ARRAY['https://www.chaptelat.fr/', 'https://www.chaptelat.fr/index.php/lactualite.html']),
    ('corpus:collectivites-87-le-populaire-du-centre-haute-vienne', ARRAY['https://www.lepopulaire.fr/haute-vienne/']),
    ('corpus:collectivites-87-le-populaire-du-centre-limoges', ARRAY['https://www.lepopulaire.fr/limoges-87000/']),
    ('corpus:collectivites-87-passion-aquitaine-ouest-france-haute-vienne', ARRAY['https://passion-aquitaine.ouest-france.fr/haute-vienne/', 'https://passion-aquitaine.ouest-france.fr/haute-vienne/feed/']),
    ('corpus:collectivites-87-ici-limousin-haute-vienne', ARRAY['https://www.ici.fr/radio/limousin', 'https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/le-suspect-du-piratage-du-ministere-de-l-interieur-a-ete-interpelle-en-haute-vienne-au-nord-de-limoges-8877920']),
    ('corpus:collectivites-87-france-3-nouvelle-aquitaine-haute-vienne', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss']),
    ('corpus:collectivites-87-actu-fr-haute-vienne', ARRAY['https://actu.fr/nouvelle-aquitaine/haute-vienne_87', 'https://actu.fr/nouvelle-aquitaine/rss.xml', 'https://actu.fr/nouvelle-aquitaine/limoges_87085/piratage-au-ministere-de-l-interieur-un-homme-de-22-ans-interpelle-pres-de-limoges-et-place-en-garde-a-vue_63592916.html']),
    ('corpus:collectivites-87-actus-limousin-mesinfos-fr-collectivites', ARRAY['https://mesinfos.fr/actus-limousin/collectivites', 'https://mesinfos.fr/actus-limousin/rss.xml']),
    ('corpus:collectivites-87-7alimoges', ARRAY['https://www.7alimoges.tv/', 'https://www.7alimoges.tv/Actualite_r16.html', 'https://www.7alimoges.tv/xml/syndication.rss']),
    ('corpus:collectivites-87-flash-fm-actualites', ARRAY['https://www.flashfm.fr/', 'https://www.flashfm.fr/actualites/1'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, t.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-87 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://actu.fr/nouvelle-aquitaine/haute-vienne_87', 'text/html; charset=UTF-8', 0),
       ('https://actu.fr/nouvelle-aquitaine/limoges_87085/piratage-au-ministere-de-l-interieur-un-homme-de-22-ans-interpelle-pres-de-limoges-et-place-en-garde-a-vue_63592916.html', 'text/html; charset=UTF-8', 0),
       ('https://actu.fr/nouvelle-aquitaine/rss.xml', 'application/rss+xml; charset=utf-8', 20),
       ('https://boisseuil87.fr/', 'text/html; charset=UTF-8', 0),
       ('https://boisseuil87.fr/actualite/', 'text/html; charset=UTF-8', 0),
       ('https://boisseuil87.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
       ('https://boisseuil87.fr/revue-de-presse/', 'text/html; charset=UTF-8', 0),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne', 'text/html; charset=UTF-8', 0),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/cette-commune-est-victime-de-sms-frauduleux-pour-la-distribution-de-ses-colis-de-noel-3056836.html', 'text/html; charset=UTF-8', 0),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/le-service-d-identification-des-bovins-et-ovins-victime-d-une-cyberattaque-le-travail-des-eleveurs-limousins-perturbe-3084484.html', 'text/html; charset=UTF-8', 0),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/taper-le-consommateur-au-portefeuille-amendes-renforcees-cameras-supplementaires-lutte-contre-la-delinquance-les-annonces-du-ministre-de-la-securite-a-limoges-3333281.html', 'text/html; charset=UTF-8', 0),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss', 'text/xml; charset=UTF-8', 30),
       ('https://haute-vienne.chambres-agriculture.fr/', 'text/html; charset=utf-8', 0),
       ('https://haute-vienne.chambres-agriculture.fr/actualites-1', 'text/html; charset=utf-8', 0),
       ('https://mesinfos.fr/actus-limousin/collectivites', 'text/html; charset=UTF-8', 0),
       ('https://mesinfos.fr/actus-limousin/rss.xml', 'application/xml', 250),
       ('https://passion-aquitaine.ouest-france.fr/haute-vienne/', 'text/html; charset=UTF-8', 0),
       ('https://passion-aquitaine.ouest-france.fr/haute-vienne/feed/', 'application/rss+xml; charset=UTF-8', 40),
       ('https://sdis-87.fr/', 'text/html; charset=UTF-8', 0),
       ('https://sdis-87.fr/actualites/', 'text/html; charset=UTF-8', 0),
       ('https://sdis-87.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
       ('https://valdevienne.fr/', 'text/html; charset=UTF-8', 0),
       ('https://valdevienne.fr/actualites/', 'text/html; charset=UTF-8', 0),
       ('https://valdevienne.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
       ('https://www.7alimoges.tv/', 'text/html; charset=UTF-8', 0),
       ('https://www.7alimoges.tv/Actualite_r16.html', 'text/html; charset=UTF-8', 0),
       ('https://www.7alimoges.tv/xml/syndication.rss', 'text/xml; charset=UTF-8', 20),
       ('https://www.amf87.fr/', 'text/html; charset=utf-8', 0),
       ('https://www.amf87.fr/actualites/', 'text/html; charset=utf-8', 0),
       ('https://www.bellac.fr/', 'text/html', 0),
       ('https://www.bellac.fr/categorie/a-la-une', 'text/html', 0),
       ('https://www.bellac.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
       ('https://www.chaptelat.fr/', 'text/html; charset=utf-8', 0),
       ('https://www.chaptelat.fr/index.php/lactualite.html', 'text/html; charset=utf-8', 0),
       ('https://www.couzeix.fr/', 'text/html; charset=UTF-8', 0),
       ('https://www.couzeix.fr/actualites/', 'text/html; charset=UTF-8', 0),
       ('https://www.couzeix.fr/actualites/feed/', 'application/rss+xml; charset=UTF-8', 10),
       ('https://www.flashfm.fr/', 'text/html; charset=utf-8', 0),
       ('https://www.flashfm.fr/actualites/1', 'text/html; charset=utf-8', 0),
       ('https://www.haute-vienne.fr/', 'text/html;charset=utf-8', 0),
       ('https://www.haute-vienne.fr/tous-les-actualites-et-evenements', 'text/html;charset=utf-8', 0),
       ('https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87', 'text/html; charset=UTF-8', 0),
       ('https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/le-suspect-du-piratage-du-ministere-de-l-interieur-a-ete-interpelle-en-haute-vienne-au-nord-de-limoges-8877920', 'text/html; charset=UTF-8', 0),
       ('https://www.ici.fr/radio/limousin', 'text/html; charset=UTF-8', 0),
       ('https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'application/xml', 20),
       ('https://www.lepopulaire.fr/haute-vienne/', 'text/html; charset=utf-8', 0),
       ('https://www.lepopulaire.fr/limoges-87000/', 'text/html; charset=utf-8', 0),
       ('https://www.lepopulaire.fr/limoges-87000/actualites/arnaque-sur-facebook-non-la-societe-de-transports-en-commun-de-limoges-metropole-n-offre-pas-d-abonnements-gratuits_14500861/', 'text/html; charset=utf-8', 0),
       ('https://www.limoges-metropole.fr/', 'text/html; charset=utf-8', 0),
       ('https://www.limoges-metropole.fr/informations-transversales/actualites', 'text/html; charset=utf-8', 0),
       ('https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'text/xml;charset=utf-8', 73),
       ('https://www.nexon.fr/', 'text/html; charset=utf-8', 0),
       ('https://www.nexon.fr/nos-actualites.html', 'text/html; charset=utf-8', 0),
       ('https://www.saint-junien.fr/', 'text/html; charset=UTF-8', 0),
       ('https://www.saint-junien.fr/actualites/', 'text/html; charset=UTF-8', 0),
       ('https://www.saint-junien.fr/feed/', 'application/rss+xml; charset=UTF-8', 20)
) AS t(url, type_contenu, items) ON t.url = a.url;

COMMIT;
