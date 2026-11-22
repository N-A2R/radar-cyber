-- Sources d'information du secteur bâtiment dans le département 40 (Landes).
-- 22 sources, 55 contrôles HTTP sur 55 URLs distinctes (sites, pages actualités et flux),
-- toutes en HTTP 200 le 2026-11-22 (curl -L, User-Agent navigateur).
-- Corpus : bench/corpus/sources-batiment-40.jsonl
-- Preuve : bench/results/verification-sources-batiment-40.json

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

WITH src(ord, id, nom, type, site, actus, flux, cyber) AS (
  VALUES
    (1, 'corpus:batiment-40-01-capeb-landes-section-departementale-du-batiment', 'CAPEB Landes — section départementale du bâtiment', 'syndicat professionnel du bâtiment', 'https://www.capeb.fr/landes/', 'https://www.capeb.fr/landes/actualites', '', 'Aucun incident cyber observé sur la page le 2026-11-22 ; risque sectoriel : faux devis et faux RIB envoyés depuis la messagerie compromise d''un artisan landais.'),
    (2, 'corpus:batiment-40-02-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-landes-40', 'CMA Nouvelle-Aquitaine — chambre des métiers et de l''artisanat (Landes 40)', 'chambre des métiers et de l''artisanat', 'https://cma-nouvelleaquitaine.fr/', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Landes', '', 'Aucun incident cyber observé dans la page le 2026-11-22 ; risque : usurpation d''identité d''artisans du bâtiment via les annuaires et formulaires de la CMA.'),
    (3, 'corpus:batiment-40-03-pro-rge-entreprises-rge-dans-les-landes-40', 'Pro-RGE — entreprises RGE dans les Landes (40)', 'annuaire professionnel public (artisans RGE)', 'https://pro-rge.fr/entreprise/d/40/', 'https://pro-rge.fr/entreprises/landes-40/', 'https://news.google.com/rss/search?q=RGE+Landes+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'Aucun fait cyber observé le 2026-11-22 ; risque : profils d''artisans RGE usurpés pour solliciter des acomptes sur des travaux de rénovation.'),
    (4, 'corpus:batiment-40-04-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'Qualibat — certification et annuaire des entreprises du bâtiment', 'organisme de certification et annuaire professionnel', 'https://www.qualibat.com/', 'https://www.qualibat.com/actualites', '', 'Alerte de phishing publiée le 20/11/2026 par Qualibat : campagne de courriels frauduleux usurpant l''identité de l''organisme, visible sur la page actualités ; risque pour les entreprises certifiées des Landes.'),
    (5, 'corpus:batiment-40-05-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'Artisanat.fr — magazine d''actualités de l''artisanat (CMA)', 'réseau consulaire et magazine d''actualités des artisans', 'https://www.artisanat.fr/', 'https://www.artisanat.fr/magazine/actus', '', 'Guide « Cybersécurité : comment protéger votre entreprise des cyberattaques ? » publié le 06/07/2026, concernant notamment les TPE artisanales du bâtiment des Landes.'),
    (6, 'corpus:batiment-40-06-siteartisan-annuaire-des-artisans', 'SiteArtisan — annuaire des artisans', 'annuaire d''artisans du bâtiment', 'https://www.siteartisan.fr/annuaire/', 'https://www.siteartisan.fr/blog/', 'https://www.siteartisan.fr/blog/feed.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : fiches d''artisans compromises pour émettre des devis frauduleux.'),
    (7, 'corpus:batiment-40-07-artisans-reunis-artisans-des-landes-40', 'Artisans Réunis — artisans des Landes (40)', 'réseau d''artisans et annuaire départemental', 'https://artisansreunis.fr/departement/40-landes', 'https://artisansreunis.fr/blog', '', 'Aucun fait cyber observé le 2026-11-22 ; risque : usurpation de fiches d''artisans vérifiés des Landes pour demander des acomptes.'),
    (8, 'corpus:batiment-40-08-cci-des-landes-entreprises-du-batiment-et-de-la-construction', 'CCI des Landes — entreprises du bâtiment et de la construction', 'chambre consulaire', 'https://landes.cci.fr/', 'https://www.landes.cci.fr/presse/', 'https://news.google.com/rss/search?q=site%3Alandes.cci.fr+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'Page « La Cybermalveillance envers les entreprises » référencée sur le site de la CCI des Landes ; risque pour les entreprises du bâtiment du département.'),
    (9, 'corpus:batiment-40-09-ville-de-mont-de-marsan-urbanisme-habitat-et-travaux', 'Ville de Mont-de-Marsan — urbanisme, habitat et travaux', 'collectivité (urbanisme, habitat)', 'https://www.montdemarsan.fr/', 'https://www.montdemarsan.fr/connaitre-le-territoire/actualites/', 'https://www.montdemarsan.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : phishing sur les demandes de permis de construire avec pièces jointes infectées.'),
    (10, 'corpus:batiment-40-10-grand-dax-agglomeration-urbanisme-et-travaux-publics', 'Grand Dax Agglomération — urbanisme et travaux publics', 'intercommunalité (travaux, urbanisme)', 'https://www.grand-dax.fr/', 'https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/', 'https://news.google.com/rss/search?q=%22Grand+Dax%22+b%C3%A2timent+construction&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber dans la veille le 2026-11-22 ; risque : usurpation de l''identité de l''agglomération pour envoyer de fausses consignes de chantier.'),
    (11, 'corpus:batiment-40-11-ici-gascogne-actualites-landes-40', 'ICI Gascogne — actualités Landes (40)', 'radio locale', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux communiqués sur des chantiers publics pour manipuler l''opinion locale.'),
    (12, 'corpus:batiment-40-12-france-3-nouvelle-aquitaine-edition-landes', 'France 3 Nouvelle-Aquitaine — édition Landes', 'télévision publique locale', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 'Aucun fait cyber observé dans le flux le 2026-11-22 ; risque : rançongiciel contre les services d''urbanisme des communes landaises.'),
    (13, 'corpus:batiment-40-13-actu-fr-actu-landes', 'actu.fr — Actu Landes', 'presse en ligne locale', 'https://actu.fr/nouvelle-aquitaine/landes_40/', 'https://actu.fr/landes/dernieres-actus', 'https://actu.fr/landes/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : articles de chantiers locaux utilisés comme appâts de phishing.'),
    (14, 'corpus:batiment-40-14-landes-info-actualites-locales', 'Landes Info — actualités locales', 'presse en ligne', 'https://landesinfo.net/', 'https://landesinfo.net/edition', 'https://landesinfo.net/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : annonces de travaux frauduleuses diffusées sur un site local imité.'),
    (15, 'corpus:batiment-40-15-les-annonces-landaises-hebdomadaire-local', 'Les Annonces Landaises — hebdomadaire local', 'presse hebdomadaire locale', 'https://www.annonces-landaises.com/', 'https://www.annonces-landaises.com/categories/collectivites/', 'https://www.annonces-landaises.com/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : petites annonces de travaux utilisées pour des escroqueries aux acomptes.'),
    (16, 'corpus:batiment-40-16-google-actualites-veille-batiment-landes-40', 'Google Actualités — veille bâtiment Landes (40)', 'agrégateur de presse locale', 'https://news.google.com/', 'https://news.google.com/rss/search?q=b%C3%A2timent%20Landes%2040&hl=fr&gl=FR&ceid=FR:fr', 'https://news.google.com/rss/search?q=b%C3%A2timent%20Landes%2040&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber nommé dans la veille le 2026-11-22 ; risque : relais de faux communiqués sur des entreprises du bâtiment des Landes.'),
    (17, 'corpus:batiment-40-17-caue-des-landes-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'CAUE des Landes — conseil d''architecture, d''urbanisme et de l''environnement', 'conseil d''architecture, d''urbanisme et de l''environnement', 'https://caue40.com/', 'https://caue40.com/blog', 'https://caue40.com/rss.xml', 'Aucun incident cyber observé sur le flux le 2026-11-22 ; risque : usurpation du CAUE pour diffuser de faux conseils de construction.'),
    (18, 'corpus:batiment-40-18-technopole-domolandes-construction-durable-dax', 'Technopôle Domolandes — construction durable (Dax)', 'technopôle de la construction durable', 'https://www.domolandes.fr/', 'https://www.domolandes.fr/actualites/', 'https://www.domolandes.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : fraude aux aides à la rénovation énergétique ciblant les artisans landais.'),
    (19, 'corpus:batiment-40-19-cluster-odeys-construction-et-amenagement-durables', 'Cluster Odéys — construction et aménagement durables', 'cluster professionnel de la construction durable', 'https://www.odeys.fr/', 'https://www.odeys.fr/actualites', 'https://www.odeys.fr/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux appels à projets usurpant l''identité du cluster.'),
    (20, 'corpus:batiment-40-20-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'CERC Nouvelle-Aquitaine — observatoire de la construction', 'observatoire régional de la construction', 'https://www.cerc-na.fr/', 'https://www.cerc-na.fr/category/actualites/', 'https://www.cerc-na.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : diffusion de fausses statistiques du bâtiment par un site imité.'),
    (21, 'corpus:batiment-40-21-placeco-landes-presse-economique-locale', 'Placéco Landes — presse économique locale', 'presse économique locale', 'https://www.placeco.fr/landes/', 'https://www.placeco.fr/landes/', 'https://www.placeco.fr/landes/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : articles d''annonces de chantiers utilisés comme appâts de phishing.'),
    (22, 'corpus:batiment-40-22-artizo-annuaire-des-artisans-des-landes', 'Artizo — annuaire des artisans des Landes', 'annuaire d''artisans du bâtiment', 'https://www.artizo.fr/catalogue/landes/', 'https://www.artizo.fr/catalogue/landes/', '', 'Aucun fait cyber observé le 2026-11-22 ; risque : fiches d''artisans landais usurpées pour solliciter des devis frauduleux.')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, 'cti', COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       'source d information sectorielle, diffusion publique', true, 'narrative',
       CASE WHEN flux <> '' THEN 'rss' ELSE 'html' END,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-batiment-40.jsonl', 'ligne', ord))::jsonb,
       3600, type || ', secteur batiment, departement 40 (Landes). Exemple cyber : ' || cyber,
       'Nouvelle-Aquitaine', '40'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, description = EXCLUDED.description,
  format = EXCLUDED.format, parser = EXCLUDED.parser, enabled = true;

-- Trace de vérification HTTP des 55 URLs du corpus, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus batiment-40 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:batiment-40-01-capeb-landes-section-departementale-du-batiment', 'https://www.capeb.fr/landes/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-01-capeb-landes-section-departementale-du-batiment', 'https://www.capeb.fr/landes/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-02-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-landes-40', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-02-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-landes-40', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Landes', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-03-pro-rge-entreprises-rge-dans-les-landes-40', 'https://pro-rge.fr/entreprise/d/40/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-03-pro-rge-entreprises-rge-dans-les-landes-40', 'https://pro-rge.fr/entreprises/landes-40/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-03-pro-rge-entreprises-rge-dans-les-landes-40', 'https://news.google.com/rss/search?q=RGE+Landes+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-40-04-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-04-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-05-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-05-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/magazine/actus', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-06-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/annuaire/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-06-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/blog/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-06-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/blog/feed.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-40-07-artisans-reunis-artisans-des-landes-40', 'https://artisansreunis.fr/departement/40-landes', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-07-artisans-reunis-artisans-des-landes-40', 'https://artisansreunis.fr/blog', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-08-cci-des-landes-entreprises-du-batiment-et-de-la-construction', 'https://landes.cci.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-08-cci-des-landes-entreprises-du-batiment-et-de-la-construction', 'https://www.landes.cci.fr/presse/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-08-cci-des-landes-entreprises-du-batiment-et-de-la-construction', 'https://news.google.com/rss/search?q=site%3Alandes.cci.fr+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-40-09-ville-de-mont-de-marsan-urbanisme-habitat-et-travaux', 'https://www.montdemarsan.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-09-ville-de-mont-de-marsan-urbanisme-habitat-et-travaux', 'https://www.montdemarsan.fr/connaitre-le-territoire/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-09-ville-de-mont-de-marsan-urbanisme-habitat-et-travaux', 'https://www.montdemarsan.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-40-10-grand-dax-agglomeration-urbanisme-et-travaux-publics', 'https://www.grand-dax.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-10-grand-dax-agglomeration-urbanisme-et-travaux-publics', 'https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-10-grand-dax-agglomeration-urbanisme-et-travaux-publics', 'https://news.google.com/rss/search?q=%22Grand+Dax%22+b%C3%A2timent+construction&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-40-11-ici-gascogne-actualites-landes-40', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-11-ici-gascogne-actualites-landes-40', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml'),
  ('corpus:batiment-40-12-france-3-nouvelle-aquitaine-edition-landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-12-france-3-nouvelle-aquitaine-edition-landes', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-40-13-actu-fr-actu-landes', 'https://actu.fr/nouvelle-aquitaine/landes_40/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-13-actu-fr-actu-landes', 'https://actu.fr/landes/dernieres-actus', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-13-actu-fr-actu-landes', 'https://actu.fr/landes/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-40-14-landes-info-actualites-locales', 'https://landesinfo.net/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-14-landes-info-actualites-locales', 'https://landesinfo.net/edition', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-14-landes-info-actualites-locales', 'https://landesinfo.net/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-40-15-les-annonces-landaises-hebdomadaire-local', 'https://www.annonces-landaises.com/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-15-les-annonces-landaises-hebdomadaire-local', 'https://www.annonces-landaises.com/categories/collectivites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-15-les-annonces-landaises-hebdomadaire-local', 'https://www.annonces-landaises.com/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-40-16-google-actualites-veille-batiment-landes-40', 'https://news.google.com/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-16-google-actualites-veille-batiment-landes-40', 'https://news.google.com/rss/search?q=b%C3%A2timent%20Landes%2040&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-40-17-caue-des-landes-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'https://caue40.com/', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-17-caue-des-landes-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'https://caue40.com/blog', 'text/html; charset=utf-8'),
  ('corpus:batiment-40-17-caue-des-landes-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'https://caue40.com/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-40-18-technopole-domolandes-construction-durable-dax', 'https://www.domolandes.fr/', 'text/html'),
  ('corpus:batiment-40-18-technopole-domolandes-construction-durable-dax', 'https://www.domolandes.fr/actualites/', 'text/html'),
  ('corpus:batiment-40-18-technopole-domolandes-construction-durable-dax', 'https://www.domolandes.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-40-19-cluster-odeys-construction-et-amenagement-durables', 'https://www.odeys.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-19-cluster-odeys-construction-et-amenagement-durables', 'https://www.odeys.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-19-cluster-odeys-construction-et-amenagement-durables', 'https://www.odeys.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-40-20-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-20-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/category/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-20-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-40-21-placeco-landes-presse-economique-locale', 'https://www.placeco.fr/landes/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-21-placeco-landes-presse-economique-locale', 'https://www.placeco.fr/landes/rss.xml', 'text/html; charset=UTF-8'),
  ('corpus:batiment-40-22-artizo-annuaire-des-artisans-des-landes', 'https://www.artizo.fr/catalogue/landes/', 'text/html; charset=utf-8')
) AS v(source_id, url, content_type);
