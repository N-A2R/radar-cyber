-- Sources d'information du secteur « transport » du département 79 (Deux-Sèvres).
-- 20 sources ; 77 URL contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-transport-79.jsonl
-- Preuve HTTP : bench/results/verification-sources-transport-79.json

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
  ('corpus:transport79-tanlib', 'Tanlib — réseau de transports de Niort Agglo', 'cti', 'https://www.tanlib.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : réseau de transport public (Niort) ; actualités : https://www.tanlib.com/actualites/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-landry-transports', 'Transports Landry', 'cti', 'https://landry-transports.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : transporteur et logisticien (Thouars) ; actualités : https://landry-transports.fr/actualites ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-transports-gauthier', 'Transports GAUTHIER', 'cti', 'https://www.transports-gauthier.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : transport frigorifique et logistique (La Crèche) ; actualités : https://www.transports-gauthier.com/actualites/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-ct79', 'Conseil Transports 79 — OTRE Poitou-Charentes', 'cti', 'https://www.ct79.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : organisation professionnelle locale du transport routier (La Crèche) ; actualités : https://www.ct79.fr/-Actualites- ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-fntr', 'FNTR — Fédération nationale des transports routiers', 'cti', 'https://www.fntr.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : fédération professionnelle ; actualités : https://www.fntr.fr/espace-presse/actualites-agenda ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-fntv', 'FNTV — Fédération nationale des transports de voyageurs', 'cti', 'https://fntv.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : fédération professionnelle ; actualités : https://fntv.fr/actualites-de-la-federation ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-otre', 'OTRE — Organisation des transporteurs routiers européens', 'cti', 'https://www.otre.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : fédération professionnelle (section Poitou-Charentes) ; actualités : https://www.otre.org/actualites/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-france-logistique', 'France Logistique', 'cti', 'https://www.francelogistique.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : fédération professionnelle de la logistique ; actualités : https://www.francelogistique.fr/category/news/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-tlf-sud-ouest', 'Union TLF Sud-Ouest', 'cti', 'https://e-tlf.com/nos-regions/tlf-sud-ouest/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : fédération régionale du transport et de la logistique ; actualités : https://e-tlf.com/nos-actualites/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-transport-info', 'Transport Info', 'presse', 'https://www.transportinfo.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : presse professionnelle transport et logistique ; actualités : https://www.transportinfo.fr/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-departement-deux-sevres', 'Département des Deux-Sèvres', 'institutionnel', 'https://www.deux-sevres.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : collectivité — routes et transports départementaux ; actualités : https://www.deux-sevres.fr/toutes-les-actualites ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-niort-agglo', 'Communauté d’agglomération du Niortais', 'institutionnel', 'https://www.niortagglo.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : intercommunalité — mobilités et transports ; actualités : https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-transports-nouvelle-aquitaine', 'Transports en Nouvelle-Aquitaine', 'institutionnel', 'https://transports.nouvelle-aquitaine.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : service public régional des transports (lignes du 79) ; actualités : https://transports.nouvelle-aquitaine.fr/toute-lactualite-des-transports ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-la-nouvelle-republique', 'La Nouvelle République — Deux-Sèvres', 'presse', 'https://www.lanouvellerepublique.fr/deux-sevres', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : quotidien régional ; actualités : https://www.lanouvellerepublique.fr/deux-sevres ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-niort-info', 'Niort Info', 'presse', 'https://niortinfo.media/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : presse locale en ligne ; actualités : https://niortinfo.media/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-ici-poitou', 'ICI Poitou — Radio France', 'presse', 'https://www.ici.fr/radio/poitou', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : radio publique locale ; actualités : https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79 ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-france3-deux-sevres', 'France 3 Nouvelle-Aquitaine — Deux-Sèvres', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : télévision publique locale ; actualités : https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-actu-fr-deux-sevres', 'actu.fr — Deux-Sèvres', 'presse', 'https://actu.fr/deux-sevres/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : presse en ligne ; actualités : https://actu.fr/deux-sevres/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-e-niort', 'E.Niort', 'presse', 'https://eniort.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : presse locale en ligne ; actualités : https://eniort.com/ ; vérifiée le 2026-11-22.'),
  ('corpus:transport79-ville-de-niort', 'Ville de Niort — Vivre à Niort', 'institutionnel', 'https://www.vivre-a-niort.com/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-transport-79.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source d''information du secteur transport dans les Deux-Sèvres (79) : collectivité — actualités et mobilités ; actualités : https://www.vivre-a-niort.com/actualites/ ; vérifiée le 2026-11-22.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family, url = EXCLUDED.url,
  format = EXCLUDED.format, parser = EXCLUDED.parser, description = EXCLUDED.description,
  region = EXCLUDED.region, department = EXCLUDED.department;

-- Trace de vérification HTTP : une ligne par URL sondée, 200 observé le 2026-11-22.
WITH urls(source_id, url, content_type, items, ms) AS (
  VALUES
    ('corpus:transport79-tanlib', 'https://www.tanlib.com/', 'text/html; charset=UTF-8', 0, 414),
    ('corpus:transport79-tanlib', 'https://www.tanlib.com/actualites/', 'text/html; charset=UTF-8', 0, 159),
    ('corpus:transport79-tanlib', 'https://www.tanlib.com/actualites/actu-pysae-l-info-en-temps-reel--1248/', 'text/html; charset=UTF-8', 0, 256),
    ('corpus:transport79-landry-transports', 'https://landry-transports.fr/', 'text/html; charset=UTF-8', 0, 1268),
    ('corpus:transport79-landry-transports', 'https://landry-transports.fr/actualites', 'text/html; charset=UTF-8', 0, 844),
    ('corpus:transport79-landry-transports', 'https://landry-transports.fr/feed', 'application/rss+xml; charset=UTF-8', 4, 691),
    ('corpus:transport79-landry-transports', 'https://landry-transports.fr/ouverture-dun-nouvel-entrepot', 'text/html; charset=UTF-8', 0, 785),
    ('corpus:transport79-transports-gauthier', 'https://www.transports-gauthier.com/', 'text/html; charset=UTF-8', 0, 683),
    ('corpus:transport79-transports-gauthier', 'https://www.transports-gauthier.com/actualites/', 'text/html; charset=UTF-8', 0, 613),
    ('corpus:transport79-transports-gauthier', 'https://www.transports-gauthier.com/des-camions-daf-equipes-dethylotests-antidemarrage-pour-une-route-plus-sure/', 'text/html; charset=UTF-8', 0, 566),
    ('corpus:transport79-ct79', 'https://www.ct79.fr/', 'text/html; charset=utf-8', 0, 557),
    ('corpus:transport79-ct79', 'https://www.ct79.fr/-Actualites-', 'text/html; charset=utf-8', 0, 153),
    ('corpus:transport79-ct79', 'https://www.ct79.fr/spip.php?page=backend', 'text/xml; charset=utf-8', 10, 374),
    ('corpus:transport79-ct79', 'https://www.ct79.fr/Flash-info-special-RH-2026', 'text/html; charset=utf-8', 0, 440),
    ('corpus:transport79-fntr', 'https://www.fntr.fr/', 'text/html; charset=UTF-8', 0, 319),
    ('corpus:transport79-fntr', 'https://www.fntr.fr/espace-presse/actualites-agenda', 'text/html; charset=UTF-8', 0, 389),
    ('corpus:transport79-fntr', 'https://www.fntr.fr/rss.xml', 'application/rss+xml; charset=utf-8', 4, 138),
    ('corpus:transport79-fntr', 'https://www.fntr.fr/espace-presse/actualites-agenda/transport-routier-de-marchandises-l-horizon-2035-quelles', 'text/html; charset=UTF-8', 0, 381),
    ('corpus:transport79-fntv', 'https://fntv.fr/', 'text/html; charset=UTF-8', 0, 278),
    ('corpus:transport79-fntv', 'https://fntv.fr/actualites-de-la-federation', 'text/html; charset=UTF-8', 0, 1306),
    ('corpus:transport79-fntv', 'https://fntv.fr/actualite/resultats-du-barometre-du-transport-routier-5', 'text/html; charset=UTF-8', 0, 234),
    ('corpus:transport79-otre', 'https://www.otre.org/', 'text/html; charset=UTF-8', 0, 1276),
    ('corpus:transport79-otre', 'https://www.otre.org/actualites/', 'text/html; charset=UTF-8', 0, 568),
    ('corpus:transport79-otre', 'https://www.otre.org/feed/', 'application/rss+xml; charset=UTF-8', 10, 397),
    ('corpus:transport79-otre', 'https://www.otre.org/webinaire-ecoco2-transition-ecologique-du-transport-et-rse/', 'text/html; charset=UTF-8', 0, 491),
    ('corpus:transport79-france-logistique', 'https://www.francelogistique.fr/', 'text/html; charset=UTF-8', 0, 2218),
    ('corpus:transport79-france-logistique', 'https://www.francelogistique.fr/category/news/', 'text/html; charset=UTF-8', 0, 2210),
    ('corpus:transport79-france-logistique', 'https://www.francelogistique.fr/feed/', 'application/rss+xml; charset=UTF-8', 10, 616),
    ('corpus:transport79-france-logistique', 'https://www.francelogistique.fr/2026/10/06/etude-tdie-la-logistique-dans-les-elections-municipales-2026/', 'text/html; charset=UTF-8', 0, 1804),
    ('corpus:transport79-tlf-sud-ouest', 'https://e-tlf.com/nos-regions/tlf-sud-ouest/', 'text/html; charset=utf-8', 0, 257),
    ('corpus:transport79-tlf-sud-ouest', 'https://e-tlf.com/nos-actualites/', 'text/html; charset=utf-8', 0, 217),
    ('corpus:transport79-tlf-sud-ouest', 'https://e-tlf.com/feed/', 'application/rss+xml; charset=UTF-8', 0, 92),
    ('corpus:transport79-tlf-sud-ouest', 'https://e-tlf.com/nos-actualites/plf-plfss-2027-impacts-transport-et-logistique/', 'text/html; charset=utf-8', 0, 228),
    ('corpus:transport79-transport-info', 'https://www.transportinfo.fr/', 'text/html; charset=UTF-8', 0, 169),
    ('corpus:transport79-transport-info', 'https://www.transportinfo.fr/', 'text/html; charset=UTF-8', 0, 114),
    ('corpus:transport79-transport-info', 'https://www.transportinfo.fr/feed/', 'application/rss+xml; charset=UTF-8', 10, 78),
    ('corpus:transport79-transport-info', 'https://www.transportinfo.fr/cybersecurite-dans-le-trm-combien-ca-peut-vous-couter-nos-conseils-pour-garder-la-main/', 'text/html; charset=UTF-8', 0, 85),
    ('corpus:transport79-departement-deux-sevres', 'https://www.deux-sevres.fr/', 'text/html; charset=utf-8', 0, 232),
    ('corpus:transport79-departement-deux-sevres', 'https://www.deux-sevres.fr/toutes-les-actualites', 'text/html; charset=utf-8', 0, 143),
    ('corpus:transport79-departement-deux-sevres', 'https://www.deux-sevres.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10, 88),
    ('corpus:transport79-departement-deux-sevres', 'https://www.deux-sevres.fr/nos-missions/les-routes-departementales/lentretien-et-la-securite-des-routes-pour-le-confort-des', 'text/html; charset=utf-8', 0, 155),
    ('corpus:transport79-niort-agglo', 'https://www.niortagglo.fr/', 'text/html; charset=utf-8', 0, 365),
    ('corpus:transport79-niort-agglo', 'https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html', 'text/html; charset=utf-8', 0, 1644),
    ('corpus:transport79-niort-agglo', 'https://www.niortagglo.fr/rss.xml', 'application/rss+xml;charset=utf-8', 30, 394),
    ('corpus:transport79-niort-agglo', 'https://www.niortagglo.fr/details-de-lactualite/suivre-le-trafic-en-temps-reel-grace-a-pysae/index.html', 'text/html; charset=utf-8', 0, 362),
    ('corpus:transport79-transports-nouvelle-aquitaine', 'https://transports.nouvelle-aquitaine.fr/', 'text/html; charset=UTF-8', 0, 984),
    ('corpus:transport79-transports-nouvelle-aquitaine', 'https://transports.nouvelle-aquitaine.fr/toute-lactualite-des-transports', 'text/html; charset=UTF-8', 0, 799),
    ('corpus:transport79-transports-nouvelle-aquitaine', 'https://transports.nouvelle-aquitaine.fr/liste-rss/naq_actualite', 'application/rss+xml', 76, 314),
    ('corpus:transport79-transports-nouvelle-aquitaine', 'https://transports.nouvelle-aquitaine.fr/toute-lactualite-des-transports/des-ateliers-sur-la-mobilite-des-seniors-dans-les-cars', 'text/html; charset=UTF-8', 0, 746),
    ('corpus:transport79-la-nouvelle-republique', 'https://www.lanouvellerepublique.fr/deux-sevres', 'text/html; charset=utf-8', 0, 670),
    ('corpus:transport79-la-nouvelle-republique', 'https://www.lanouvellerepublique.fr/deux-sevres', 'text/html; charset=utf-8', 0, 219),
    ('corpus:transport79-la-nouvelle-republique', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'application/rss+xml; charset=UTF-8', 40, 303),
    ('corpus:transport79-la-nouvelle-republique', 'https://www.lanouvellerepublique.fr/niort/horaires-nouveaux-trains-voici-ce-qui-va-changer-sur-la-ligne-de-ter-14-entre-poitiers-et-la-rochelle-1795113278', 'text/html; charset=utf-8', 0, 183),
    ('corpus:transport79-niort-info', 'https://niortinfo.media/', 'text/html; charset=UTF-8', 0, 3379),
    ('corpus:transport79-niort-info', 'https://niortinfo.media/', 'text/html; charset=UTF-8', 0, 2339),
    ('corpus:transport79-niort-info', 'https://niortinfo.media/feed/', 'application/rss+xml; charset=UTF-8', 10, 1446),
    ('corpus:transport79-niort-info', 'https://niortinfo.media/niort-reunion-publique-avenir-ligne-ter-poitiers-la-rochelle/', 'text/html; charset=UTF-8', 0, 2307),
    ('corpus:transport79-ici-poitou', 'https://www.ici.fr/radio/poitou', 'text/html; charset=UTF-8', 0, 209),
    ('corpus:transport79-ici-poitou', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'text/html; charset=UTF-8', 0, 309),
    ('corpus:transport79-ici-poitou', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml', 20, 131),
    ('corpus:transport79-ici-poitou', 'https://www.ici.fr/nouvelle-aquitaine/vienne-86/valdivienne/vienne-l-a10-coupee-entre-sainte-maure-de-touraine-et-chatellerauilt-1996488', 'text/html; charset=UTF-8', 0, 118),
    ('corpus:transport79-france3-deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'text/html; charset=UTF-8', 0, 217),
    ('corpus:transport79-france3-deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'text/html; charset=UTF-8', 0, 152),
    ('corpus:transport79-france3-deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-s%C3%A8vres/rss', 'text/xml; charset=UTF-8', 30, 119),
    ('corpus:transport79-france3-deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/niort/certains-vont-meme-percer-le-reservoir-ce-transporteur-routier-s-est-fait-voler-3-000-litres-de-carburant-un-phenomene-de-plus-en-plus-frequent-3435030.html', 'text/html; charset=UTF-8', 0, 219),
    ('corpus:transport79-actu-fr-deux-sevres', 'https://actu.fr/deux-sevres/', 'text/html; charset=UTF-8', 0, 158),
    ('corpus:transport79-actu-fr-deux-sevres', 'https://actu.fr/deux-sevres/', 'text/html; charset=UTF-8', 0, 176),
    ('corpus:transport79-actu-fr-deux-sevres', 'https://actu.fr/deux-sevres/rss.xml', 'application/rss+xml; charset=utf-8', 20, 61),
    ('corpus:transport79-actu-fr-deux-sevres', 'https://actu.fr/nouvelle-aquitaine/niort_79191/niort-google-propose-une-journee-gratuite-pour-aider-les-entreprises-a-tirer-parti-de-l-intelligence-artificielle_65079475.html', 'text/html; charset=UTF-8', 0, 109),
    ('corpus:transport79-e-niort', 'https://eniort.com/', 'text/html; charset=UTF-8', 0, 126),
    ('corpus:transport79-e-niort', 'https://eniort.com/', 'text/html; charset=UTF-8', 0, 100),
    ('corpus:transport79-e-niort', 'https://eniort.com/feed/', 'application/rss+xml; charset=UTF-8', 10, 77),
    ('corpus:transport79-e-niort', 'https://eniort.com/2026/11/21/manifestation-a-niort-le-21-novembre-les-interdictions/', 'text/html; charset=UTF-8', 0, 94),
    ('corpus:transport79-ville-de-niort', 'https://www.vivre-a-niort.com/actualites/', 'text/html; charset=utf-8', 0, 398),
    ('corpus:transport79-ville-de-niort', 'https://www.vivre-a-niort.com/actualites/', 'text/html; charset=utf-8', 0, 279),
    ('corpus:transport79-ville-de-niort', 'https://www.vivre-a-niort.com/news.xml', 'application/rss+xml;charset=utf-8', 30, 562),
    ('corpus:transport79-ville-de-niort', 'https://www.vivre-a-niort.com/actualites/dernieres-infos/perturbations-dans-les-ecoles-le-17-novembre/index.html', 'text/html; charset=utf-8', 0, 442)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, u.ms, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus transport-79 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
