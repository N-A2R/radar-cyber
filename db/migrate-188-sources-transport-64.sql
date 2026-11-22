-- Sources d'information du secteur transport dans le departement 64 (Pyrenees-Atlantiques).
-- 11 sources, 42 URL controlees en HTTP 200 le 2026-11-22 (curl -L, UA navigateur).
-- Corpus : bench/corpus/sources-transport-64.jsonl
-- Controle : bench/results/verification-sources-transport-64.json
CREATE TABLE IF NOT EXISTS source_verification (
  id bigserial PRIMARY KEY,
  source_id text NOT NULL,
  url text NOT NULL,
  code_http integer,
  content_type text,
  items integer,
  derniere_item_at timestamptz,
  ms integer,
  verifie_at timestamptz,
  user_agent text,
  etat text,
  motif text
);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:transport64-01-txik-txak', 'Txik Txak — réseau de transports de l''Agglomération Pays Basque Adour', 'cti', 'https://www.txiktxak.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":1}}'::jsonb, 3600, 'réseau de transport public (Pays Basque, 64), secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Samedi 21 novembre : déviation du centre-ville de Bayonne — https://www.txiktxak.fr/quoi-de-neuf-sur-txik-txak/samedi-21-novembre-deviation-centre-ville-de-bayonne/', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-02-idelis', 'Idelis — transport à la demande et mobilités du Pays Basque', 'cti', 'https://www.idelis.fr/decouvrir-idelis/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":2}}'::jsonb, 3600, 'réseau de transport à la demande, secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Idelis s''engage pour Movember — https://www.idelis.fr/decouvrir-idelis/actualites/idelis-sengage-pour-movember', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-03-aeroport-biarritz-pays-basque', 'Aéroport de Biarritz Pays Basque', 'cti', 'https://biarritz.aeroport.fr/fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":3}}'::jsonb, 3600, 'aéroport (Biarritz-Anglet-Bayonne, 64), secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Dans les coulisses de l''aéroport de Biarritz Pays Basque — https://biarritz.aeroport.fr/fr/dans-les-coulisses-de-laeroport-de-biarritz-pays-basque-%e2%9c%88%ef%b8%8f/', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-04-aeroport-pau-pyrenees', 'Air''py — aéroport Pau Pyrénées', 'cti', 'https://www.pau-aeroport.fr/rss/fr/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":4}}'::jsonb, 3600, 'aéroport (Pau, 64), secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Paris à partir de 64 euros TTC A-S avec Amelia — https://www.pau-aeroport.fr/aeroport/actualite/paris-a-partir-de-64-euros-ttc-a-s-avec-amelia-209.html', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-05-cci-pau-bearn', 'CCI Pau Béarn', 'cti', 'https://pau.cci.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":5}}'::jsonb, 3600, 'chambre consulaire (commerce, transport et logistique), secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Le rendez-vous des cédants et repreneurs, 23 novembre 2026 — https://pau.cci.fr/le-rendez-vous-des-cedants-et-repreneurs-23-novembre-2026/', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-06-otre-pays-adour', 'OTRE Pays Adour', 'cti', 'https://otrepaysadour.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":6}}'::jsonb, 3600, 'fédération des transporteurs routiers (Pays Adour, dont 64), secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Crise des carburants : l''OTRE suspend sa mobilisation — https://otrepaysadour.fr/crise-des-carburants-lotre-suspend-sa-mobilisation-des-21-et-22-octobre-apres-la-confirmation-officielle-des-engagements-du-gouvernement/', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-07-la-republique-des-pyrenees-transports', 'La République des Pyrénées — rubrique transports', 'presse', 'https://www.larepubliquedespyrenees.fr/economie/transports/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":7}}'::jsonb, 3600, 'presse locale (Pau, 64), secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Haut Béarn : la navette périurbaine stoppée en fin d''année — https://www.larepubliquedespyrenees.fr/economie/transports/haut-bearn-la-navette-periurbaine-stoppee-en-fin-d-annee-un-dispositif-de-transport-a-la-demande-en-reflexion-31360626.php', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-08-ici-pyrenees-atlantiques-64', 'ICI Pyrénées-Atlantiques (64)', 'presse', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":8}}'::jsonb, 3600, 'radio publique locale, secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Agglomération Pays Basque : fin anticipée du contrat RATP Dev pour les bus Txik Txak — https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64/bayonne/l-agglomeration-pays-basque-accepte-une-fin-anticipee-de-son-contrat-avec-ratp-dev-pour-les-lignes-de-bus-txik-txak-8868340', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-09-union-tlf-sud-ouest', 'Union TLF Sud-Ouest', 'cti', 'https://e-tlf.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":9}}'::jsonb, 3600, 'fédération régionale du transport et de la logistique, secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Note de conjoncture de la logistique, octobre 2026 — https://e-tlf.com/nos-actualites/note-de-conjoncture-de-la-logistique-octobre-2026/', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-10-fntr', 'FNTR — Fédération nationale des transports routiers', 'cti', 'https://fntr.fr/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":10}}'::jsonb, 3600, 'fédération professionnelle, secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Cyberattaques dans le transport routier de marchandises : le coût et les conseils — https://www.transportinfo.fr/cybersecurite-dans-le-trm-combien-ca-peut-vous-couter-nos-conseils-pour-garder-la-main/', 'Nouvelle-Aquitaine', '64'),
  ('corpus:transport64-11-transport-info', 'Transport Info', 'presse', 'https://www.transportinfo.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-64.jsonl","ligne":11}}'::jsonb, 3600, 'presse professionnelle transport et logistique, secteur transport, departement 64 (Pyrenees-Atlantiques). Exemple cyber : Kevin Lenoir, dirigeant d''Ekleo : 50 % de transport zéro émission d''ici 2030 — https://www.transportinfo.fr/kevin-lenoir-dirigeant-dekleo-notre-objectif-est-datteindre-50-de-transport-zero-emission-dici-2030/', 'Nouvelle-Aquitaine', '64')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de verification HTTP des 42 URL du corpus (39 couples source/url uniques), toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus transport-64 : HTTP 200 verifie le 2026-11-22'
FROM (VALUES
  ('corpus:transport64-01-txik-txak', 'https://www.txiktxak.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-01-txik-txak', 'https://www.txiktxak.fr/category/quoi-de-neuf-sur-txik-txak/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-01-txik-txak', 'https://www.txiktxak.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport64-01-txik-txak', 'https://www.txiktxak.fr/quoi-de-neuf-sur-txik-txak/samedi-21-novembre-deviation-centre-ville-de-bayonne/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-02-idelis', 'https://www.idelis.fr/', 'text/html; charset=utf-8'),
  ('corpus:transport64-02-idelis', 'https://www.idelis.fr/decouvrir-idelis/actualites', 'text/html; charset=utf-8'),
  ('corpus:transport64-02-idelis', 'https://www.idelis.fr/decouvrir-idelis/actualites/idelis-sengage-pour-movember', 'text/html; charset=utf-8'),
  ('corpus:transport64-03-aeroport-biarritz-pays-basque', 'https://biarritz.aeroport.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-03-aeroport-biarritz-pays-basque', 'https://biarritz.aeroport.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-03-aeroport-biarritz-pays-basque', 'https://biarritz.aeroport.fr/fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport64-03-aeroport-biarritz-pays-basque', 'https://biarritz.aeroport.fr/fr/dans-les-coulisses-de-laeroport-de-biarritz-pays-basque-%e2%9c%88%ef%b8%8f/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-04-aeroport-pau-pyrenees', 'https://www.pau-aeroport.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-04-aeroport-pau-pyrenees', 'https://www.pau-aeroport.fr/aeroport/actualite/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-04-aeroport-pau-pyrenees', 'https://www.pau-aeroport.fr/rss/fr/', 'text/xml;charset=UTF-8'),
  ('corpus:transport64-04-aeroport-pau-pyrenees', 'https://www.pau-aeroport.fr/aeroport/actualite/paris-a-partir-de-64-euros-ttc-a-s-avec-amelia-209.html', 'text/html; charset=UTF-8'),
  ('corpus:transport64-05-cci-pau-bearn', 'https://www.pau.cci.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-05-cci-pau-bearn', 'https://pau.cci.fr/blog/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-05-cci-pau-bearn', 'https://pau.cci.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport64-05-cci-pau-bearn', 'https://pau.cci.fr/le-rendez-vous-des-cedants-et-repreneurs-23-novembre-2026/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-06-otre-pays-adour', 'https://otrepaysadour.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-06-otre-pays-adour', 'https://otrepaysadour.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-06-otre-pays-adour', 'https://otrepaysadour.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport64-06-otre-pays-adour', 'https://otrepaysadour.fr/crise-des-carburants-lotre-suspend-sa-mobilisation-des-21-et-22-octobre-apres-la-confirmation-officielle-des-engagements-du-gouvernement/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-07-la-republique-des-pyrenees-transports', 'https://www.larepubliquedespyrenees.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-07-la-republique-des-pyrenees-transports', 'https://www.larepubliquedespyrenees.fr/economie/transports/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-07-la-republique-des-pyrenees-transports', 'https://www.larepubliquedespyrenees.fr/economie/transports/rss.xml', 'application/xml'),
  ('corpus:transport64-07-la-republique-des-pyrenees-transports', 'https://www.larepubliquedespyrenees.fr/economie/transports/haut-bearn-la-navette-periurbaine-stoppee-en-fin-d-annee-un-dispositif-de-transport-a-la-demande-en-reflexion-31360626.php', 'text/html; charset=UTF-8'),
  ('corpus:transport64-08-ici-pyrenees-atlantiques-64', 'https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64', 'text/html; charset=UTF-8'),
  ('corpus:transport64-08-ici-pyrenees-atlantiques-64', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'application/xml'),
  ('corpus:transport64-08-ici-pyrenees-atlantiques-64', 'https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64/bayonne/l-agglomeration-pays-basque-accepte-une-fin-anticipee-de-son-contrat-avec-ratp-dev-pour-les-lignes-de-bus-txik-txak-8868340', 'text/html; charset=UTF-8'),
  ('corpus:transport64-09-union-tlf-sud-ouest', 'https://e-tlf.com/nos-regions/tlf-sud-ouest/', 'text/html; charset=utf-8'),
  ('corpus:transport64-09-union-tlf-sud-ouest', 'https://e-tlf.com/nos-actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-09-union-tlf-sud-ouest', 'https://e-tlf.com/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport64-09-union-tlf-sud-ouest', 'https://e-tlf.com/nos-actualites/note-de-conjoncture-de-la-logistique-octobre-2026/', 'text/html; charset=utf-8'),
  ('corpus:transport64-10-fntr', 'https://fntr.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-10-fntr', 'https://www.transportinfo.fr/cybersecurite-dans-le-trm-combien-ca-peut-vous-couter-nos-conseils-pour-garder-la-main/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-11-transport-info', 'https://www.transportinfo.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport64-11-transport-info', 'https://www.transportinfo.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport64-11-transport-info', 'https://www.transportinfo.fr/kevin-lenoir-dirigeant-dekleo-notre-objectif-est-datteindre-50-de-transport-zero-emission-dici-2030/', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (SELECT 1 FROM source_verification x WHERE x.source_id = v.source_id AND x.url = v.url);
