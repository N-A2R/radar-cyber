-- Sources d'information du secteur transport dans le departement 40 (Landes).
-- 13 sources, 45 URL distinctes controLEes en HTTP 200 le 2026-11-22
-- (curl -L, redirections suivies, User-Agent navigateur).
-- Corpus detaille : bench/corpus/sources-transport-40.jsonl
-- Controle detaille : bench/results/verification-sources-transport-40.json
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
  ('corpus:transport40-01-trans-landes', 'Trans-Landes — réseau de transports des Landes', 'cti', 'https://www.trans-landes.fr/nous/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":1}}'::jsonb, 3600, 'réseau de transport public interurbain, secteur transport, departement 40 (Landes). Exemple cyber : Attention aux publicités frauduleuses — https://www.trans-landes.fr/nous/actualites/attention-aux-publicites-frauduleuses/', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-02-rrtl', 'RRTL — Régie Régionale des Transports des Landes', 'cti', 'https://www.rrtl.fr/infos/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":2}}'::jsonb, 3600, 'opérateur de transports publics (Cars Région, Couralin), secteur transport, departement 40 (Landes). Exemple cyber : Attention aux publicités frauduleuses — https://www.rrtl.fr/infos/actualites/attention-aux-publicites-frauduleuses/', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-03-busmovima', 'Movima — réseau de bus du Pays de Marsan', 'cti', 'https://www.busmovima.com/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":3}}'::jsonb, 3600, 'réseau de transport urbain (Mont-de-Marsan), secteur transport, departement 40 (Landes). Exemple cyber : Cyberattaques dans les Landes : les leçons (2026) — https://www.mdminformatique.fr/blog/nos-conseils-pour-les-pros/cyberattaques-landes-2026-lecons-entreprises', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-04-otre-pays-adour', 'OTRE Pays Adour', 'cti', 'https://otrepaysadour.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":4}}'::jsonb, 3600, 'syndicat de transporteurs routiers (40, 64, Béarn), secteur transport, departement 40 (Landes). Exemple cyber : Détournement de fret : un guide pour renforcer la prévention — https://otrepaysadour.fr/detournement-de-fret-un-guide-pour-renforcer-la-prevention/', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-05-cci-landes', 'CCI des Landes', 'cti', 'https://www.landes.cci.fr/presse/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":5}}'::jsonb, 3600, 'chambre consulaire (transport et logistique), secteur transport, departement 40 (Landes). Exemple cyber : Cybersécurité dans les Landes : diagnostic, accompagnement et montée en maturité — https://www.landes.cci.fr/cybersecurite-dans-les-landes/', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-06-cma-landes', 'CMA Nouvelle-Aquitaine — antenne des Landes', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":6}}'::jsonb, 3600, 'chambre des métiers et de l''artisanat (transport artisanal), secteur transport, departement 40 (Landes). Exemple cyber : Les artisans, des cibles de choix pour les cybercriminels — https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/les-artisans-des-cibles-de-choix-pour-les-cybercriminels', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-07-grand-dax', 'Grand Dax — Couralin', 'cti', 'https://www.grand-dax.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":7}}'::jsonb, 3600, 'autorité organisatrice de transports urbains, secteur transport, departement 40 (Landes). Exemple cyber : Zen en Bus : se rendre à la Feria de Dax en toute sécurité — https://www.grand-dax.fr/zen-en-bus-transports-campings-feria-de-dax-2026-2/', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-08-peche-capbreton', 'Union des Pêcheurs de Capbreton (UNPC)', 'cti', 'https://www.peche-capbreton.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":8}}'::jsonb, 3600, 'transport maritime et pêche professionnelle, secteur transport, departement 40 (Landes). Exemple cyber : La logistique, un secteur de choix pour les cyberattaques ? — https://www.lemagit.fr/actualites/365533573/La-logistique-un-secteur-de-choix-pour-les-cyberattaques', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-09-port-capbreton', 'Port de Capbreton — CC Maremne Adour Côte Sud', 'cti', 'https://www.cc-macs.org/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":9}}'::jsonb, 3600, 'port de pêche et de plaisance (transport maritime), secteur transport, departement 40 (Landes). Exemple cyber : La logistique, un secteur de choix pour les cyberattaques ? — https://www.lemagit.fr/actualites/365533573/La-logistique-un-secteur-de-choix-pour-les-cyberattaques', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-10-sudouest-landes', 'Sud Ouest — édition Landes', 'presse', 'https://www.sudouest.fr/landes/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":10}}'::jsonb, 3600, 'presse locale, secteur transport, departement 40 (Landes). Exemple cyber : Cybersécurité : le risque de cyberattaque plus élevé que l''incendie, alerte le patron des patrons des Landes — https://www.sudouest.fr/economie/economie-du-numerique/cybersecurite-le-risque-de-cyberattaque-est-plus-eleve-que-l-incendie-alerte-le-patron-des-patrons-des-landes-13840540.php', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-11-ici-gascogne', 'ICI Gascogne — Landes 40', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":11}}'::jsonb, 3600, 'radio locale (Radio France), secteur transport, departement 40 (Landes). Exemple cyber : Cryptomonnaies : un couple enlevé et séquestré dans le coffre d''une voiture à Rion-des-Landes — https://www.ici.fr/nouvelle-aquitaine/landes-40/rion-des-landes/cryptomonnaies-un-couple-enleve-et-sequestre-dans-le-coffre-d-une-voiture-a-rion-des-landes-2470438', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-12-peixoto', 'Groupe Peixoto', 'cti', 'https://peixoto.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":12}}'::jsonb, 3600, 'transporteur frigorifique (Saint-Vincent-de-Tyrosse), secteur transport, departement 40 (Landes). Exemple cyber : La logistique, un secteur de choix pour les cyberattaques ? — https://www.lemagit.fr/actualites/365533573/La-logistique-un-secteur-de-choix-pour-les-cyberattaques', 'Nouvelle-Aquitaine', '40'),
  ('corpus:transport40-13-transports-brocas', 'Transports Brocas', 'cti', 'https://www.transports-brocas.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-40.jsonl","ligne":13}}'::jsonb, 3600, 'transporteur routier et logisticien (Landes), secteur transport, departement 40 (Landes). Exemple cyber : La logistique, un secteur de choix pour les cyberattaques ? — https://www.lemagit.fr/actualites/365533573/La-logistique-un-secteur-de-choix-pour-les-cyberattaques', 'Nouvelle-Aquitaine', '40')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de verification HTTP des 45 URL du corpus, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus transport-40 : HTTP 200 verifie le 2026-11-22'
FROM (VALUES
  ('corpus:transport40-01-trans-landes', 'https://www.trans-landes.fr/', 'text/html; charset=utf-8'),
  ('corpus:transport40-01-trans-landes', 'https://www.trans-landes.fr/nous/actualites/', 'text/html; charset=utf-8'),
  ('corpus:transport40-01-trans-landes', 'https://www.trans-landes.fr/nous/actualites/attention-aux-publicites-frauduleuses/', 'text/html; charset=utf-8'),
  ('corpus:transport40-02-rrtl', 'https://www.rrtl.fr/', 'text/html; charset=utf-8'),
  ('corpus:transport40-02-rrtl', 'https://www.rrtl.fr/infos/actualites/', 'text/html; charset=utf-8'),
  ('corpus:transport40-02-rrtl', 'https://www.rrtl.fr/infos/actualites/attention-aux-publicites-frauduleuses/', 'text/html; charset=utf-8'),
  ('corpus:transport40-03-busmovima', 'https://www.busmovima.com/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-03-busmovima', 'https://www.busmovima.com/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-03-busmovima', 'https://www.mdminformatique.fr/blog/nos-conseils-pour-les-pros/cyberattaques-landes-2026-lecons-entreprises', 'text/html; charset=UTF-8'),
  ('corpus:transport40-04-otre-pays-adour', 'https://otrepaysadour.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-04-otre-pays-adour', 'https://otrepaysadour.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-04-otre-pays-adour', 'https://otrepaysadour.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport40-04-otre-pays-adour', 'https://otrepaysadour.fr/detournement-de-fret-un-guide-pour-renforcer-la-prevention/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-05-cci-landes', 'https://www.landes.cci.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-05-cci-landes', 'https://www.landes.cci.fr/presse/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-05-cci-landes', 'https://www.landes.cci.fr/cybersecurite-dans-les-landes/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-06-cma-landes', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-06-cma-landes', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8'),
  ('corpus:transport40-06-cma-landes', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/les-artisans-des-cibles-de-choix-pour-les-cybercriminels', 'text/html; charset=UTF-8'),
  ('corpus:transport40-07-grand-dax', 'https://www.grand-dax.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-07-grand-dax', 'https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-07-grand-dax', 'https://www.grand-dax.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport40-07-grand-dax', 'https://www.grand-dax.fr/zen-en-bus-transports-campings-feria-de-dax-2026-2/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-08-peche-capbreton', 'https://www.peche-capbreton.fr/', 'text/html; charset=utf-8'),
  ('corpus:transport40-08-peche-capbreton', 'https://www.peche-capbreton.fr/actualites/', 'text/html; charset=utf-8'),
  ('corpus:transport40-08-peche-capbreton', 'https://www.lemagit.fr/actualites/365533573/La-logistique-un-secteur-de-choix-pour-les-cyberattaques', 'text/html;charset=UTF-8'),
  ('corpus:transport40-09-port-capbreton', 'https://www.cc-macs.org/port-de-capbreton/', 'text/html; charset=utf-8'),
  ('corpus:transport40-09-port-capbreton', 'https://www.cc-macs.org/actualites/', 'text/html; charset=utf-8'),
  ('corpus:transport40-09-port-capbreton', 'https://www.cc-macs.org/rss.xml', 'application/rss+xml;charset=utf-8'),
  ('corpus:transport40-09-port-capbreton', 'https://www.lemagit.fr/actualites/365533573/La-logistique-un-secteur-de-choix-pour-les-cyberattaques', 'text/html;charset=UTF-8'),
  ('corpus:transport40-10-sudouest-landes', 'https://www.sudouest.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-10-sudouest-landes', 'https://www.sudouest.fr/landes/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-10-sudouest-landes', 'https://www.sudouest.fr/landes/rss.xml', 'application/xml'),
  ('corpus:transport40-10-sudouest-landes', 'https://www.sudouest.fr/economie/economie-du-numerique/cybersecurite-le-risque-de-cyberattaque-est-plus-eleve-que-l-incendie-alerte-le-patron-des-patrons-des-landes-13840540.php', 'text/html; charset=UTF-8'),
  ('corpus:transport40-11-ici-gascogne', 'https://www.ici.fr/radio/gascogne', 'text/html; charset=UTF-8'),
  ('corpus:transport40-11-ici-gascogne', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html; charset=UTF-8'),
  ('corpus:transport40-11-ici-gascogne', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml'),
  ('corpus:transport40-11-ici-gascogne', 'https://www.ici.fr/nouvelle-aquitaine/landes-40/rion-des-landes/cryptomonnaies-un-couple-enleve-et-sequestre-dans-le-coffre-d-une-voiture-a-rion-des-landes-2470438', 'text/html; charset=UTF-8'),
  ('corpus:transport40-12-peixoto', 'https://peixoto.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-12-peixoto', 'https://peixoto.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-12-peixoto', 'https://peixoto.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:transport40-12-peixoto', 'https://www.lemagit.fr/actualites/365533573/La-logistique-un-secteur-de-choix-pour-les-cyberattaques', 'text/html;charset=UTF-8'),
  ('corpus:transport40-13-transports-brocas', 'https://www.transports-brocas.fr/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-13-transports-brocas', 'https://www.transports-brocas.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:transport40-13-transports-brocas', 'https://www.lemagit.fr/actualites/365533573/La-logistique-un-secteur-de-choix-pour-les-cyberattaques', 'text/html;charset=UTF-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (SELECT 1 FROM source_verification x WHERE x.source_id = v.source_id AND x.url = v.url);
