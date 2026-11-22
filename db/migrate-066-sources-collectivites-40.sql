-- Sources d'information du secteur « collectivites » du département 40 (Landes).
-- 15 sources ; 45 contrôles HTTP sur 45 URL distinctes, toutes en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections, délai 25 s).
-- Corpus détaillé : bench/corpus/sources-collectivites-40.jsonl
-- Preuve HTTP : bench/results/verification-collectivites-40.json

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
  ('corpus:collectivites-40-cci-des-landes-chambre-de-commerce-et-dindustrie', 'CCI des Landes — Chambre de commerce et d’industrie', 'cti', 'https://landes.cci.fr/actu/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'CCI des Landes — Chambre de commerce et d’industrie (40). Mars@Hack 2026 : les acteurs landais mobilisés autour de la cybersécurité (04/02/2026) — https://landes.cci.fr/presse/marshack-2026-cybersecurite/'),
  ('corpus:collectivites-40-chambre-dagriculture-des-landes', 'Chambre d’agriculture des Landes', 'cti', 'https://landes.chambres-agriculture.fr/actualites.rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Chambre d’agriculture des Landes (40). Aucun incident cyber propre à la Chambre identifié ; sensibilisation locale « Cybersécurité — Entreprises, protégez-vous ! » (03/04/2025) — https://www.annonces-landaises.com/actualites/cybersecurite-entreprises-protegez-vous/'),
  ('corpus:collectivites-40-chambre-des-metiers-et-de-lartisanat-des-landes', 'Chambre des métiers et de l’artisanat des Landes', 'cti', 'https://www.cma-landes.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Chambre des métiers et de l’artisanat des Landes (40). Sensibilisation des entreprises landaises à la cybersécurité (03/04/2025, Les Annonces Landaises) — https://www.annonces-landaises.com/actualites/cybersecurite-entreprises-protegez-vous/'),
  ('corpus:collectivites-40-mont-de-marsan-agglomeration', 'Mont de Marsan Agglomération', 'cti', 'https://www.montdemarsan.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Mont de Marsan Agglomération (40). Arnaque sur Facebook visant les réseaux TMA (agglo du Marsan) et Couralin (mars 2025, ICI) — https://www.ici.fr/infos/faits-divers-justice/des-reseaux-de-transport-landais-victimes-d-une-arnaque-sur-facebook-1671740'),
  ('corpus:collectivites-40-agglomeration-du-grand-dax', 'Agglomération du Grand Dax', 'cti', 'https://www.grand-dax.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Agglomération du Grand Dax (40). Arnaque au faux bon de commande visant Couralin / Trans-Landes (Grand Dax, mars 2025, ICI) — https://www.ici.fr/infos/faits-divers-justice/des-reseaux-de-transport-landais-victimes-d-une-arnaque-sur-facebook-1671740'),
  ('corpus:collectivites-40-ville-de-dax', 'Ville de Dax', 'cti', 'https://www.dax.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Ville de Dax (40). Aucun fait cyber propre à la commune identifié ; cyberattaque des pompiers des Landes (27/07/2026, actu.fr) — https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html'),
  ('corpus:collectivites-40-ville-de-tarnos', 'Ville de Tarnos', 'cti', 'https://www.ville-tarnos.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Ville de Tarnos (40). Incident de cybersécurité — communiqué officiel (28/08/2026) — https://www.ville-tarnos.fr/actualites/incident-de-cybersecurite/'),
  ('corpus:collectivites-40-communaute-de-communes-du-seignanx', 'Communauté de communes du Seignanx', 'cti', 'https://www.cc-seignanx.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Communauté de communes du Seignanx (40). Aucun incident cyber propre à la communauté de communes identifié ; campagne landaise de cybersécurité (02/10/2026) — https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/'),
  ('corpus:collectivites-40-sdis-des-landes', 'SDIS des Landes', 'cti', 'https://www.sdis40.fr/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'SDIS des Landes (40). Les pompiers des Landes victimes d’une cyberattaque, des données personnelles extraites (27/07/2026, actu.fr) — https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html'),
  ('corpus:collectivites-40-actu-landes-actu-fr', 'Actu Landes (actu.fr)', 'cti', 'https://actu.fr/landes/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Actu Landes (actu.fr) (40). Les pompiers des Landes victimes d’une cyberattaque, des données personnelles extraites (27/07/2026) — https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html'),
  ('corpus:collectivites-40-ici-gascogne-landes-40', 'ICI Gascogne — Landes (40)', 'cti', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'ICI Gascogne — Landes (40) (40). La Fédération nationale des chasseurs victime d’une cyberattaque : 185 adhérents landais touchés (23/01/2026) — https://www.ici.fr/nouvelle-aquitaine/landes-40/mont-de-marsan/la-federation-nationale-des-chasseurs-victime-d-une-cyberattaque-185-adherents-landais-touches-2569280'),
  ('corpus:collectivites-40-france-3-nouvelle-aquitaine-landes', 'France 3 Nouvelle-Aquitaine — Landes', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'France 3 Nouvelle-Aquitaine — Landes (40). Escroquerie à la fausse annonce : un Landais perd 15 000 € (08/04/2026, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/bayonne/victimes-d-une-escroquerie-ils-pensaient-vendre-des-rideaux-basques-a-la-sorbonne-et-perdent-15-000-euros-3228284.html'),
  ('corpus:collectivites-40-les-annonces-landaises', 'Les Annonces Landaises', 'cti', 'https://www.annonces-landaises.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Les Annonces Landaises (40). Collectivités — Octobre, mois de la cybersécurité à Mont-de-Marsan (02/10/2026) — https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/'),
  ('corpus:collectivites-40-commune-de-peyrehorade', 'Commune de Peyrehorade', 'cti', 'https://www.peyrehorade.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Commune de Peyrehorade (40). Aucun incident cyber propre à la commune identifié ; campagne landaise de cybersécurité (02/10/2026) — https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/'),
  ('corpus:collectivites-40-annuaire-des-communes-et-intercommunalites-des-landes', 'Annuaire des communes et intercommunalités des Landes', 'cti', 'https://www.annuaire-mairie.fr/departement-landes.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-40.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Annuaire des communes et intercommunalités des Landes (40). Aucun incident cyber propre à l’annuaire identifié lors de la vérification du 22/11/2026')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 45 contrôles sur 45 URL distinctes, toutes en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:collectivites-40-cci-des-landes-chambre-de-commerce-et-dindustrie', ARRAY['https://landes.cci.fr/', 'https://landes.cci.fr/actu/', 'https://landes.cci.fr/presse/marshack-2026-cybersecurite/']),
    ('corpus:collectivites-40-chambre-dagriculture-des-landes', ARRAY['https://landes.chambres-agriculture.fr/', 'https://landes.chambres-agriculture.fr/actualites', 'https://landes.chambres-agriculture.fr/actualites.rss', 'https://www.annonces-landaises.com/actualites/cybersecurite-entreprises-protegez-vous/']),
    ('corpus:collectivites-40-chambre-des-metiers-et-de-lartisanat-des-landes', ARRAY['https://www.cma-landes.fr/', 'https://www.cma-landes.fr/actualites/', 'https://www.annonces-landaises.com/actualites/cybersecurite-entreprises-protegez-vous/']),
    ('corpus:collectivites-40-mont-de-marsan-agglomeration', ARRAY['https://www.montdemarsan.fr/', 'https://www.montdemarsan.fr/actualites/', 'https://www.montdemarsan.fr/feed/', 'https://www.ici.fr/infos/faits-divers-justice/des-reseaux-de-transport-landais-victimes-d-une-arnaque-sur-facebook-1671740']),
    ('corpus:collectivites-40-agglomeration-du-grand-dax', ARRAY['https://www.grand-dax.fr/', 'https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/', 'https://www.grand-dax.fr/feed/', 'https://www.ici.fr/infos/faits-divers-justice/des-reseaux-de-transport-landais-victimes-d-une-arnaque-sur-facebook-1671740']),
    ('corpus:collectivites-40-ville-de-dax', ARRAY['https://www.dax.fr/', 'https://www.dax.fr/actualites/', 'https://www.dax.fr/feed/', 'https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html']),
    ('corpus:collectivites-40-ville-de-tarnos', ARRAY['https://www.ville-tarnos.fr/', 'https://www.ville-tarnos.fr/actualites/', 'https://www.ville-tarnos.fr/feed/', 'https://www.ville-tarnos.fr/actualites/incident-de-cybersecurite/']),
    ('corpus:collectivites-40-communaute-de-communes-du-seignanx', ARRAY['https://www.cc-seignanx.fr/', 'https://www.cc-seignanx.fr/actualites/', 'https://www.cc-seignanx.fr/feed/', 'https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/']),
    ('corpus:collectivites-40-sdis-des-landes', ARRAY['https://www.sdis40.fr/', 'https://www.sdis40.fr/rss', 'https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html']),
    ('corpus:collectivites-40-actu-landes-actu-fr', ARRAY['https://actu.fr/landes/', 'https://actu.fr/landes/dernieres-actus', 'https://actu.fr/landes/rss.xml', 'https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html']),
    ('corpus:collectivites-40-ici-gascogne-landes-40', ARRAY['https://www.ici.fr/nouvelle-aquitaine/landes-40', 'https://www.ici.fr/nouvelle-aquitaine/landes-40/mont-de-marsan/la-federation-nationale-des-chasseurs-victime-d-une-cyberattaque-185-adherents-landais-touches-2569280']),
    ('corpus:collectivites-40-france-3-nouvelle-aquitaine-landes', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/bayonne/victimes-d-une-escroquerie-ils-pensaient-vendre-des-rideaux-basques-a-la-sorbonne-et-perdent-15-000-euros-3228284.html']),
    ('corpus:collectivites-40-les-annonces-landaises', ARRAY['https://www.annonces-landaises.com/', 'https://www.annonces-landaises.com/categories/collectivites/', 'https://www.annonces-landaises.com/feed/', 'https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/']),
    ('corpus:collectivites-40-commune-de-peyrehorade', ARRAY['https://www.peyrehorade.fr/', 'https://www.peyrehorade.fr/mairie/actualites/', 'https://www.peyrehorade.fr/feed/', 'https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/']),
    ('corpus:collectivites-40-annuaire-des-communes-et-intercommunalites-des-landes', ARRAY['https://www.annuaire-mairie.fr/departement-landes.html', 'https://www.annuaire-mairie.fr/departement-landes.html'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-40 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://actu.fr/landes/', 'text/html; charset=UTF-8'),
       ('https://actu.fr/landes/dernieres-actus', 'text/html; charset=UTF-8'),
       ('https://actu.fr/landes/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/les-pompiers-des-landes-victimes-d-une-cyberattaque-des-donnees-personnelles-ont-ete-extraites_64593363.html', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 'text/xml; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/bayonne/victimes-d-une-escroquerie-ils-pensaient-vendre-des-rideaux-basques-a-la-sorbonne-et-perdent-15-000-euros-3228284.html', 'text/html; charset=UTF-8'),
       ('https://landes.cci.fr/', 'text/html; charset=utf-8'),
       ('https://landes.cci.fr/actu/', 'text/html; charset=utf-8'),
       ('https://landes.cci.fr/presse/marshack-2026-cybersecurite/', 'text/html; charset=utf-8'),
       ('https://landes.chambres-agriculture.fr/', 'text/html; charset=utf-8'),
       ('https://landes.chambres-agriculture.fr/actualites', 'text/html; charset=utf-8'),
       ('https://landes.chambres-agriculture.fr/actualites.rss', 'text/xml; charset=utf-8'),
       ('https://www.annonces-landaises.com/', 'text/html; charset=UTF-8'),
       ('https://www.annonces-landaises.com/actualites/collectivites-octobre-mois-de-la-cybersecurite-a-mont-de-marsan/', 'text/html; charset=UTF-8'),
       ('https://www.annonces-landaises.com/actualites/cybersecurite-entreprises-protegez-vous/', 'text/html; charset=UTF-8'),
       ('https://www.annonces-landaises.com/categories/collectivites/', 'text/html; charset=UTF-8'),
       ('https://www.annonces-landaises.com/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.annuaire-mairie.fr/departement-landes.html', 'text/html; charset=UTF-8'),
       ('https://www.cc-seignanx.fr/', 'text/html; charset=UTF-8'),
       ('https://www.cc-seignanx.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.cc-seignanx.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.cma-landes.fr/', 'text/html; charset=UTF-8'),
       ('https://www.cma-landes.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.dax.fr/', 'text/html; charset=UTF-8'),
       ('https://www.dax.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.dax.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.grand-dax.fr/', 'text/html; charset=UTF-8'),
       ('https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/', 'text/html; charset=UTF-8'),
       ('https://www.grand-dax.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.ici.fr/infos/faits-divers-justice/des-reseaux-de-transport-landais-victimes-d-une-arnaque-sur-facebook-1671740', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/landes-40/mont-de-marsan/la-federation-nationale-des-chasseurs-victime-d-une-cyberattaque-185-adherents-landais-touches-2569280', 'text/html; charset=UTF-8'),
       ('https://www.montdemarsan.fr/', 'text/html; charset=UTF-8'),
       ('https://www.montdemarsan.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.montdemarsan.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.peyrehorade.fr/', 'text/html; charset=UTF-8'),
       ('https://www.peyrehorade.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.peyrehorade.fr/mairie/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.sdis40.fr/', 'text/html; charset=UTF-8'),
       ('https://www.sdis40.fr/rss', 'application/rss+xml; charset=UTF-8'),
       ('https://www.ville-tarnos.fr/', 'text/html; charset=UTF-8'),
       ('https://www.ville-tarnos.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.ville-tarnos.fr/actualites/incident-de-cybersecurite/', 'text/html; charset=UTF-8'),
       ('https://www.ville-tarnos.fr/feed/', 'application/rss+xml; charset=UTF-8')
) AS t(url, type_contenu) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
