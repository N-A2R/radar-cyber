-- Sources d'information du secteur « collectivites » du département 33 (Gironde).
-- 15 sources ; 42 contrôles HTTP sur 42 URL distinctes, toutes en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections, délai 20 s).
-- Corpus détaillé : bench/corpus/sources-collectivites-33.jsonl
-- Preuve HTTP : bench/results/verification-collectivites-33.json

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
  ('corpus:collectivites-33-20-minutes-bordeaux', '20 Minutes Bordeaux', 'cti', 'https://www.20minutes.fr/feeds/rss-bordeaux.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', '20 Minutes Bordeaux (33). aucun événement cyber trouvé concernant une collectivité girondine'),
  ('corpus:collectivites-33-amg33-association-des-maires-de-gironde', 'AMG33 — Association des Maires de Gironde', 'cti', 'https://amg33.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'AMG33 — Association des Maires de Gironde (33). Aucun incident cyber identifié ; l''AMG33 publie une page « Données personnelles » décrivant une collecte minimale via ses formulaires — https://amg33.fr/donnees-personnelles/'),
  ('corpus:collectivites-33-actu-fr-gironde', 'Actu.fr — Gironde', 'cti', 'https://actu.fr/nouvelle-aquitaine/gironde_33/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Actu.fr — Gironde (33). aucun événement cyber trouvé concernant une collectivité girondine'),
  ('corpus:collectivites-33-annuaire-des-communes-de-la-gironde-annuaire-mairie-fr', 'Annuaire des communes de la Gironde (annuaire-mairie.fr)', 'cti', 'https://www.annuaire-mairie.fr/departement-gironde.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Annuaire des communes de la Gironde (annuaire-mairie.fr) (33). Aucun événement cyber trouvé : l''annuaire départemental est une page de répertoire, sans rubrique d''actualités.'),
  ('corpus:collectivites-33-bordeaux-metropole', 'Bordeaux Métropole', 'cti', 'https://www.bordeaux-metropole.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Bordeaux Métropole (33). Fuite de données : un hacker affirme publier une base partielle attribuée au portail taxedesejour.bordeaux.metropole.fr, avec les données de 11 000 déclarants de la taxe de séjour et des adresses de locations touristiques (27/04/2026, Cyberattaque.org) — https://www.cyberattaque.org/bordeaux-metropole-fuite-de-11-000-declarants-de-la-taxe-de-sejour-et-adresses-de-locations-touristiques/'),
  ('corpus:collectivites-33-chambre-d-agriculture-de-la-gironde', 'Chambre d''agriculture de la Gironde', 'cti', 'https://gironde.chambres-agriculture.fr/actualites-33', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Chambre d''agriculture de la Gironde (33). Aucun fait cyber propre identifié sur le site de la chambre d''agriculture de la Gironde (recherche interne infructueuse).'),
  ('corpus:collectivites-33-conseil-departemental-de-la-gironde', 'Conseil départemental de la Gironde', 'cti', 'https://www.gironde.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Conseil départemental de la Gironde (33). Politique de divulgation des vulnérabilités (cybersécurité) — https://www.gironde.fr/linstitution/politique-de-divulgation-de-vulnerabilites'),
  ('corpus:collectivites-33-france-3-nouvelle-aquitaine-gironde', 'France 3 Nouvelle-Aquitaine — Gironde', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'France 3 Nouvelle-Aquitaine — Gironde (33). Cyberattaque : les services de la mairie de Berson (Gironde) paralysés, 200 communes touchées, soupçon de hackeur russe — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/on-pense-que-c-est-un-hackeur-russe-victime-d-une-cyberattaque-les-services-de-la-mairie-sont-paralyses-200-communes-touchees-3116668.html'),
  ('corpus:collectivites-33-federation-des-chasseurs-de-la-gironde', 'Fédération des chasseurs de la Gironde', 'cti', 'https://chasseurs33.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Fédération des chasseurs de la Gironde (33). Aucun fait cyber propre identifié sur le site de la fédération (vérification des actualités et du flux RSS).'),
  ('corpus:collectivites-33-le-mag-magazine-municipal-de-bordeaux', 'Le Mag — magazine municipal de Bordeaux', 'cti', 'https://www.bordeaux.fr/le-mag', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Le Mag — magazine municipal de Bordeaux (33). aucun événement cyber trouvé concernant une collectivité girondine'),
  ('corpus:collectivites-33-ville-de-bordeaux', 'Ville de Bordeaux', 'cti', 'https://www.bordeaux.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Ville de Bordeaux (33). Atelier municipal de prévention « Cliquez sur ce lien pour débloquer votre colis » : les dessous de l''arnaque au sms, sur le phishing par SMS et les techniques de piratage (bibliothèques de Bordeaux) — https://www.bordeaux.fr/agenda/cliquez-sur-ce-lien-pour-debloquer-votre-colis-les-dessous-de-larnaque-au-sms'),
  ('corpus:collectivites-33-ville-de-libourne', 'Ville de Libourne', 'cti', 'https://www.libourne.fr/information-transversale/actualites/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Ville de Libourne (33). aucun événement cyber trouvé'),
  ('corpus:collectivites-33-ville-de-merignac', 'Ville de Mérignac', 'cti', 'https://www.merignac.com/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Ville de Mérignac (33). aucun événement cyber trouvé'),
  ('corpus:collectivites-33-ville-de-pessac', 'Ville de Pessac', 'cti', 'https://www.pessac.fr/actualites-109/flux-rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'Ville de Pessac (33). aucun événement cyber trouvé'),
  ('corpus:collectivites-33-ici-gironde-ex-france-bleu-gironde', 'ici Gironde (ex-France Bleu Gironde)', 'cti', 'https://www.ici.fr/rss/gironde/a-la-une.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-33.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'ici Gironde (ex-France Bleu Gironde) (33). Faille de cybersécurité mondiale : les sites de la préfecture de la Gironde et de la mairie de Bordeaux inaccessibles — https://www.ici.fr/nouvelle-aquitaine/gironde-33/prefecture-de-la-gironde-mairie-de-bordeaux-plusieurs-sites-inaccessibles-apres-une-faille-de-cybersecurite-8046412')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:collectivites-33-20-minutes-bordeaux', ARRAY['https://www.20minutes.fr/bordeaux/', 'https://www.20minutes.fr/feeds/rss-bordeaux.xml']),
    ('corpus:collectivites-33-amg33-association-des-maires-de-gironde', ARRAY['https://amg33.fr/', 'https://amg33.fr/lactualite/', 'https://amg33.fr/feed/', 'https://amg33.fr/donnees-personnelles/']),
    ('corpus:collectivites-33-actu-fr-gironde', ARRAY['https://actu.fr/nouvelle-aquitaine/gironde_33/', 'https://actu.fr/nouvelle-aquitaine/gironde_33/rss.xml']),
    ('corpus:collectivites-33-annuaire-des-communes-de-la-gironde-annuaire-mairie-fr', ARRAY['https://www.annuaire-mairie.fr/departement-gironde.html']),
    ('corpus:collectivites-33-bordeaux-metropole', ARRAY['https://www.bordeaux-metropole.fr/', 'https://www.bordeaux-metropole.fr/actualites-Bordeaux-Metropole', 'https://www.bordeaux-metropole.fr/rss.xml', 'https://www.cyberattaque.org/bordeaux-metropole-fuite-de-11-000-declarants-de-la-taxe-de-sejour-et-adresses-de-locations-touristiques/']),
    ('corpus:collectivites-33-chambre-d-agriculture-de-la-gironde', ARRAY['https://gironde.chambres-agriculture.fr/', 'https://gironde.chambres-agriculture.fr/actualites-33']),
    ('corpus:collectivites-33-conseil-departemental-de-la-gironde', ARRAY['https://www.gironde.fr/', 'https://www.gironde.fr/actualites', 'https://www.gironde.fr/linstitution/politique-de-divulgation-de-vulnerabilites']),
    ('corpus:collectivites-33-france-3-nouvelle-aquitaine-gironde', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/on-pense-que-c-est-un-hackeur-russe-victime-d-une-cyberattaque-les-services-de-la-mairie-sont-paralyses-200-communes-touchees-3116668.html']),
    ('corpus:collectivites-33-federation-des-chasseurs-de-la-gironde', ARRAY['https://chasseurs33.com/', 'https://chasseurs33.com/actu/', 'https://chasseurs33.com/feed/']),
    ('corpus:collectivites-33-le-mag-magazine-municipal-de-bordeaux', ARRAY['https://www.bordeaux.fr/le-mag/le-mag-bordeaux-votre-magazine-municipal', 'https://www.bordeaux.fr/le-mag']),
    ('corpus:collectivites-33-ville-de-bordeaux', ARRAY['https://www.bordeaux.fr/', 'https://www.bordeaux.fr/toute-l-actualite', 'https://www.bordeaux.fr/rss.xml', 'https://www.bordeaux.fr/agenda/cliquez-sur-ce-lien-pour-debloquer-votre-colis-les-dessous-de-larnaque-au-sms']),
    ('corpus:collectivites-33-ville-de-libourne', ARRAY['https://www.libourne.fr/', 'https://www.libourne.fr/information-transversale/actualites', 'https://www.libourne.fr/information-transversale/actualites/rss']),
    ('corpus:collectivites-33-ville-de-merignac', ARRAY['https://www.merignac.com/', 'https://www.merignac.com/actualites', 'https://www.merignac.com/rss.xml']),
    ('corpus:collectivites-33-ville-de-pessac', ARRAY['https://www.pessac.fr/', 'https://www.pessac.fr/actualites-109.html', 'https://www.pessac.fr/actualites-109/flux-rss.xml']),
    ('corpus:collectivites-33-ici-gironde-ex-france-bleu-gironde', ARRAY['https://www.ici.fr/gironde/', 'https://www.ici.fr/nouvelle-aquitaine/gironde-33/', 'https://www.ici.fr/rss/gironde/a-la-une.xml', 'https://www.ici.fr/nouvelle-aquitaine/gironde-33/prefecture-de-la-gironde-mairie-de-bordeaux-plusieurs-sites-inaccessibles-apres-une-faille-de-cybersecurite-8046412'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-33 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://www.20minutes.fr/bordeaux/', 'text/html; charset=UTF-8'),
       ('https://www.20minutes.fr/feeds/rss-bordeaux.xml', 'application/xml'),
       ('https://amg33.fr/', 'text/html; charset=UTF-8'),
       ('https://amg33.fr/lactualite/', 'text/html; charset=UTF-8'),
       ('https://amg33.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://amg33.fr/donnees-personnelles/', 'text/html; charset=UTF-8'),
       ('https://actu.fr/nouvelle-aquitaine/gironde_33/', 'text/html; charset=UTF-8'),
       ('https://actu.fr/nouvelle-aquitaine/gironde_33/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://www.annuaire-mairie.fr/departement-gironde.html', 'text/html; charset=UTF-8'),
       ('https://www.bordeaux-metropole.fr/', 'text/html; charset=UTF-8'),
       ('https://www.bordeaux-metropole.fr/actualites-Bordeaux-Metropole', 'text/html; charset=UTF-8'),
       ('https://www.bordeaux-metropole.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://www.cyberattaque.org/bordeaux-metropole-fuite-de-11-000-declarants-de-la-taxe-de-sejour-et-adresses-de-locations-touristiques/', 'text/html; charset=UTF-8'),
       ('https://gironde.chambres-agriculture.fr/', 'text/html; charset=utf-8'),
       ('https://gironde.chambres-agriculture.fr/actualites-33', 'text/html; charset=utf-8'),
       ('https://www.gironde.fr/', 'text/html; charset=UTF-8'),
       ('https://www.gironde.fr/actualites', 'text/html; charset=UTF-8'),
       ('https://www.gironde.fr/linstitution/politique-de-divulgation-de-vulnerabilites', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/on-pense-que-c-est-un-hackeur-russe-victime-d-une-cyberattaque-les-services-de-la-mairie-sont-paralyses-200-communes-touchees-3116668.html', 'text/html; charset=UTF-8'),
       ('https://chasseurs33.com/', 'text/html; charset=UTF-8'),
       ('https://chasseurs33.com/actu/', 'text/html; charset=UTF-8'),
       ('https://chasseurs33.com/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.bordeaux.fr/le-mag/le-mag-bordeaux-votre-magazine-municipal', 'text/html; charset=utf-8'),
       ('https://www.bordeaux.fr/le-mag', 'text/html; charset=utf-8'),
       ('https://www.bordeaux.fr/', 'text/html; charset=utf-8'),
       ('https://www.bordeaux.fr/toute-l-actualite', 'text/html; charset=utf-8'),
       ('https://www.bordeaux.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://www.bordeaux.fr/agenda/cliquez-sur-ce-lien-pour-debloquer-votre-colis-les-dessous-de-larnaque-au-sms', 'text/html; charset=utf-8'),
       ('https://www.libourne.fr/', 'text/html; charset=utf-8'),
       ('https://www.libourne.fr/information-transversale/actualites', 'text/html; charset=utf-8'),
       ('https://www.libourne.fr/information-transversale/actualites/rss', 'text/xml;charset=utf-8'),
       ('https://www.merignac.com/', 'text/html; charset=UTF-8'),
       ('https://www.merignac.com/actualites', 'text/html; charset=UTF-8'),
       ('https://www.merignac.com/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://www.pessac.fr/', 'text/html; charset=utf-8'),
       ('https://www.pessac.fr/actualites-109.html', 'text/html; charset=utf-8'),
       ('https://www.pessac.fr/actualites-109/flux-rss.xml', 'text/xml;charset=utf-8'),
       ('https://www.ici.fr/gironde/', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/gironde-33/', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/rss/gironde/a-la-une.xml', 'application/xml'),
       ('https://www.ici.fr/nouvelle-aquitaine/gironde-33/prefecture-de-la-gironde-mairie-de-bordeaux-plusieurs-sites-inaccessibles-apres-une-faille-de-cybersecurite-8046412', 'text/html; charset=UTF-8')
     ) AS t(url, type_contenu) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
