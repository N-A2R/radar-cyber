-- Sources d'information du secteur « transport » du département 86 (Vienne).
-- 28 sources, 65 URL contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-transport-86.jsonl
-- Preuve HTTP : bench/results/verification-transport-86.json

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
  etat              text        NOT NULL CHECK (etat IN ('ok200', 'muette', 'morte', 'lente')),
  motif             text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_source_date
  ON source_verification (source_id, verifie_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:transport86-la-nouvelle-republique-edition-vienne-86', 'La Nouvelle République — édition Vienne (86)', 'cti', 'https://www.lanouvellerepublique.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; presse régionale — édition départementale ; actualités : https://www.lanouvellerepublique.fr/vienne'),
  ('corpus:transport86-ici-poitou-actualites-vienne-86', 'ICI Poitou — actualités Vienne (86)', 'cti', 'https://www.ici.fr/radio/poitou', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; radio locale — média public ; actualités : https://www.ici.fr/nouvelle-aquitaine/vienne-86'),
  ('corpus:transport86-france-3-nouvelle-aquitaine-vienne-86', 'France 3 Nouvelle-Aquitaine — Vienne (86)', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; télévision locale — média public ; actualités : https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne'),
  ('corpus:transport86-actu-fr-poitiers-vienne', 'actu.fr — Poitiers (Vienne)', 'cti', 'https://actu.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; presse locale en ligne ; actualités : https://actu.fr/nouvelle-aquitaine/poitiers_86194'),
  ('corpus:transport86-le-7-information-de-proximite-dans-la-vienne', 'Le 7 — information de proximité dans la Vienne', 'cti', 'https://www.le7.info/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; presse locale en ligne ; actualités : https://www.le7.info/'),
  ('corpus:transport86-aquitaineonline-actualites-poitou-charentes', 'AquitaineOnLine — actualités Poitou-Charentes', 'cti', 'https://www.aquitaineonline.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; média régional en ligne ; actualités : https://www.aquitaineonline.com/actualites-en-aquitaine/poitou-charentes/'),
  ('corpus:transport86-trm24-actualite-du-transport-routier-de-marchandises', 'TRM24 — actualité du transport routier de marchandises', 'cti', 'https://www.trm24.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; presse spécialisée transport ; actualités : https://www.trm24.fr/'),
  ('corpus:transport86-transport-info', 'Transport Info', 'cti', 'https://www.transportinfo.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; presse professionnelle transport et logistique ; actualités : https://www.transportinfo.fr/'),
  ('corpus:transport86-transporteurs-net', 'Transporteurs.net', 'cti', 'https://www.transporteurs.net/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; presse spécialisée transport routier ; actualités : https://www.transporteurs.net/index_newA.asp'),
  ('corpus:transport86-strategies-logistique', 'Stratégies Logistique', 'cti', 'https://strategieslogistique.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; presse spécialisée logistique et supply chain ; actualités : https://strategieslogistique.com/'),
  ('corpus:transport86-cci-de-la-vienne-poitiers', 'CCI de la Vienne — Poitiers', 'cti', 'https://www.poitiers.cci.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; chambre consulaire — commerce et industrie ; actualités : https://www.poitiers.cci.fr/actualites/'),
  ('corpus:transport86-cma-nouvelle-aquitaine-cma-de-la-vienne', 'CMA Nouvelle-Aquitaine — CMA de la Vienne', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-vienne', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; chambre consulaire — métiers et artisanat ; actualités : https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites'),
  ('corpus:transport86-departement-de-la-vienne-mobi-vienne', 'Département de la Vienne — Mobi''Vienne', 'cti', 'https://www.lavienne86.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; collectivité départementale — mobilités ; actualités : https://www.lavienne86.fr/fil-infos/actualites'),
  ('corpus:transport86-grand-poitiers-actualites-et-mobilites', 'Grand Poitiers — actualités et mobilités', 'cti', 'https://www.grandpoitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; collectivité — autorité organisatrice des transports ; actualités : https://www.grandpoitiers.fr/information-transversale/actualites'),
  ('corpus:transport86-grand-chatellerault-actualites-et-mobilites', 'Grand Châtellerault — actualités et mobilités', 'cti', 'https://www.grand-chatellerault.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; collectivité — transport à la demande et scolaire ; actualités : https://www.grand-chatellerault.fr/vivre/actualites'),
  ('corpus:transport86-region-nouvelle-aquitaine-transports', 'Région Nouvelle-Aquitaine — transports', 'cti', 'https://transports.nouvelle-aquitaine.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; région — autorité organisatrice TER et cars ; actualités : https://transports.nouvelle-aquitaine.fr/toute-lactualite-des-transports'),
  ('corpus:transport86-fntv-nouvelle-aquitaine', 'FNTV Nouvelle-Aquitaine', 'cti', 'https://fntv.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; fédération régionale des transports de voyageurs ; actualités : https://fntv.fr/region/fntv-nouvelle-aquitaine'),
  ('corpus:transport86-otre-organisation-professionnelle-des-transporteurs-routiers', 'OTRE — Organisation professionnelle des transporteurs routiers', 'cti', 'https://www.otre.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; syndicat professionnel du transport routier ; actualités : https://www.otre.org/actualites/'),
  ('corpus:transport86-fntr-federation-nationale-des-transports-routiers', 'FNTR — Fédération Nationale des Transports Routiers', 'cti', 'https://www.fntr.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; fédération professionnelle ; actualités : https://www.fntr.fr/'),
  ('corpus:transport86-fntv-federation-nationale-des-transports-de-voyageurs', 'FNTV — Fédération Nationale des Transports de Voyageurs', 'cti', 'https://www.fntv.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; fédération professionnelle ; actualités : https://www.fntv.fr/actualites-de-la-federation'),
  ('corpus:transport86-vitalis-regie-des-transports-poitevins', 'Vitalis — Régie des Transports Poitevins', 'cti', 'https://www.vitalis-poitiers.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; opérateur de transports en commun (Grand Poitiers) ; actualités : https://www.vitalis-poitiers.fr/actualites/'),
  ('corpus:transport86-transdev-poitou-charentes-infos-trafic', 'Transdev Poitou-Charentes — infos trafic', 'cti', 'https://www.transdev86.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":22,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; opérateur de transport collectif interurbain ; actualités : https://www.transdev86.fr/infos-trafic/'),
  ('corpus:transport86-les-rapides-du-poitou', 'Les Rapides du Poitou', 'cti', 'https://rapides-du-poitou.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":23,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; autocars et transport scolaire (Poitiers, 86) ; actualités : https://rapides-du-poitou.com/category/actualites/'),
  ('corpus:transport86-transports-courcelle', 'Transports Courcelle', 'cti', 'https://www.transports-courcelle.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":24,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; transporteur routier, exceptionnel et manutention (86) ; actualités : https://www.transports-courcelle.fr/actualites'),
  ('corpus:transport86-technopole-futuroscope', 'Technopole Futuroscope', 'cti', 'https://www.technopole-futuroscope.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":25,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; plateforme logistique et pôle d''échanges multimodal (86) ; actualités : https://www.technopole-futuroscope.com/informations-transversales/actualites'),
  ('corpus:transport86-groupe-mauffrey-etablissement-de-poitiers', 'Groupe Mauffrey — établissement de Poitiers', 'cti', 'https://mauffrey.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":26,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; transporteur routier et logisticien ; actualités : https://mauffrey.com/actualites/'),
  ('corpus:transport86-jeantet-ouest-groupe-stj-chatellerault', 'Jeantet Ouest (groupe STJ) — Châtellerault', 'cti', 'https://www.jeantetouest.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":27,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; transporteur routier, distribution et logistique (86) ; actualités : https://www.jeantetouest.fr/categorie-16979-actualites.html'),
  ('corpus:transport86-t-e-f-t-transport-express-fort-thubert', 'T.E.F.T. — Transport Express Fort Thubert', 'cti', 'https://www.sarlteft.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-86.jsonl","ligne":28,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '86', 'Source transport — Vienne (86) ; transport express et messagerie (Valence-en-Poitou, 86) ; actualités : https://www.sarlteft.com/actualites.html')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family, url = EXCLUDED.url,
  format = EXCLUDED.format, parser = EXCLUDED.parser, description = EXCLUDED.description,
  region = EXCLUDED.region, department = EXCLUDED.department;

-- Trace de vérification HTTP : 65 URL contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items, ms) AS (
  VALUES
    ('corpus:transport86-la-nouvelle-republique-edition-vienne-86', 'https://www.lanouvellerepublique.fr/', 'text/html; charset=utf-8', 0, 302),
    ('corpus:transport86-la-nouvelle-republique-edition-vienne-86', 'https://www.lanouvellerepublique.fr/vienne', 'text/html; charset=utf-8', 0, 79),
    ('corpus:transport86-la-nouvelle-republique-edition-vienne-86', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'application/rss+xml; charset=UTF-8', 40, 146),
    ('corpus:transport86-ici-poitou-actualites-vienne-86', 'https://www.ici.fr/radio/poitou', 'text/html; charset=UTF-8', 0, 113),
    ('corpus:transport86-ici-poitou-actualites-vienne-86', 'https://www.ici.fr/nouvelle-aquitaine/vienne-86', 'text/html; charset=UTF-8', 0, 84),
    ('corpus:transport86-ici-poitou-actualites-vienne-86', 'https://www.ici.fr/rss/poitou/a-la-une.xml', 'application/xml', 40, 33),
    ('corpus:transport86-france-3-nouvelle-aquitaine-vienne-86', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne', 'text/html; charset=UTF-8', 0, 113),
    ('corpus:transport86-france-3-nouvelle-aquitaine-vienne-86', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss', 'text/xml; charset=UTF-8', 30, 43),
    ('corpus:transport86-actu-fr-poitiers-vienne', 'https://actu.fr/', 'text/html; charset=utf-8', 0, 186),
    ('corpus:transport86-actu-fr-poitiers-vienne', 'https://actu.fr/nouvelle-aquitaine/poitiers_86194', 'text/html; charset=utf-8', 0, 78),
    ('corpus:transport86-actu-fr-poitiers-vienne', 'https://actu.fr/nouvelle-aquitaine/rss.xml', 'application/rss+xml; charset=utf-8', 20, 27),
    ('corpus:transport86-le-7-information-de-proximite-dans-la-vienne', 'https://www.le7.info/', 'text/html; charset=UTF-8', 0, 1125),
    ('corpus:transport86-le-7-information-de-proximite-dans-la-vienne', 'https://www.le7.info/rss.xml', 'text/html; charset=UTF-8', 10, 481),
    ('corpus:transport86-aquitaineonline-actualites-poitou-charentes', 'https://www.aquitaineonline.com/', 'text/html; charset=utf-8', 0, 870),
    ('corpus:transport86-aquitaineonline-actualites-poitou-charentes', 'https://www.aquitaineonline.com/actualites-en-aquitaine/poitou-charentes/', 'text/html; charset=utf-8', 0, 2199),
    ('corpus:transport86-aquitaineonline-actualites-poitou-charentes', 'https://www.aquitaineonline.com/actualites-en-aquitaine/poitou-charentes/feed/rss/', 'application/rss+xml; charset=utf-8', 10, 409),
    ('corpus:transport86-trm24-actualite-du-transport-routier-de-marchandises', 'https://www.trm24.fr/', 'text/html; charset=UTF-8', 0, 150),
    ('corpus:transport86-trm24-actualite-du-transport-routier-de-marchandises', 'https://www.trm24.fr/feed/', 'application/rss+xml; charset=UTF-8', 10, 440),
    ('corpus:transport86-transport-info', 'https://www.transportinfo.fr/', 'text/html; charset=UTF-8', 0, 69),
    ('corpus:transport86-transport-info', 'https://www.transportinfo.fr/feed/', 'application/rss+xml; charset=UTF-8', 10, 15),
    ('corpus:transport86-transporteurs-net', 'https://www.transporteurs.net/', 'text/html', 0, 450),
    ('corpus:transport86-transporteurs-net', 'https://www.transporteurs.net/index_newA.asp', 'text/html', 0, 371),
    ('corpus:transport86-strategies-logistique', 'https://strategieslogistique.com/', 'text/html; charset=utf-8', 0, 318),
    ('corpus:transport86-cci-de-la-vienne-poitiers', 'https://www.poitiers.cci.fr/', 'text/html; charset=UTF-8', 0, 437),
    ('corpus:transport86-cci-de-la-vienne-poitiers', 'https://www.poitiers.cci.fr/actualites/', 'text/html; charset=UTF-8', 0, 294),
    ('corpus:transport86-cci-de-la-vienne-poitiers', 'https://www.poitiers.cci.fr/actualites/feed/', 'application/rss+xml; charset=UTF-8', 10, 314),
    ('corpus:transport86-cma-nouvelle-aquitaine-cma-de-la-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-vienne', 'text/html; charset=UTF-8', 0, 139),
    ('corpus:transport86-cma-nouvelle-aquitaine-cma-de-la-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0, 568),
    ('corpus:transport86-departement-de-la-vienne-mobi-vienne', 'https://www.lavienne86.fr/', 'text/html; charset=utf-8', 0, 273),
    ('corpus:transport86-departement-de-la-vienne-mobi-vienne', 'https://www.lavienne86.fr/fil-infos/actualites', 'text/html; charset=utf-8', 0, 147),
    ('corpus:transport86-departement-de-la-vienne-mobi-vienne', 'https://www.lavienne86.fr/fil-infos/actualites/rss?tx_news_pi1%5BoverwriteDemand%5D%5Blimit%5D=15&cHash=bab1da884c388b883791bd5dc0f5964c', 'text/xml;charset=utf-8', 15, 252),
    ('corpus:transport86-grand-poitiers-actualites-et-mobilites', 'https://www.grandpoitiers.fr/', 'text/html; charset=utf-8', 0, 521),
    ('corpus:transport86-grand-poitiers-actualites-et-mobilites', 'https://www.grandpoitiers.fr/information-transversale/actualites', 'text/html; charset=utf-8', 0, 276),
    ('corpus:transport86-grand-poitiers-actualites-et-mobilites', 'https://www.grandpoitiers.fr/information-transversale/actualites/rss', 'text/xml;charset=utf-8', 117, 1856),
    ('corpus:transport86-grand-chatellerault-actualites-et-mobilites', 'https://www.grand-chatellerault.fr/', 'text/html;charset=UTF-8', 0, 742),
    ('corpus:transport86-grand-chatellerault-actualites-et-mobilites', 'https://www.grand-chatellerault.fr/vivre/actualites', 'text/html;charset=UTF-8', 0, 181),
    ('corpus:transport86-region-nouvelle-aquitaine-transports', 'https://transports.nouvelle-aquitaine.fr/', 'text/html; charset=UTF-8', 0, 1215),
    ('corpus:transport86-region-nouvelle-aquitaine-transports', 'https://transports.nouvelle-aquitaine.fr/toute-lactualite-des-transports', 'text/html; charset=UTF-8', 0, 760),
    ('corpus:transport86-region-nouvelle-aquitaine-transports', 'https://transports.nouvelle-aquitaine.fr/liste-rss/naq_actualite', 'application/rss+xml', 76, 527),
    ('corpus:transport86-fntv-nouvelle-aquitaine', 'https://fntv.fr/', 'text/html; charset=UTF-8', 0, 200),
    ('corpus:transport86-fntv-nouvelle-aquitaine', 'https://fntv.fr/region/fntv-nouvelle-aquitaine', 'text/html; charset=UTF-8', 0, 551),
    ('corpus:transport86-otre-organisation-professionnelle-des-transporteurs-routiers', 'https://www.otre.org/', 'text/html; charset=UTF-8', 0, 686),
    ('corpus:transport86-otre-organisation-professionnelle-des-transporteurs-routiers', 'https://www.otre.org/actualites/', 'text/html; charset=UTF-8', 0, 574),
    ('corpus:transport86-otre-organisation-professionnelle-des-transporteurs-routiers', 'https://www.otre.org/feed/', 'application/rss+xml; charset=UTF-8', 10, 471),
    ('corpus:transport86-fntr-federation-nationale-des-transports-routiers', 'https://www.fntr.fr/', 'text/html; charset=UTF-8', 0, 260),
    ('corpus:transport86-fntv-federation-nationale-des-transports-de-voyageurs', 'https://www.fntv.fr/', 'text/html; charset=UTF-8', 0, 219),
    ('corpus:transport86-fntv-federation-nationale-des-transports-de-voyageurs', 'https://www.fntv.fr/actualites-de-la-federation', 'text/html; charset=UTF-8', 0, 373),
    ('corpus:transport86-vitalis-regie-des-transports-poitevins', 'https://www.vitalis-poitiers.fr/', 'text/html; charset=UTF-8', 0, 147),
    ('corpus:transport86-vitalis-regie-des-transports-poitevins', 'https://www.vitalis-poitiers.fr/actualites/', 'text/html; charset=UTF-8', 0, 18),
    ('corpus:transport86-transdev-poitou-charentes-infos-trafic', 'https://www.transdev86.fr/', 'text/html; charset=UTF-8', 0, 92),
    ('corpus:transport86-transdev-poitou-charentes-infos-trafic', 'https://www.transdev86.fr/infos-trafic/', 'text/html; charset=UTF-8', 0, 45),
    ('corpus:transport86-les-rapides-du-poitou', 'https://rapides-du-poitou.com/', 'text/html; charset=UTF-8', 0, 172),
    ('corpus:transport86-les-rapides-du-poitou', 'https://rapides-du-poitou.com/category/actualites/', 'text/html; charset=UTF-8', 0, 65),
    ('corpus:transport86-les-rapides-du-poitou', 'https://rapides-du-poitou.com/category/actualites/feed/', 'application/rss+xml; charset=UTF-8', 10, 23),
    ('corpus:transport86-transports-courcelle', 'https://www.transports-courcelle.fr/', 'text/html; charset=UTF-8', 0, 171),
    ('corpus:transport86-transports-courcelle', 'https://www.transports-courcelle.fr/actualites', 'text/html; charset=UTF-8', 0, 42),
    ('corpus:transport86-technopole-futuroscope', 'https://www.technopole-futuroscope.com/', 'text/html; charset=utf-8', 0, 218),
    ('corpus:transport86-technopole-futuroscope', 'https://www.technopole-futuroscope.com/informations-transversales/actualites', 'text/html; charset=utf-8', 0, 119),
    ('corpus:transport86-groupe-mauffrey-etablissement-de-poitiers', 'https://mauffrey.com/', 'text/html; charset=UTF-8', 0, 112),
    ('corpus:transport86-groupe-mauffrey-etablissement-de-poitiers', 'https://mauffrey.com/actualites/', 'text/html; charset=UTF-8', 0, 29),
    ('corpus:transport86-groupe-mauffrey-etablissement-de-poitiers', 'https://mauffrey.com/feed/', 'text/xml;charset=UTF-8', 10, 152),
    ('corpus:transport86-jeantet-ouest-groupe-stj-chatellerault', 'https://www.jeantetouest.fr/', 'text/html', 0, 97),
    ('corpus:transport86-jeantet-ouest-groupe-stj-chatellerault', 'https://www.jeantetouest.fr/categorie-16979-actualites.html', 'text/html', 0, 27),
    ('corpus:transport86-t-e-f-t-transport-express-fort-thubert', 'https://www.sarlteft.com/', 'text/html; charset=UTF-8', 0, 245),
    ('corpus:transport86-t-e-f-t-transport-express-fort-thubert', 'https://www.sarlteft.com/actualites.html', 'text/html; charset=UTF-8', 0, 116)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, u.ms, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus transport-86 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
