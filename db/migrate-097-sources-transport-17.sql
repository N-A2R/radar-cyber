-- Sources d'information du secteur transport dans le departement 17 (Charente-Maritime).
-- 11 sources, 42 URLs controlees en HTTP 200 le 2026-11-22 (curl -L, UA navigateur).
-- Corpus : bench/corpus/sources-transport-17.jsonl
-- Controle : bench/results/verification-sources-transport-17.json
CREATE TABLE IF NOT EXISTS source_verification (
  id bigserial PRIMARY KEY, source_id text NOT NULL, url text NOT NULL, code_http integer,
  content_type text, items integer, derniere_item_at timestamptz, ms integer,
  verifie_at timestamptz, user_agent text, etat text, motif text
);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:transport17-01-union-maritime-de-la-rochelle-umlr', 'Union Maritime de La Rochelle (UMLR)', 'cti', 'https://www.umlr.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":1}}'::jsonb, 3600, 'fédération professionnelle maritime et portuaire, secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Bourse Maritime Agricole 2026 La Rochelle Pallice — https://www.umlr.fr/2026/06/29/bourse-maritime-agricole-la-rochelle-pallice/', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-02-port-atlantique-la-rochelle', 'Port Atlantique La Rochelle', 'cti', 'https://www.larochelle.port.fr/nos-engagements/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":2}}'::jsonb, 3600, 'port public (fret et logistique), secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Bilan 2025 du port de La Rochelle — https://www.larochelle.port.fr/nos-engagements/actualites/1414-bilan-2025.html', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-03-port-charente-atlantique', 'Port Charente Atlantique', 'cti', 'https://port-charente-atlantique.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":3}}'::jsonb, 3600, 'port de commerce (Rochefort et Tonnay-Charente), secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Décarbonation : le Port Charente Atlantique engage une nouvelle étape pour préparer l''avenir de ses activités et de son territoire — https://port-charente-atlantique.fr/decarbonation-le-port-charente-atlantique-engage-une-nouvelle-etape-pour-preparer-lavenir-de-ses-activites-et-de-son-territoire/', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-04-atlantic-cluster', 'Atlantic Cluster', 'cti', 'https://atlantic-cluster.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":4}}'::jsonb, 3600, 'cluster économique maritime et logistique, secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Immense succès pour la Première Convention Annuelle des membres de l''Atlantic Cluster ! — https://atlantic-cluster.com/immense-succes-pour-la-premiere-convention-annuelle-des-membres-de-latlantic-cluster/', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-05-groupe-sica-atlantique', 'Groupe SICA Atlantique', 'cti', 'https://www.sica-atlantique.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":5}}'::jsonb, 3600, 'entreprise de logistique et de manutention céréalière, secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Sortie de notre Newsletter de juin 2026 — https://www.sica-atlantique.com/sortie-de-notre-newsletter-de-juin-2026/', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-06-groupe-sarrion', 'Groupe Sarrion', 'cti', 'https://www.sarrion-transports.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":6}}'::jsonb, 3600, 'entreprise de transport routier et logistique, secteur transport, departement 17 (Charente-Maritime). Exemple cyber : 1ère réunion du nouveau Comité RSE — https://www.sarrion-transports.fr/1ere-reunion-du-nouveau-comite-rse/', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-07-ferrocampus', 'Ferrocampus', 'cti', 'https://www.ferrocampus.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":7}}'::jsonb, 3600, 'association de mobilité et d''innovation ferroviaire, secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Consultation nationale : Le développement des compétences ferroviaires de demain — https://www.ferrocampus.fr/competences-ferroviaires-de-demain-alpha/', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-08-carabus-reseau-de-bus-de-royan', 'Cara''bus — réseau de bus de Royan', 'cti', 'https://www.cara-bus.com/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":8}}'::jsonb, 3600, 'réseau de transport public urbain, secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Actu du nouveau sur votre réseau à partir du 2 novembre 2026 — https://www.cara-bus.com/actualites/actu-du-nouveau-sur-votre-reseau-a-partir-du-2-novembre-2026-1289/', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-09-yelo-mobilites-agglo-la-rochelle', 'Yélo Mobilités — Agglo La Rochelle', 'cti', 'https://www.yelo-larochelle.fr/?feed=rss2&post_type=news', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":9}}'::jsonb, 3600, 'opérateur de mobilités (bus, vélos, transport à la demande), secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Modification des lignes scolaires le 30 novembre 2026 — https://www.yelo-larochelle.fr/news/modification-des-lignes-scolaires-le-30-novembre-2026/', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-10-actu-fr-charente-maritime', 'actu.fr — Charente-Maritime', 'presse', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":10}}'::jsonb, 3600, 'presse en ligne locale, secteur transport, departement 17 (Charente-Maritime). Exemple cyber : C''est Noël avant l''heure à La Rochelle, les bus Yélo seront gratuits certains week-ends de décembre : voici lesquels — https://actu.fr/nouvelle-aquitaine/la-rochelle_17300/c-est-noel-avant-l-heure-a-la-rochelle-les-bus-yelo-seront-gratuits-certains-week-ends-de-decembre-voici-lesquels_65052715.html', 'Nouvelle-Aquitaine', '17'),
  ('corpus:transport17-11-ici-charente-maritime', 'ICI Charente-Maritime', 'presse', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-17.jsonl","ligne":11}}'::jsonb, 3600, 'radio publique locale, secteur transport, departement 17 (Charente-Maritime). Exemple cyber : Un poids lourd couché en travers de la chaussée : circulation coupée sur l''A10 entre Saint-Jean-d''Angély et Saintes — https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/port-d-envaux/un-poids-lourd-couche-en-travers-de-la-chaussee-circulation-coupee-sur-l-a10-entre-saint-jean-d-angely-et-saintes-7331491', 'Nouvelle-Aquitaine', '17')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family,
  url = EXCLUDED.url, format = EXCLUDED.format, parser = EXCLUDED.parser,
  description = EXCLUDED.description;

-- Trace de verification HTTP des URLs du corpus (site, actualites, flux et article cyber), toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus transport-17 : HTTP 200 verifie le 2026-11-22'
FROM (VALUES
  ('corpus:transport17-01-union-maritime-de-la-rochelle-umlr', 'https://www.umlr.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-01-union-maritime-de-la-rochelle-umlr', 'https://www.umlr.fr/category/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-01-union-maritime-de-la-rochelle-umlr', 'https://www.umlr.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport17-01-union-maritime-de-la-rochelle-umlr', 'https://www.umlr.fr/2026/06/29/bourse-maritime-agricole-la-rochelle-pallice/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-02-port-atlantique-la-rochelle', 'https://www.larochelle.port.fr/', 'text/html; charset=utf-8'),
  ('corpus:transport17-02-port-atlantique-la-rochelle', 'https://www.larochelle.port.fr/nos-engagements/actualites/', 'text/html; charset=utf-8'),
  ('corpus:transport17-02-port-atlantique-la-rochelle', 'https://www.larochelle.port.fr/nos-engagements/actualites/1414-bilan-2025.html', 'text/html; charset=utf-8'),
  ('corpus:transport17-03-port-charente-atlantique', 'https://port-charente-atlantique.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-03-port-charente-atlantique', 'https://port-charente-atlantique.fr/actualites-du-port-charente-atlantique/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-03-port-charente-atlantique', 'https://port-charente-atlantique.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport17-03-port-charente-atlantique', 'https://port-charente-atlantique.fr/decarbonation-le-port-charente-atlantique-engage-une-nouvelle-etape-pour-preparer-lavenir-de-ses-activites-et-de-son-territoire/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-04-atlantic-cluster', 'https://atlantic-cluster.com/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-04-atlantic-cluster', 'https://atlantic-cluster.com/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-04-atlantic-cluster', 'https://atlantic-cluster.com/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport17-04-atlantic-cluster', 'https://atlantic-cluster.com/immense-succes-pour-la-premiere-convention-annuelle-des-membres-de-latlantic-cluster/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-05-groupe-sica-atlantique', 'https://www.sica-atlantique.com/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-05-groupe-sica-atlantique', 'https://www.sica-atlantique.com/notre-actualite/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-05-groupe-sica-atlantique', 'https://www.sica-atlantique.com/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport17-05-groupe-sica-atlantique', 'https://www.sica-atlantique.com/sortie-de-notre-newsletter-de-juin-2026/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-06-groupe-sarrion', 'https://www.sarrion-transports.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-06-groupe-sarrion', 'https://www.sarrion-transports.fr/le-blog/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-06-groupe-sarrion', 'https://www.sarrion-transports.fr/feed/', 'application/rss+xml'),
  ('corpus:transport17-06-groupe-sarrion', 'https://www.sarrion-transports.fr/1ere-reunion-du-nouveau-comite-rse/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-07-ferrocampus', 'https://www.ferrocampus.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-07-ferrocampus', 'https://www.ferrocampus.fr/les-actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-07-ferrocampus', 'https://www.ferrocampus.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport17-07-ferrocampus', 'https://www.ferrocampus.fr/competences-ferroviaires-de-demain-alpha/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-08-carabus-reseau-de-bus-de-royan', 'https://www.cara-bus.com/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-08-carabus-reseau-de-bus-de-royan', 'https://www.cara-bus.com/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-08-carabus-reseau-de-bus-de-royan', 'https://www.cara-bus.com/actualites/actu-du-nouveau-sur-votre-reseau-a-partir-du-2-novembre-2026-1289/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-09-yelo-mobilites-agglo-la-rochelle', 'https://www.yelo-larochelle.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-09-yelo-mobilites-agglo-la-rochelle', 'https://www.yelo-larochelle.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-09-yelo-mobilites-agglo-la-rochelle', 'https://www.yelo-larochelle.fr/?feed=rss2&post_type=news', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport17-09-yelo-mobilites-agglo-la-rochelle', 'https://www.yelo-larochelle.fr/news/modification-des-lignes-scolaires-le-30-novembre-2026/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-10-actu-fr-charente-maritime', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17/', 'text/html; charset=UTF-8'),
  ('corpus:transport17-10-actu-fr-charente-maritime', 'https://actu.fr/nouvelle-aquitaine/charente-maritime_17/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:transport17-10-actu-fr-charente-maritime', 'https://actu.fr/nouvelle-aquitaine/la-rochelle_17300/c-est-noel-avant-l-heure-a-la-rochelle-les-bus-yelo-seront-gratuits-certains-week-ends-de-decembre-voici-lesquels_65052715.html', 'text/html; charset=UTF-8'),
  ('corpus:transport17-11-ici-charente-maritime', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17', 'text/html; charset=UTF-8'),
  ('corpus:transport17-11-ici-charente-maritime', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/actu', 'text/html; charset=UTF-8'),
  ('corpus:transport17-11-ici-charente-maritime', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'application/xml'),
  ('corpus:transport17-11-ici-charente-maritime', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/port-d-envaux/un-poids-lourd-couche-en-travers-de-la-chaussee-circulation-coupee-sur-l-a10-entre-saint-jean-d-angely-et-saintes-7331491', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (SELECT 1 FROM source_verification x WHERE x.source_id = v.source_id AND x.url = v.url);
