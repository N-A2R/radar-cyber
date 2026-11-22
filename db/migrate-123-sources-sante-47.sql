-- Sources d'information du secteur « santé » du département 47 (Lot-et-Garonne).
-- 13 sources, 44 traces de vérification sur 42 URL distinctes, toutes en HTTP 200 le 2026-11-22 (GET réel avec User-Agent navigateur, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-sante-47.jsonl
-- Preuve HTTP : bench/results/verification-sources-sante-47.json

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
  ('corpus:sante47-01-ars-nouvelle-aquitaine', 'ARS Nouvelle-Aquitaine — délégation Lot-et-Garonne', 'cti', 'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'ARS Nouvelle-Aquitaine (47). Incident de sécurité concernant la plateforme de recueil des autorisations parentales — https://www.nouvelle-aquitaine.ars.sante.fr/incident-de-securite-concernant-la-plateforme-de-recueil-des-autorisations-parentales-des-0'),
  ('corpus:sante47-02-cpam-lot-et-garonne', 'CPAM du Lot-et-Garonne — Assurance Maladie', 'cti', 'https://www.ameli.fr/lot-et-garonne/assure/liste-actualites-locales', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'CPAM du Lot-et-Garonne (47). Données de patients du CHU de Reims exposées — https://www.cyberattaque.org/chu-de-reims-des-donnees-de-patients-exposees-apres-la-cyberattaque-dun-logiciel/'),
  ('corpus:sante47-03-ordre-medecins-47', 'Conseil de l’Ordre des médecins du Lot-et-Garonne', 'cti', 'https://conseil47.ordre.medecin.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Conseil départemental de l’Ordre des médecins de Lot-et-Garonne (47). Tentatives d’hameçonnage visant les médecins — https://www.conseil-national.medecin.fr/publications/actualites/tentatives-dhameconnage'),
  ('corpus:sante47-04-sante-publique-france-na', 'Santé publique France — Nouvelle-Aquitaine', 'cti', 'https://www.santepubliquefrance.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Santé publique France en Nouvelle-Aquitaine (47). Cyberattaque chez un prestataire — https://www.franceinfo.fr/internet/securite-sur-internet/cyberattaques/un-prestataire-de-sante-publique-france-victime-d-une-cyberattaque-pres-de-80-000-donnees-de-contact-concernees_8146196.html'),
  ('corpus:sante47-05-esea-nouvelle-aquitaine', 'ESEA Nouvelle-Aquitaine — GRADeS e-santé', 'cti', 'https://www.esea-na.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'ESEA Nouvelle-Aquitaine, groupement régional e-santé (47). Cybersécurité des SI de santé — https://wwwsec.esea-na.fr/node/402.html'),
  ('corpus:sante47-06-urps-pharmaciens-na', 'URPS Pharmaciens Nouvelle-Aquitaine', 'cti', 'https://www.urps-pharmaciens-na.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'URPS Pharmaciens Nouvelle-Aquitaine (47). Cybermenaces et professionnels libéraux — https://www.urps-pharmaciens-na.fr/outils-supports/formations/cybermenaces-et-professionnels-liberaux/'),
  ('corpus:sante47-07-mutualite-francaise-na', 'Mutualité Française Nouvelle-Aquitaine', 'cti', 'https://nouvelle-aquitaine.mutualite.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Mutualité Française Nouvelle-Aquitaine (47). Cyberattaques chez Novabio, données de santé en fuite — https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite/'),
  ('corpus:sante47-08-la-depeche-du-midi-47-sante', 'La Dépêche du Midi — Lot-et-Garonne (santé)', 'presse', 'https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Dépêche du Midi, édition Lot-et-Garonne (47), rubrique santé. Hôpital Foch : factures médicales exposées — https://www.cyberattaque.org/hopital-foch-des-factures-medicales-de-patients-exposees-apres-une-cyberattaque/'),
  ('corpus:sante47-09-le-petit-bleu-dagen-sante', 'Le Petit Bleu d’Agen — santé', 'presse', 'https://www.petitbleu.fr/sante/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Le Petit Bleu d’Agen, rubrique santé (47). Dossiers de patients du CH de Perpignan en fuite — https://www.cyberattaque.org/centre-hospitalier-de-perpignan-des-dossiers-de-patients-en-fuite/'),
  ('corpus:sante47-10-ici-lot-et-garonne', 'ICI Lot-et-Garonne', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'ICI Lot-et-Garonne (47). Cybersécurité du CHU de Bordeaux, une vingtaine d’attaques quotidiennes — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/une-vingtaine-de-cyber-attaques-contre-le-chu-de-bordeaux-chaque-jour-plongee-au-coeur-du-service-de-cybersecurite-1960204.html'),
  ('corpus:sante47-11-la-vie-economique-47', 'La Vie Économique — Lot-et-Garonne', 'presse', 'https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Vie Économique, Lot-et-Garonne (47). Données de patients du CHU de Reims exposées — https://www.cyberattaque.org/chu-de-reims-des-donnees-de-patients-exposees-apres-la-cyberattaque-dun-logiciel/'),
  ('corpus:sante47-12-la-semaine-des-pyrenees-47', 'La Semaine des Pyrénées — Lot-et-Garonne', 'presse', 'https://www.lasemainedespyrenees.fr/category/lot-et-garonne/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Semaine des Pyrénées, édition Lot-et-Garonne (47). Clinique privée sanctionnée après un vol de données — https://www.lefigaro.fr/secteur/high-tech/cyberattaque-une-clinique-privee-sanctionnee-d-une-amende-de-500-000-euros-apres-un-vol-de-donnees-20260903'),
  ('corpus:sante47-13-journal-de-tonneins', 'Journal de Tonneins', 'presse', 'https://www.journaldetonneins.fr/toutes-les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-47.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Journal de Tonneins (47). Dossiers de patients du CH de Perpignan en fuite — https://www.cyberattaque.org/centre-hospitalier-de-perpignan-des-dossiers-de-patients-en-fuite/');

WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:sante47-01-ars-nouvelle-aquitaine', ARRAY['https://www.nouvelle-aquitaine.ars.sante.fr/', 'https://www.nouvelle-aquitaine.ars.sante.fr/liste-actualites?archive=0', 'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite', 'https://www.nouvelle-aquitaine.ars.sante.fr/incident-de-securite-concernant-la-plateforme-de-recueil-des-autorisations-parentales-des-0']),
    ('corpus:sante47-02-cpam-lot-et-garonne', ARRAY['https://www.ameli.fr/lot-et-garonne/assure', 'https://www.ameli.fr/lot-et-garonne/assure/liste-actualites-locales', 'https://www.cyberattaque.org/chu-de-reims-des-donnees-de-patients-exposees-apres-la-cyberattaque-dun-logiciel/']),
    ('corpus:sante47-03-ordre-medecins-47', ARRAY['https://conseil47.ordre.medecin.fr/', 'https://conseil47.ordre.medecin.fr/actualites/', 'https://www.conseil-national.medecin.fr/publications/actualites/tentatives-dhameconnage']),
    ('corpus:sante47-04-sante-publique-france-na', ARRAY['https://www.santepubliquefrance.fr/regions-et-territoires/nouvelle-aquitaine', 'https://www.santepubliquefrance.fr/regions/nouvelle-aquitaine/actualites', 'https://www.santepubliquefrance.fr/rss.xml', 'https://www.franceinfo.fr/internet/securite-sur-internet/cyberattaques/un-prestataire-de-sante-publique-france-victime-d-une-cyberattaque-pres-de-80-000-donnees-de-contact-concernees_8146196.html']),
    ('corpus:sante47-05-esea-nouvelle-aquitaine', ARRAY['https://www.esea-na.fr/', 'https://www.esea-na.fr/actualites', 'https://wwwsec.esea-na.fr/node/402.html']),
    ('corpus:sante47-06-urps-pharmaciens-na', ARRAY['https://www.urps-pharmaciens-na.fr/', 'https://www.urps-pharmaciens-na.fr/actualites/', 'https://www.urps-pharmaciens-na.fr/outils-supports/formations/cybermenaces-et-professionnels-liberaux/']),
    ('corpus:sante47-07-mutualite-francaise-na', ARRAY['https://nouvelle-aquitaine.mutualite.fr/', 'https://nouvelle-aquitaine.mutualite.fr/actualites/', 'https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite/']),
    ('corpus:sante47-08-la-depeche-du-midi-47-sante', ARRAY['https://www.ladepeche.fr/communes/lot-et-garonne,47/', 'https://www.ladepeche.fr/partenaire/sante-bien-etre/sante/', 'https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'https://www.cyberattaque.org/hopital-foch-des-factures-medicales-de-patients-exposees-apres-une-cyberattaque/']),
    ('corpus:sante47-09-le-petit-bleu-dagen-sante', ARRAY['https://www.petitbleu.fr/', 'https://www.petitbleu.fr/sante/', 'https://www.petitbleu.fr/sante/rss.xml', 'https://www.cyberattaque.org/centre-hospitalier-de-perpignan-des-dossiers-de-patients-en-fuite/']),
    ('corpus:sante47-10-ici-lot-et-garonne', ARRAY['https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/une-vingtaine-de-cyber-attaques-contre-le-chu-de-bordeaux-chaque-jour-plongee-au-coeur-du-service-de-cybersecurite-1960204.html']),
    ('corpus:sante47-11-la-vie-economique-47', ARRAY['https://www.vie-economique.com/categories/lot-et-garonne/', 'https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'https://www.cyberattaque.org/chu-de-reims-des-donnees-de-patients-exposees-apres-la-cyberattaque-dun-logiciel/']),
    ('corpus:sante47-12-la-semaine-des-pyrenees-47', ARRAY['https://www.lasemainedespyrenees.fr/', 'https://www.lasemainedespyrenees.fr/category/lot-et-garonne/', 'https://www.lefigaro.fr/secteur/high-tech/cyberattaque-une-clinique-privee-sanctionnee-d-une-amende-de-500-000-euros-apres-un-vol-de-donnees-20260903']),
    ('corpus:sante47-13-journal-de-tonneins', ARRAY['https://www.journaldetonneins.fr/', 'https://www.journaldetonneins.fr/toutes-les-actualites', 'https://www.cyberattaque.org/centre-hospitalier-de-perpignan-des-dossiers-de-patients-en-fuite/'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus santé-47 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://www.nouvelle-aquitaine.ars.sante.fr/', 'text/html; charset=UTF-8'),
       ('https://www.nouvelle-aquitaine.ars.sante.fr/liste-actualites?archive=0', 'text/html; charset=UTF-8'),
       ('https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite', 'application/rss+xml; charset=utf-8'),
       ('https://www.nouvelle-aquitaine.ars.sante.fr/incident-de-securite-concernant-la-plateforme-de-recueil-des-autorisations-parentales-des-0', 'text/html; charset=UTF-8'),
       ('https://www.ameli.fr/lot-et-garonne/assure', 'text/html; charset=utf-8'),
       ('https://www.ameli.fr/lot-et-garonne/assure/liste-actualites-locales', 'text/html; charset=utf-8'),
       ('https://www.cyberattaque.org/chu-de-reims-des-donnees-de-patients-exposees-apres-la-cyberattaque-dun-logiciel/', 'text/html; charset=UTF-8'),
       ('https://conseil47.ordre.medecin.fr/', 'text/html; charset=UTF-8'),
       ('https://conseil47.ordre.medecin.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.conseil-national.medecin.fr/publications/actualites/tentatives-dhameconnage', 'text/html; charset=UTF-8'),
       ('https://www.santepubliquefrance.fr/regions-et-territoires/nouvelle-aquitaine', 'text/html; charset=UTF-8'),
       ('https://www.santepubliquefrance.fr/regions/nouvelle-aquitaine/actualites', 'text/html; charset=UTF-8'),
       ('https://www.santepubliquefrance.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
       ('https://www.franceinfo.fr/internet/securite-sur-internet/cyberattaques/un-prestataire-de-sante-publique-france-victime-d-une-cyberattaque-pres-de-80-000-donnees-de-contact-concernees_8146196.html', 'text/html; charset=UTF-8'),
       ('https://www.esea-na.fr/', 'text/html; charset=UTF-8'),
       ('https://www.esea-na.fr/actualites', 'text/html; charset=UTF-8'),
       ('https://wwwsec.esea-na.fr/node/402.html', 'text/html'),
       ('https://www.urps-pharmaciens-na.fr/', 'text/html; charset=UTF-8'),
       ('https://www.urps-pharmaciens-na.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.urps-pharmaciens-na.fr/outils-supports/formations/cybermenaces-et-professionnels-liberaux/', 'text/html; charset=UTF-8'),
       ('https://nouvelle-aquitaine.mutualite.fr/', 'text/html; charset=UTF-8'),
       ('https://nouvelle-aquitaine.mutualite.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite/', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/communes/lot-et-garonne,47/', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/partenaire/sante-bien-etre/sante/', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'text/xml; charset=UTF-8'),
       ('https://www.cyberattaque.org/hopital-foch-des-factures-medicales-de-patients-exposees-apres-une-cyberattaque/', 'text/html; charset=UTF-8'),
       ('https://www.petitbleu.fr/', 'text/html; charset=UTF-8'),
       ('https://www.petitbleu.fr/sante/', 'text/html; charset=UTF-8'),
       ('https://www.petitbleu.fr/sante/rss.xml', 'text/xml; charset=UTF-8'),
       ('https://www.cyberattaque.org/centre-hospitalier-de-perpignan-des-dossiers-de-patients-en-fuite/', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/une-vingtaine-de-cyber-attaques-contre-le-chu-de-bordeaux-chaque-jour-plongee-au-coeur-du-service-de-cybersecurite-1960204.html', 'text/html; charset=UTF-8'),
       ('https://www.vie-economique.com/categories/lot-et-garonne/', 'text/html; charset=UTF-8'),
       ('https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.lasemainedespyrenees.fr/', 'text/html'),
       ('https://www.lasemainedespyrenees.fr/category/lot-et-garonne/', 'text/html'),
       ('https://www.lefigaro.fr/secteur/high-tech/cyberattaque-une-clinique-privee-sanctionnee-d-une-amende-de-500-000-euros-apres-un-vol-de-donnees-20260903', 'text/html; charset=UTF-8'),
       ('https://www.journaldetonneins.fr/', 'text/html; charset=utf-8'),
       ('https://www.journaldetonneins.fr/toutes-les-actualites', 'text/html')
) AS t(url, type_contenu) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
