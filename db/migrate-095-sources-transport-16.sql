-- Sources d'information du secteur transport dans le departement 16 (Charente).
-- 8 sources, 28 URL distinctes controlees en HTTP 200 le 2026-11-22
-- (curl -L, redirections suivies, User-Agent navigateur).
-- Corpus detaille : bench/corpus/sources-transport-16.jsonl
-- Controle detaille : bench/results/verification-sources-transport-16.json
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
  ('corpus:transport16-01-stga-reseau-de-bus-du-grand-angouleme', 'STGA — réseau de bus du Grand Angoulême', 'cti', 'https://www.stga.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-16.jsonl","ligne":1}}'::jsonb, 3600, 'réseau de transport public, secteur transport, departement 16 (Charente). Exemple cyber : Nouvel outil : suivez votre ligne en temps réel sur une carte interactive — https://www.stga.fr/actualite/nouvel-outil-suivez-votre-ligne-en-temps-r%C3%A9el-sur-une-carte-interactive', 'Nouvelle-Aquitaine', '16'),
  ('corpus:transport16-02-aeroport-angouleme-cognac', 'Aéroport Angoulême-Cognac', 'cti', 'https://angouleme.aeroport.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-16.jsonl","ligne":2}}'::jsonb, 3600, 'aéroport, secteur transport, departement 16 (Charente). Exemple cyber : Vols retardés à l''aéroport de Bordeaux-Mérignac après une panne informatique nationale — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/vols-retardes-aeroport-bordeaux-merignac-apres-panne-informatique-nationale-1716593.html', 'Nouvelle-Aquitaine', '16'),
  ('corpus:transport16-03-grandangouleme-rubrique-mobilites', 'GrandAngoulême — rubrique Mobilités', 'cti', 'https://www.grandangouleme.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-16.jsonl","ligne":3}}'::jsonb, 3600, 'intercommunalité (politique de transport), secteur transport, departement 16 (Charente). Exemple cyber : Pôle d''échange multimodal (PEM) Sud-Angoumois – La Couronne — https://www.grandangouleme.fr/projets-de-territoire/pole-dechange-multimodal-pem-sud-angoumois-la-couronne/', 'Nouvelle-Aquitaine', '16'),
  ('corpus:transport16-04-france-3-nouvelle-aquitaine-charente', 'France 3 Nouvelle-Aquitaine — Charente', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-16.jsonl","ligne":4}}'::jsonb, 3600, 'télévision publique locale, secteur transport, departement 16 (Charente). Exemple cyber : Ligne SNCF Angoulême-Bordeaux : pendant les travaux sur les voies, les voyageurs passent du train aux autocars — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/angouleme/ligne-sncf-angouleme-bordeaux-pendant-les-travaux-sur-les-voies-les-voyageurs-passent-du-train-aux-autocars-3453519.html', 'Nouvelle-Aquitaine', '16'),
  ('corpus:transport16-05-ici-charente', 'ICI Charente', 'presse', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-16.jsonl","ligne":5}}'::jsonb, 3600, 'radio publique locale, secteur transport, departement 16 (Charente). Exemple cyber : Un poids lourd couché en travers de la chaussée : circulation coupée sur l''A10 entre Saint-Jean-d''Angély et Saintes — https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/port-d-envaux/un-poids-lourd-couche-en-travers-de-la-chaussee-circulation-coupee-sur-l-a10-entre-saint-jean-d-angely-et-saintes-7331491', 'Nouvelle-Aquitaine', '16'),
  ('corpus:transport16-06-grand-cognac-transports-et-mobilites', 'Grand Cognac — transports et mobilités', 'cti', 'https://www.grand-cognac.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-16.jsonl","ligne":6}}'::jsonb, 3600, 'intercommunalité (réseau Transcom), secteur transport, departement 16 (Charente). Exemple cyber : Se déplacer en bus avec Transcom — https://www.grand-cognac.fr/vivre-et-participer/transports-et-mobilites/se-deplacer-en-bus-avec-transcom', 'Nouvelle-Aquitaine', '16'),
  ('corpus:transport16-07-actu-fr-charente', 'actu.fr — Charente', 'presse', 'https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-16.jsonl","ligne":7}}'::jsonb, 3600, 'presse en ligne, secteur transport, departement 16 (Charente). Exemple cyber : Angoulême : des trains supprimés en direction de Bordeaux et de Saintes — https://actu.fr/nouvelle-aquitaine/angouleme_16015/angouleme-des-trains-supprimes-en-direction-de-bordeaux-et-de-saintes_65027590.html', 'Nouvelle-Aquitaine', '16'),
  ('corpus:transport16-08-le-journal-des-entreprises-nouvelle-aquitaine', 'Le Journal des Entreprises — Nouvelle-Aquitaine', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-16.jsonl","ligne":8}}'::jsonb, 3600, 'presse économique régionale, secteur transport, departement 16 (Charente). Exemple cyber : Le campus cyber Nouvelle-Aquitaine se dote d''une convention de coopération — https://www.lejournaldesentreprises.com/breve/le-campus-cyber-nouvelle-aquitaine-se-dote-dune-convention-de-cooperation-2078282', 'Nouvelle-Aquitaine', '16')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de verification HTTP des 28 URL du corpus (site, actualites, flux et article cyber), toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus transport-16 : HTTP 200 verifie le 2026-11-22'
FROM (VALUES
  ('corpus:transport16-01-stga-reseau-de-bus-du-grand-angouleme', 'https://www.stga.fr/', 'text/html; charset=utf-8'),
  ('corpus:transport16-01-stga-reseau-de-bus-du-grand-angouleme', 'https://www.stga.fr/actualites', 'text/html; charset=utf-8'),
  ('corpus:transport16-01-stga-reseau-de-bus-du-grand-angouleme', 'https://www.stga.fr/actualite/nouvel-outil-suivez-votre-ligne-en-temps-r%C3%A9el-sur-une-carte-interactive', 'text/html; charset=utf-8'),
  ('corpus:transport16-02-aeroport-angouleme-cognac', 'https://angouleme.aeroport.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport16-02-aeroport-angouleme-cognac', 'https://angouleme.aeroport.fr/category/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport16-02-aeroport-angouleme-cognac', 'https://angouleme.aeroport.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport16-02-aeroport-angouleme-cognac', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/vols-retardes-aeroport-bordeaux-merignac-apres-panne-informatique-nationale-1716593.html', 'text/html; charset=UTF-8'),
  ('corpus:transport16-03-grandangouleme-rubrique-mobilites', 'https://www.grandangouleme.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport16-03-grandangouleme-rubrique-mobilites', 'https://www.grandangouleme.fr/category/actualites/mobilites/', 'text/html; charset=UTF-8'),
  ('corpus:transport16-03-grandangouleme-rubrique-mobilites', 'https://www.grandangouleme.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport16-03-grandangouleme-rubrique-mobilites', 'https://www.grandangouleme.fr/projets-de-territoire/pole-dechange-multimodal-pem-sud-angoumois-la-couronne/', 'text/html; charset=UTF-8'),
  ('corpus:transport16-04-france-3-nouvelle-aquitaine-charente', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/', 'text/html; charset=UTF-8'),
  ('corpus:transport16-04-france-3-nouvelle-aquitaine-charente', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/rss', 'text/xml; charset=UTF-8'),
  ('corpus:transport16-04-france-3-nouvelle-aquitaine-charente', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente/angouleme/ligne-sncf-angouleme-bordeaux-pendant-les-travaux-sur-les-voies-les-voyageurs-passent-du-train-aux-autocars-3453519.html', 'text/html; charset=UTF-8'),
  ('corpus:transport16-05-ici-charente', 'https://www.ici.fr/nouvelle-aquitaine/charente-16', 'text/html; charset=UTF-8'),
  ('corpus:transport16-05-ici-charente', 'https://www.ici.fr/nouvelle-aquitaine/charente-16/actu', 'text/html; charset=UTF-8'),
  ('corpus:transport16-05-ici-charente', 'https://www.ici.fr/rss/la-rochelle/rubrique/infos.xml', 'application/xml'),
  ('corpus:transport16-05-ici-charente', 'https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/port-d-envaux/un-poids-lourd-couche-en-travers-de-la-chaussee-circulation-coupee-sur-l-a10-entre-saint-jean-d-angely-et-saintes-7331491', 'text/html; charset=UTF-8'),
  ('corpus:transport16-06-grand-cognac-transports-et-mobilites', 'https://www.grand-cognac.fr/', 'text/html; charset=utf-8'),
  ('corpus:transport16-06-grand-cognac-transports-et-mobilites', 'https://www.grand-cognac.fr/vivre-et-participer/transports-et-mobilites', 'text/html; charset=utf-8'),
  ('corpus:transport16-06-grand-cognac-transports-et-mobilites', 'https://www.grand-cognac.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:transport16-06-grand-cognac-transports-et-mobilites', 'https://www.grand-cognac.fr/vivre-et-participer/transports-et-mobilites/se-deplacer-en-bus-avec-transcom', 'text/html; charset=utf-8'),
  ('corpus:transport16-07-actu-fr-charente', 'https://actu.fr/nouvelle-aquitaine/charente_16/', 'text/html; charset=UTF-8'),
  ('corpus:transport16-07-actu-fr-charente', 'https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:transport16-07-actu-fr-charente', 'https://actu.fr/nouvelle-aquitaine/angouleme_16015/angouleme-des-trains-supprimes-en-direction-de-bordeaux-et-de-saintes_65027590.html', 'text/html; charset=UTF-8'),
  ('corpus:transport16-08-le-journal-des-entreprises-nouvelle-aquitaine', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 'text/html; charset=UTF-8'),
  ('corpus:transport16-08-le-journal-des-entreprises-nouvelle-aquitaine', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml; charset=UTF-8'),
  ('corpus:transport16-08-le-journal-des-entreprises-nouvelle-aquitaine', 'https://www.lejournaldesentreprises.com/breve/le-campus-cyber-nouvelle-aquitaine-se-dote-dune-convention-de-cooperation-2078282', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (SELECT 1 FROM source_verification x WHERE x.source_id = v.source_id AND x.url = v.url);
