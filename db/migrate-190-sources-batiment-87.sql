-- Sources d'information du secteur bâtiment dans le département 87 (Haute-Vienne).
-- 19 sources, 56 contrôles HTTP sur 56 URLs distinctes (sites,
-- pages actualités et flux), toutes en HTTP 200 le 2026-11-22 (curl -L, User-Agent navigateur).
-- Corpus : bench/corpus/sources-batiment-87.jsonl
-- Preuve : bench/results/verification-sources-batiment-87.json

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

WITH src(ord, id, nom, type, site, actus, flux, fam, fmt) AS (
  VALUES
    (1, 'corpus:sud-ouest-limoges-haute-vienne', 'Sud Ouest Limoges / Haute-Vienne', 'presse', 'https://www.sudouest.fr/', 'https://www.sudouest.fr/haute-vienne/limoges/', 'https://news.google.com/rss/search?q=site%3Asudouest.fr%2Fhaute-vienne%20Limoges&hl=fr&gl=FR&ceid=FR%3Afr', 'presse', 'rss'),
    (2, 'corpus:le-populaire-du-centre', 'Le Populaire du Centre', 'presse', 'https://www.lepopulaire.fr/', 'https://www.lepopulaire.fr/haute-vienne/', 'https://news.google.com/rss/search?q=site%3Alepopulaire.fr%20Limoges%20%22Haute-Vienne%22&hl=fr&gl=FR&ceid=FR%3Afr', 'presse', 'rss'),
    (3, 'corpus:actu-fr-limoges-haute-vienne', 'actu.fr Limoges / Haute-Vienne', 'presse', 'https://actu.fr/', 'https://actu.fr/nouvelle-aquitaine/haute-vienne_87', 'https://actu.fr/limoges/rss.xml', 'presse', 'rss'),
    (4, 'corpus:ici-limousin-ici-limoges', 'ICI Limousin / ICI Limoges', 'radio', 'https://www.ici.fr/radio/limousin', 'https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/limoges', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'presse', 'rss'),
    (5, 'corpus:france-3-nouvelle-aquitaine-limousin-haute-vienne', 'France 3 Nouvelle-Aquitaine – Limousin/Haute-Vienne', 'télévision', 'https://france3-regions.franceinfo.fr/', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne', 'https://news.google.com/rss/search?q=site%3Afrance3-regions.franceinfo.fr%20Limoges&hl=fr&gl=FR&ceid=FR%3Afr', 'presse', 'rss'),
    (6, 'corpus:limoges-metropole', 'Limoges Métropole', 'collectivité', 'https://www.limoges-metropole.fr/', 'https://www.limoges-metropole.fr/informations-transversales/actualites', 'https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'institutionnel', 'rss'),
    (7, 'corpus:annonces-legales-fr-haute-vienne', 'Annonces-legales.fr – Haute-Vienne', 'JAL', 'https://www.annonces-legales.fr/', 'https://www.annonces-legales.fr/consultation/nouvelle-aquitaine/haute-vienne-87', 'https://news.google.com/rss/search?q=%22annonces%20l%C3%A9gales%22%20%22Haute-Vienne%22&hl=fr&gl=FR&ceid=FR%3Afr', 'presse', 'rss'),
    (8, 'corpus:union-territoires-jal-haute-vienne', 'Union & Territoires (JAL Haute-Vienne)', 'JAL/presse', 'https://www.terredactu.com/', 'https://www.terredactu.com/visualiser-les-al', 'https://www.terredactu.com/rss.xml', 'presse', 'rss'),
    (9, 'corpus:ville-de-saint-junien', 'Ville de Saint-Junien', 'collectivité', 'https://www.saint-junien.fr/', 'https://www.saint-junien.fr/actualites/', 'https://www.saint-junien.fr/feed/', 'institutionnel', 'rss'),
    (10, 'corpus:capeb-haute-vienne', 'CAPEB Haute-Vienne', 'organisation professionnelle', 'https://www.capeb.fr/haute-vienne', 'https://www.capeb.fr/haute-vienne/actualites', 'https://news.google.com/rss/search?q=CAPEB+Haute-Vienne&hl=fr&gl=FR&ceid=FR:fr', 'cci', 'rss'),
    (11, 'corpus:acpresse-rubrique-haute-vienne-87-presse-professionnelle-de-la-construction', 'ACPresse — rubrique Haute-Vienne (87), presse professionnelle de la construction', 'presse professionnelle du bâtiment et de la construction', 'https://www.acpresse.fr/', 'https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/haute-vienne/', 'https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/haute-vienne/feed/', 'presse', 'rss'),
    (12, 'corpus:cma-nouvelle-aquitaine-haute-vienne-limoges', 'CMA Nouvelle-Aquitaine - Haute-Vienne (Limoges)', 'chambre consulaire', 'https://cma-nouvelleaquitaine.fr/', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'https://news.google.com/rss/search?q=%22CMA+Haute-Vienne%22&hl=fr&gl=FR&ceid=FR:fr', 'cci', 'rss'),
    (13, 'corpus:caue-87-conseil-d-architecture-d-urbanisme-et-de-l-environnement-de-la-haute-vienne', 'CAUE 87 (Conseil d''Architecture, d''Urbanisme et de l''Environnement de la Haute-Vienne)', 'association professionnelle', 'https://www.caue87.fr/', 'https://www.caue87.fr/actualites/', 'https://www.caue87.fr/feed/', 'cti', 'rss'),
    (14, 'corpus:qualibat', 'Qualibat', 'organisme de qualification et certification du bâtiment', 'https://www.qualibat.com/', 'https://www.qualibat.com/actualites', 'https://news.google.com/rss/search?q=%22Qualibat%22&hl=fr&gl=FR&ceid=FR:fr', 'cti', 'rss'),
    (15, 'corpus:btp-cfa-87-limoges-btp-cfa-nouvelle-aquitaine', 'BTP CFA 87 Limoges (BTP CFA Nouvelle-Aquitaine)', 'centre de formation d''apprentis du bâtiment', 'https://www.btpcfa-na.fr/centre/btp-cfa-87-limoges/', 'https://www.btpcfa-na.fr/actualites/', 'https://www.btpcfa-na.fr/feed/', 'cti', 'rss'),
    (16, 'corpus:odeys-cluster-construction-et-amenagement-durables-antenne-limoges', 'Odéys - cluster construction et aménagement durables (antenne Limoges)', 'cluster professionnel', 'https://www.odeys.fr/', 'https://www.odeys.fr/actualites', 'https://news.google.com/rss/search?q=%22Od%C3%A9ys%22&hl=fr&gl=FR&ceid=FR:fr', 'cti', 'rss'),
    (17, 'corpus:france-renov-service-public-de-la-renovation-de-l-habitat', 'France Rénov'' (service public de la rénovation de l''habitat)', 'service public', 'https://france-renov.gouv.fr/', 'https://france-renov.gouv.fr/actualites', 'https://news.google.com/rss/search?q=%22France+R%C3%A9nov%22+Haute-Vienne&hl=fr&gl=FR&ceid=FR:fr', 'cti', 'rss'),
    (18, 'corpus:guichet-habitat-de-limoges-metropole-france-renov', 'Guichet Habitat de Limoges Métropole (France Rénov'')', 'service public de la rénovation de l''habitat', 'https://guichet-habitat.limoges-metropole.fr/', 'https://guichet-habitat.limoges-metropole.fr/informations-transversales/actualites', 'https://news.google.com/rss/search?q=%22Guichet+Habitat%22+Limoges&hl=fr&gl=FR&ceid=FR:fr', 'cti', 'rss'),
    (19, 'corpus:placeco-actualites-economiques-de-la-haute-vienne-87', 'Placéco — actualités économiques de la Haute-Vienne (87)', 'presse économique locale', 'https://www.placeco.fr/haute-vienne/', 'https://www.placeco.fr/haute-vienne/', 'https://news.google.com/rss/search?q=%22Plac%C3%A9co%22+Haute-Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser,
                     interval_sec, description, region, department)
SELECT id, nom, fam, COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       NULL, true, 'narrative', fmt,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-batiment-87.jsonl', 'ligne', ord, 'type', 'source'))::jsonb,
       3600, 'Source du corpus — 87', 'Nouvelle-Aquitaine', '87'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
  family = EXCLUDED.family, format = EXCLUDED.format, parser = EXCLUDED.parser,
  description = EXCLUDED.description, enabled = true;

INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, v.ms, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus batiment-87 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:sud-ouest-limoges-haute-vienne', 'https://www.sudouest.fr/', 'text/html; charset=UTF-8', 276),
  ('corpus:sud-ouest-limoges-haute-vienne', 'https://www.sudouest.fr/haute-vienne/limoges/', 'text/html; charset=UTF-8', 270),
  ('corpus:sud-ouest-limoges-haute-vienne', 'https://news.google.com/rss/search?q=site%3Asudouest.fr%2Fhaute-vienne%20Limoges&hl=fr&gl=FR&ceid=FR%3Afr', 'application/xml; charset=utf-8', 279),
  ('corpus:le-populaire-du-centre', 'https://www.lepopulaire.fr/', 'text/html; charset=utf-8', 234),
  ('corpus:le-populaire-du-centre', 'https://www.lepopulaire.fr/haute-vienne/', 'text/html; charset=utf-8', 152),
  ('corpus:le-populaire-du-centre', 'https://news.google.com/rss/search?q=site%3Alepopulaire.fr%20Limoges%20%22Haute-Vienne%22&hl=fr&gl=FR&ceid=FR%3Afr', 'application/xml; charset=utf-8', 505),
  ('corpus:actu-fr-limoges-haute-vienne', 'https://actu.fr/', 'text/html; charset=UTF-8', 402),
  ('corpus:actu-fr-limoges-haute-vienne', 'https://actu.fr/nouvelle-aquitaine/haute-vienne_87', 'text/html; charset=UTF-8', 197),
  ('corpus:actu-fr-limoges-haute-vienne', 'https://actu.fr/limoges/rss.xml', 'application/rss+xml; charset=utf-8', 178),
  ('corpus:ici-limousin-ici-limoges', 'https://www.ici.fr/radio/limousin', 'text/html; charset=UTF-8', 256),
  ('corpus:ici-limousin-ici-limoges', 'https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/limoges', 'text/html; charset=UTF-8', 429),
  ('corpus:ici-limousin-ici-limoges', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'application/xml', 101),
  ('corpus:france-3-nouvelle-aquitaine-limousin-haute-vienne', 'https://france3-regions.franceinfo.fr/', 'text/html; charset=UTF-8', 250),
  ('corpus:france-3-nouvelle-aquitaine-limousin-haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne', 'text/html; charset=UTF-8', 528),
  ('corpus:france-3-nouvelle-aquitaine-limousin-haute-vienne', 'https://news.google.com/rss/search?q=site%3Afrance3-regions.franceinfo.fr%20Limoges&hl=fr&gl=FR&ceid=FR%3Afr', 'application/xml; charset=utf-8', 412),
  ('corpus:limoges-metropole', 'https://www.limoges-metropole.fr/', 'text/html; charset=utf-8', 749),
  ('corpus:limoges-metropole', 'https://www.limoges-metropole.fr/informations-transversales/actualites', 'text/html; charset=utf-8', 1283),
  ('corpus:limoges-metropole', 'https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'text/xml;charset=utf-8', 5294),
  ('corpus:annonces-legales-fr-haute-vienne', 'https://www.annonces-legales.fr/', 'text/html; charset=UTF-8', 248),
  ('corpus:annonces-legales-fr-haute-vienne', 'https://www.annonces-legales.fr/consultation/nouvelle-aquitaine/haute-vienne-87', 'text/html; charset=UTF-8', 288),
  ('corpus:annonces-legales-fr-haute-vienne', 'https://news.google.com/rss/search?q=%22annonces%20l%C3%A9gales%22%20%22Haute-Vienne%22&hl=fr&gl=FR&ceid=FR%3Afr', 'application/xml; charset=utf-8', 301),
  ('corpus:union-territoires-jal-haute-vienne', 'https://www.terredactu.com/', 'text/html; charset=UTF-8', 3185),
  ('corpus:union-territoires-jal-haute-vienne', 'https://www.terredactu.com/visualiser-les-al', 'text/html; charset=UTF-8', 1628),
  ('corpus:union-territoires-jal-haute-vienne', 'https://www.terredactu.com/rss.xml', 'application/rss+xml; charset=utf-8', 194),
  ('corpus:ville-de-saint-junien', 'https://www.saint-junien.fr/', 'text/html; charset=UTF-8', 712),
  ('corpus:ville-de-saint-junien', 'https://www.saint-junien.fr/actualites/', 'text/html; charset=UTF-8', 650),
  ('corpus:ville-de-saint-junien', 'https://www.saint-junien.fr/feed/', 'application/rss+xml; charset=UTF-8', 528),
  ('corpus:capeb-haute-vienne', 'https://www.capeb.fr/haute-vienne', 'text/html; charset=utf-8', 739),
  ('corpus:capeb-haute-vienne', 'https://www.capeb.fr/haute-vienne/actualites', 'text/html; charset=utf-8', 575),
  ('corpus:capeb-haute-vienne', 'https://news.google.com/rss/search?q=CAPEB+Haute-Vienne&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 108),
  ('corpus:acpresse-rubrique-haute-vienne-87-presse-professionnelle-de-la-construction', 'https://www.acpresse.fr/', 'text/html; charset=UTF-8', 200),
  ('corpus:acpresse-rubrique-haute-vienne-87-presse-professionnelle-de-la-construction', 'https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/haute-vienne/', 'text/html; charset=UTF-8', 144),
  ('corpus:acpresse-rubrique-haute-vienne-87-presse-professionnelle-de-la-construction', 'https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/haute-vienne/feed/', 'application/rss+xml; charset=UTF-8', 1332),
  ('corpus:cma-nouvelle-aquitaine-haute-vienne-limoges', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 130),
  ('corpus:cma-nouvelle-aquitaine-haute-vienne-limoges', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 193),
  ('corpus:cma-nouvelle-aquitaine-haute-vienne-limoges', 'https://news.google.com/rss/search?q=%22CMA+Haute-Vienne%22&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 366),
  ('corpus:caue-87-conseil-d-architecture-d-urbanisme-et-de-l-environnement-de-la-haute-vienne', 'https://www.caue87.fr/', 'text/html; charset=UTF-8', 3182),
  ('corpus:caue-87-conseil-d-architecture-d-urbanisme-et-de-l-environnement-de-la-haute-vienne', 'https://www.caue87.fr/actualites/', 'text/html; charset=UTF-8', 2085),
  ('corpus:caue-87-conseil-d-architecture-d-urbanisme-et-de-l-environnement-de-la-haute-vienne', 'https://www.caue87.fr/feed/', 'application/rss+xml; charset=UTF-8', 2493),
  ('corpus:qualibat', 'https://www.qualibat.com/', 'text/html; charset=UTF-8', 245),
  ('corpus:qualibat', 'https://www.qualibat.com/actualites', 'text/html; charset=UTF-8', 226),
  ('corpus:qualibat', 'https://news.google.com/rss/search?q=%22Qualibat%22&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 93),
  ('corpus:btp-cfa-87-limoges-btp-cfa-nouvelle-aquitaine', 'https://www.btpcfa-na.fr/centre/btp-cfa-87-limoges/', 'text/html; charset=UTF-8', 283),
  ('corpus:btp-cfa-87-limoges-btp-cfa-nouvelle-aquitaine', 'https://www.btpcfa-na.fr/actualites/', 'text/html; charset=UTF-8', 250),
  ('corpus:btp-cfa-87-limoges-btp-cfa-nouvelle-aquitaine', 'https://www.btpcfa-na.fr/feed/', 'application/rss+xml; charset=UTF-8', 368),
  ('corpus:odeys-cluster-construction-et-amenagement-durables-antenne-limoges', 'https://www.odeys.fr/', 'text/html; charset=UTF-8', 404),
  ('corpus:odeys-cluster-construction-et-amenagement-durables-antenne-limoges', 'https://www.odeys.fr/actualites', 'text/html; charset=UTF-8', 155),
  ('corpus:odeys-cluster-construction-et-amenagement-durables-antenne-limoges', 'https://news.google.com/rss/search?q=%22Od%C3%A9ys%22&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 60),
  ('corpus:france-renov-service-public-de-la-renovation-de-l-habitat', 'https://france-renov.gouv.fr/', 'text/html; charset=UTF-8', 160),
  ('corpus:france-renov-service-public-de-la-renovation-de-l-habitat', 'https://france-renov.gouv.fr/actualites', 'text/html; charset=UTF-8', 155),
  ('corpus:france-renov-service-public-de-la-renovation-de-l-habitat', 'https://news.google.com/rss/search?q=%22France+R%C3%A9nov%22+Haute-Vienne&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 85),
  ('corpus:guichet-habitat-de-limoges-metropole-france-renov', 'https://guichet-habitat.limoges-metropole.fr/', 'text/html; charset=utf-8', 683),
  ('corpus:guichet-habitat-de-limoges-metropole-france-renov', 'https://guichet-habitat.limoges-metropole.fr/informations-transversales/actualites', 'text/html; charset=utf-8', 624),
  ('corpus:guichet-habitat-de-limoges-metropole-france-renov', 'https://news.google.com/rss/search?q=%22Guichet+Habitat%22+Limoges&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 67),
  ('corpus:placeco-actualites-economiques-de-la-haute-vienne-87', 'https://www.placeco.fr/haute-vienne/', 'text/html; charset=UTF-8', 904),
  ('corpus:placeco-actualites-economiques-de-la-haute-vienne-87', 'https://www.placeco.fr/haute-vienne/', 'text/html; charset=UTF-8', 904),
  ('corpus:placeco-actualites-economiques-de-la-haute-vienne-87', 'https://news.google.com/rss/search?q=%22Plac%C3%A9co%22+Haute-Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8', 64)
) AS v(source_id, url, content_type, ms);
