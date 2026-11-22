-- Sources d'information du secteur « collectivites » du département 24 (Dordogne).
-- 15 sources ; 50 contrôles HTTP sur 49 URL distinctes, toutes en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections, délai 20 s).
-- Corpus détaillé : bench/corpus/sources-collectivites-24.jsonl
-- Preuve HTTP : bench/results/verification-collectivites-24.json

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
  ('corpus:collectivites-24-prefecture-de-la-dordogne', 'Préfecture de la Dordogne', 'cti', 'https://www.dordogne.gouv.fr/Actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Préfecture de la Dordogne (24). Lutte contre l''internet illicite — https://www.dordogne.gouv.fr/Actualites/Site-www.internet-signalement.gouv.fr-la-lutte-contre-l-internet-illicite'),
  ('corpus:collectivites-24-cci-dordogne-chambre-de-commerce-et-d-industrie', 'CCI Dordogne — Chambre de commerce et d''industrie', 'cti', 'https://dordogne.cci.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'CCI Dordogne — Chambre de commerce et d''industrie (24). Notre engagement à protéger vos données générées par nos interactions sur ce site internet — https://dordogne.cci.fr/notre-engagement-a-proteger-vos-donnees-generees-par-nos-interactions-sur-ce-site-internet/'),
  ('corpus:collectivites-24-chambre-d-agriculture-de-la-dordogne', 'Chambre d''agriculture de la Dordogne', 'cti', 'https://dordogne.chambres-agriculture.fr/actualites-1', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Chambre d''agriculture de la Dordogne (24). Piratage du logiciel Synel perturbant l''équarrissage en Dordogne (14/01/2025, Sud Ouest) — https://www.sudouest.fr/economie/agriculture/agriculture-panne-d-equarrissage-en-dordogne-a-cause-d-un-piratage-informatique-22756929.php'),
  ('corpus:collectivites-24-communaute-de-communes-vallee-dordogne-foret-bessede', 'Communauté de communes Vallée Dordogne Forêt Bessède', 'cti', 'https://ccdordogne-bessede.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Communauté de communes Vallée Dordogne Forêt Bessède (24). Alerte « Message frauduleux » (07/11/2025) — https://ccdordogne-bessede.fr/alerte-message-frauduleux/'),
  ('corpus:collectivites-24-mairie-de-bussac', 'Mairie de Bussac', 'cti', 'https://bussac-dordogne.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Mairie de Bussac (24). Information piratage du site internet du SMCTOM (07/08/2026) — https://bussac-dordogne.fr/2026/08/07/information-piratage-site-internet-du-smctom/'),
  ('corpus:collectivites-24-federation-des-chasseurs-de-la-dordogne', 'Fédération des chasseurs de la Dordogne', 'cti', 'https://www.chasseurs24.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Fédération des chasseurs de la Dordogne (24). Indisponibilité de services après un incident informatique (26/01/2026) — https://www.chasseurs24.com/2026/01/26/indisponibilite-de-services/'),
  ('corpus:collectivites-24-sud-ouest-dordogne', 'Sud Ouest — Dordogne', 'cti', 'https://www.sudouest.fr/dordogne/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Sud Ouest — Dordogne (24). Les QR codes d''horodateurs piratés en Dordogne (12/08/2025) — https://www.sudouest.fr/economie/cybersecurite/les-qr-codes-d-horodateurs-pirates-en-dordogne-25534143.php'),
  ('corpus:collectivites-24-dordogne-libre', 'Dordogne Libre', 'cti', 'https://www.dordognelibre.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Dordogne Libre (24). À Ribérac, Liberté FM victime d''un piratage lance une cagnotte (29/10/2026) — https://www.dordognelibre.fr/dordogne/riberac/riberac-liberte-fm-victime-d-un-piratage-lance-une-cagnotte-31290979.php'),
  ('corpus:collectivites-24-ici-perigord-dordogne-24', 'ICI Périgord — Dordogne (24)', 'cti', 'https://www.ici.fr/nouvelle-aquitaine/dordogne-24', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'ICI Périgord — Dordogne (24) (24). Des escrocs se font passer par mail pour une mairie de Dordogne, Marsac-sur-l''Isle (18/11/2025) — https://www.ici.fr/nouvelle-aquitaine/dordogne-24/marsac-sur-l-isle/des-escrocs-se-font-passer-par-mail-pour-une-mairie-de-dordogne-marsac-sur-l-isle-7406566'),
  ('corpus:collectivites-24-france-3-nouvelle-aquitaine-dordogne', 'France 3 Nouvelle-Aquitaine — Dordogne', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'France 3 Nouvelle-Aquitaine — Dordogne (24). Vote du budget communautaire reporté après un piratage informatique à Isle et Crempse en Périgord (27/02/2026, Sud Ouest) — https://www.sudouest.fr/dordogne/mussidan/isle-et-crempse-en-perigord-le-vote-du-budget-communautaire-reporte-a-la-suite-d-un-piratage-informatique-28052389.php'),
  ('corpus:collectivites-24-ville-de-perigueux', 'Ville de Périgueux', 'cti', 'https://www.perigueux.fr/actualites/flux-actualites/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Ville de Périgueux (24). Campagne d''hameçonnage visant le réseau Péribus du Grand Périgueux (26/03/2025, Sud Ouest) — https://www.sudouest.fr/economie/transports/le-reseau-de-transports-du-grand-perigueux-alerte-contre-une-arnaque-23788236.php'),
  ('corpus:collectivites-24-ville-de-bergerac', 'Ville de Bergerac', 'cti', 'https://www.bergerac.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Ville de Bergerac (24). Aucun fait cyber propre à la commune identifié ; cyberattaque visant des supermarchés en Dordogne (12/10/2026, Sud Ouest) — https://www.sudouest.fr/dordogne/cyberattaque-dans-des-supermarches-plusieurs-magasins-vises-en-dordogne-31039218.php'),
  ('corpus:collectivites-24-grand-perigueux-communaute-d-agglomeration', 'Grand Périgueux — Communauté d''agglomération', 'cti', 'https://www.grandperigueux.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Grand Périgueux — Communauté d''agglomération (24). Campagne d''hameçonnage visant le réseau Péribus du Grand Périgueux (26/03/2025, Sud Ouest) — https://www.sudouest.fr/economie/transports/le-reseau-de-transports-du-grand-perigueux-alerte-contre-une-arnaque-23788236.php'),
  ('corpus:collectivites-24-annuaire-des-communes-et-intercommunalites-de-la-dordogne', 'Annuaire des communes et intercommunalités de la Dordogne', 'cti', 'https://www.annuaire-mairie.fr/departement-dordogne.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Annuaire des communes et intercommunalités de la Dordogne (24). Aucun incident cyber propre à l''annuaire identifié lors de la vérification du 22/11/2026'),
  ('corpus:collectivites-24-sdis-24-service-departemental-d-incendie-et-de-secours', 'SDIS 24 — Service départemental d''incendie et de secours', 'cti', 'https://www.sdis24.fr/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-24.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'SDIS 24 — Service départemental d''incendie et de secours (24). Aucun fait cyber propre au SDIS 24 identifié lors de la vérification du 22/11/2026')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 50 contrôles sur 49 URL distinctes (sites, pages actualités, flux et articles cyber), toutes en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:collectivites-24-prefecture-de-la-dordogne', ARRAY['https://www.dordogne.gouv.fr/','https://www.dordogne.gouv.fr/Actualites','https://www.dordogne.gouv.fr/Actualites/Site-www.internet-signalement.gouv.fr-la-lutte-contre-l-internet-illicite']),
    ('corpus:collectivites-24-cci-dordogne-chambre-de-commerce-et-d-industrie', ARRAY['https://dordogne.cci.fr/','https://dordogne.cci.fr/actualites/','https://dordogne.cci.fr/feed/','https://dordogne.cci.fr/notre-engagement-a-proteger-vos-donnees-generees-par-nos-interactions-sur-ce-site-internet/']),
    ('corpus:collectivites-24-chambre-d-agriculture-de-la-dordogne', ARRAY['https://dordogne.chambres-agriculture.fr/','https://dordogne.chambres-agriculture.fr/actualites-1','https://www.sudouest.fr/economie/agriculture/agriculture-panne-d-equarrissage-en-dordogne-a-cause-d-un-piratage-informatique-22756929.php']),
    ('corpus:collectivites-24-communaute-de-communes-vallee-dordogne-foret-bessede', ARRAY['https://ccdordogne-bessede.fr/','https://ccdordogne-bessede.fr/actualites/','https://ccdordogne-bessede.fr/feed/','https://ccdordogne-bessede.fr/alerte-message-frauduleux/']),
    ('corpus:collectivites-24-mairie-de-bussac', ARRAY['https://bussac-dordogne.fr/','https://bussac-dordogne.fr/category/actualites/','https://bussac-dordogne.fr/feed/','https://bussac-dordogne.fr/2026/08/07/information-piratage-site-internet-du-smctom/']),
    ('corpus:collectivites-24-federation-des-chasseurs-de-la-dordogne', ARRAY['https://www.chasseurs24.com/','https://www.chasseurs24.com/actualites/','https://www.chasseurs24.com/feed/','https://www.chasseurs24.com/2026/01/26/indisponibilite-de-services/']),
    ('corpus:collectivites-24-sud-ouest-dordogne', ARRAY['https://www.sudouest.fr/dordogne/','https://www.sudouest.fr/dordogne/rss.xml','https://www.sudouest.fr/economie/cybersecurite/les-qr-codes-d-horodateurs-pirates-en-dordogne-25534143.php']),
    ('corpus:collectivites-24-dordogne-libre', ARRAY['https://www.dordognelibre.fr/','https://www.dordognelibre.fr/dordogne/','https://www.dordognelibre.fr/rss.xml','https://www.dordognelibre.fr/dordogne/riberac/riberac-liberte-fm-victime-d-un-piratage-lance-une-cagnotte-31290979.php']),
    ('corpus:collectivites-24-ici-perigord-dordogne-24', ARRAY['https://www.ici.fr/nouvelle-aquitaine/dordogne-24','https://www.ici.fr/nouvelle-aquitaine/dordogne-24/marsac-sur-l-isle/des-escrocs-se-font-passer-par-mail-pour-une-mairie-de-dordogne-marsac-sur-l-isle-7406566']),
    ('corpus:collectivites-24-france-3-nouvelle-aquitaine-dordogne', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne','https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss','https://www.sudouest.fr/dordogne/mussidan/isle-et-crempse-en-perigord-le-vote-du-budget-communautaire-reporte-a-la-suite-d-un-piratage-informatique-28052389.php']),
    ('corpus:collectivites-24-ville-de-perigueux', ARRAY['https://www.perigueux.fr/','https://www.perigueux.fr/actualites.html','https://www.perigueux.fr/actualites/flux-actualites/rss.xml','https://www.sudouest.fr/economie/transports/le-reseau-de-transports-du-grand-perigueux-alerte-contre-une-arnaque-23788236.php']),
    ('corpus:collectivites-24-ville-de-bergerac', ARRAY['https://www.bergerac.fr/','https://www.bergerac.fr/category/actualite/','https://www.bergerac.fr/feed/','https://www.sudouest.fr/dordogne/cyberattaque-dans-des-supermarches-plusieurs-magasins-vises-en-dordogne-31039218.php']),
    ('corpus:collectivites-24-grand-perigueux-communaute-d-agglomeration', ARRAY['https://www.grandperigueux.fr/','https://www.grandperigueux.fr/actualites/','https://www.grandperigueux.fr/feed/','https://www.sudouest.fr/economie/transports/le-reseau-de-transports-du-grand-perigueux-alerte-contre-une-arnaque-23788236.php']),
    ('corpus:collectivites-24-annuaire-des-communes-et-intercommunalites-de-la-dordogne', ARRAY['https://www.annuaire-mairie.fr/departement-dordogne.html']),
    ('corpus:collectivites-24-sdis-24-service-departemental-d-incendie-et-de-secours', ARRAY['https://www.sdis24.fr/','https://www.sdis24.fr/category/actualites/','https://www.sdis24.fr/rss'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-24 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES ('https://www.dordogne.gouv.fr/', 'text/html; charset=utf-8'),
       ('https://www.dordogne.gouv.fr/Actualites', 'text/html; charset=utf-8'),
       ('https://www.dordogne.gouv.fr/Actualites/Site-www.internet-signalement.gouv.fr-la-lutte-contre-l-internet-illicite', 'text/html; charset=utf-8'),
       ('https://dordogne.cci.fr/', 'text/html; charset=UTF-8'),
       ('https://dordogne.cci.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://dordogne.cci.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://dordogne.cci.fr/notre-engagement-a-proteger-vos-donnees-generees-par-nos-interactions-sur-ce-site-internet/', 'text/html; charset=UTF-8'),
       ('https://dordogne.chambres-agriculture.fr/', 'text/html; charset=utf-8'),
       ('https://dordogne.chambres-agriculture.fr/actualites-1', 'text/html; charset=utf-8'),
       ('https://www.sudouest.fr/economie/agriculture/agriculture-panne-d-equarrissage-en-dordogne-a-cause-d-un-piratage-informatique-22756929.php', 'text/html; charset=UTF-8'),
       ('https://ccdordogne-bessede.fr/', 'text/html; charset=UTF-8'),
       ('https://ccdordogne-bessede.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://ccdordogne-bessede.fr/feed/', 'text/xml;charset=UTF-8'),
       ('https://ccdordogne-bessede.fr/alerte-message-frauduleux/', 'text/html; charset=UTF-8'),
       ('https://bussac-dordogne.fr/', 'text/html'),
       ('https://bussac-dordogne.fr/category/actualites/', 'text/html'),
       ('https://bussac-dordogne.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://bussac-dordogne.fr/2026/08/07/information-piratage-site-internet-du-smctom/', 'text/html'),
       ('https://www.chasseurs24.com/', 'text/html; charset=UTF-8'),
       ('https://www.chasseurs24.com/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.chasseurs24.com/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.chasseurs24.com/2026/01/26/indisponibilite-de-services/', 'text/html; charset=UTF-8'),
       ('https://www.sudouest.fr/dordogne/', 'text/html; charset=UTF-8'),
       ('https://www.sudouest.fr/dordogne/rss.xml', 'application/xml'),
       ('https://www.sudouest.fr/economie/cybersecurite/les-qr-codes-d-horodateurs-pirates-en-dordogne-25534143.php', 'text/html; charset=UTF-8'),
       ('https://www.dordognelibre.fr/', 'text/html; charset=UTF-8'),
       ('https://www.dordognelibre.fr/dordogne/', 'text/html; charset=UTF-8'),
       ('https://www.dordognelibre.fr/rss.xml', 'application/xml'),
       ('https://www.dordognelibre.fr/dordogne/riberac/riberac-liberte-fm-victime-d-un-piratage-lance-une-cagnotte-31290979.php', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/dordogne-24', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/dordogne-24/marsac-sur-l-isle/des-escrocs-se-font-passer-par-mail-pour-une-mairie-de-dordogne-marsac-sur-l-isle-7406566', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss', 'text/xml; charset=UTF-8'),
       ('https://www.sudouest.fr/dordogne/mussidan/isle-et-crempse-en-perigord-le-vote-du-budget-communautaire-reporte-a-la-suite-d-un-piratage-informatique-28052389.php', 'text/html; charset=UTF-8'),
       ('https://www.perigueux.fr/', 'text/html; charset=utf-8'),
       ('https://www.perigueux.fr/actualites.html', 'text/html; charset=utf-8'),
       ('https://www.perigueux.fr/actualites/flux-actualites/rss.xml', 'application/xml; charset=utf-8'),
       ('https://www.sudouest.fr/economie/transports/le-reseau-de-transports-du-grand-perigueux-alerte-contre-une-arnaque-23788236.php', 'text/html; charset=UTF-8'),
       ('https://www.bergerac.fr/', 'text/html; charset=UTF-8'),
       ('https://www.bergerac.fr/category/actualite/', 'text/html; charset=UTF-8'),
       ('https://www.bergerac.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.sudouest.fr/dordogne/cyberattaque-dans-des-supermarches-plusieurs-magasins-vises-en-dordogne-31039218.php', 'text/html; charset=UTF-8'),
       ('https://www.grandperigueux.fr/', 'text/html; charset=UTF-8'),
       ('https://www.grandperigueux.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.grandperigueux.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.annuaire-mairie.fr/departement-dordogne.html', 'text/html; charset=UTF-8'),
       ('https://www.sdis24.fr/', 'text/html; charset=UTF-8'),
       ('https://www.sdis24.fr/category/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.sdis24.fr/rss', 'application/rss+xml; charset=UTF-8')) AS t(url, type_contenu) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
