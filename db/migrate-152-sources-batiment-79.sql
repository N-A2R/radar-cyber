-- Sources d'information du secteur bâtiment dans le département 79 (Deux-Sèvres).
-- 22 sources, 53 contrôles HTTP sur 53 URLs distinctes (sites, pages actualités et flux),
-- toutes en HTTP 200 le 2026-11-22 (curl -L, User-Agent navigateur).
-- Corpus : bench/corpus/sources-batiment-79.jsonl
-- Preuve : bench/results/verification-sources-batiment-79.json

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
    (1, 'corpus:batiment-79-01-capeb-deux-sevres-section-departementale-du-batiment', 'CAPEB Deux-Sèvres — section départementale du bâtiment', 'syndicat professionnel du bâtiment', 'https://www.capeb.fr/deux-sevres/', 'https://www.capeb.fr/deux-sevres/actualites', 'https://news.google.com/rss/search?q=CAPEB+Deux-S%C3%A8vres+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé sur la page le 2026-11-22 ; risque sectoriel : faux devis et faux RIB envoyés depuis la messagerie compromise d''un artisan du 79.'),
    (2, 'corpus:batiment-79-02-cma-nouvelle-aquitaine-cma-des-deux-sevres-79', 'CMA Nouvelle-Aquitaine — CMA des Deux-Sèvres (79)', 'chambre des métiers et de l''artisanat', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-deux-sevres-niort', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Deux-S%C3%A8vres', 'https://news.google.com/rss/search?q=CMA+Deux-S%C3%A8vres+artisanat&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé pour la CMA 79 le 2026-11-22 ; risque : phishing ciblant les artisans avec de faux appels de cotisations demandant IBAN et identifiants.'),
    (3, 'corpus:batiment-79-03-pro-rge-entreprises-rge-en-deux-sevres-79', 'Pro-RGE — entreprises RGE en Deux-Sèvres (79)', 'annuaire professionnel public (artisans RGE)', 'https://pro-rge.fr/entreprise/d/79/', 'https://pro-rge.fr/entreprises/deux-sevres-79/', 'https://news.google.com/rss/search?q=RGE+Deux-S%C3%A8vres+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé le 2026-11-22 ; risque : profils d''artisans RGE du 79 usurpés pour solliciter des acomptes sur des travaux de rénovation.'),
    (4, 'corpus:batiment-79-04-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'Qualibat — certification et annuaire des entreprises du bâtiment', 'organisme de certification et annuaire professionnel', 'https://www.qualibat.com/', 'https://www.qualibat.com/actualites', 'https://news.google.com/rss/search?q=Qualibat+b%C3%A2timent+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé le 2026-11-22 ; risque : courriels se présentant comme Qualibat demandant aux entreprises du 79 de payer une redevance sur un faux site.'),
    (5, 'corpus:batiment-79-05-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'Artisanat.fr — magazine d''actualités de l''artisanat (CMA)', 'réseau consulaire et magazine d''actualités des artisans', 'https://www.artisanat.fr/', 'https://www.artisanat.fr/magazine/actus', 'https://news.google.com/rss/search?q=artisanat+b%C3%A2timent+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé dans le magazine le 2026-11-22 ; risque : articles copiés sur un site miroir pour diffuser des liens de phishing vers les artisans.'),
    (6, 'corpus:batiment-79-06-caue-79-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'CAUE 79 — conseil d''architecture, d''urbanisme et de l''environnement', 'conseil d''architecture, d''urbanisme et de l''environnement', 'https://www.caue79.fr/', 'https://www.caue79.fr/actualites', '', 'Aucun incident cyber observé pour le CAUE 79 le 2026-11-22 ; risque : pièces jointes malveillantes envoyées aux maîtres d''ouvrage sous couvert de documents d''urbanisme.'),
    (7, 'corpus:batiment-79-07-siteartisan-annuaire-des-artisans-du-batiment', 'SiteArtisan — annuaire des artisans du bâtiment', 'annuaire d''artisans du bâtiment', 'https://www.siteartisan.fr/annuaire/', 'https://www.siteartisan.fr/blog/', 'https://www.siteartisan.fr/blog/feed.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : fiches d''artisans du 79 usurpées pour émettre des devis frauduleux.'),
    (8, 'corpus:batiment-79-08-odeys-cluster-de-la-construction-et-de-l-amenagement-durables', 'Odéys — cluster de la construction et de l''aménagement durables', 'cluster professionnel de la construction durable', 'https://www.odeys.fr/', 'https://www.odeys.fr/actualites', 'https://www.odeys.fr/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux appels à projets de construction durable ciblant les entreprises de Nouvelle-Aquitaine.'),
    (9, 'corpus:batiment-79-09-actu-fr-actu-deux-sevres', 'actu.fr — Actu Deux-Sèvres', 'presse en ligne locale', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79/', 'https://actu.fr/deux-sevres/dernieres-actus', 'https://actu.fr/deux-sevres/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : articles de chantiers du 79 utilisés comme appâts de phishing.'),
    (10, 'corpus:batiment-79-10-la-nouvelle-republique-edition-deux-sevres-79', 'La Nouvelle République — édition Deux-Sèvres (79)', 'presse quotidienne régionale', 'https://www.lanouvellerepublique.fr/deux-sevres', 'https://www.lanouvellerepublique.fr/deux-sevres', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'Article vérifié : « Cyberattaque d''ampleur nationale : des supermarchés des Deux-Sèvres contraints de jeter des produits frais et surgelés » (12/10/2026) ; aussi « Le chiffrement de certains fichiers : une maison de retraite des Deux-Sèvres victime d''une cyberattaque par rançongiciel » (08/12/2025) — https://www.lanouvellerepublique.fr/deux-sevres/commune/champdeniers-saint-denis/le-chiffrement-de-certains-fichiers-une-maison-de-retraite-des-deux-sevres-victime-d-une-cyberattaque-par-rancongiciel-1765374244'),
    (11, 'corpus:batiment-79-11-placeco-actualites-economiques-des-deux-sevres', 'Placéco — actualités économiques des Deux-Sèvres', 'presse économique locale', 'https://www.placeco.fr/deux-sevres/', 'https://www.placeco.fr/deux-sevres/', 'https://news.google.com/rss/search?q=Plac%C3%A9co+Deux-S%C3%A8vres+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé le 2026-11-22 ; risque : usurpation de professionnels de l''immobilier et du bâtiment du 79 pour escroquerie au faux RIB.'),
    (12, 'corpus:batiment-79-12-google-actualites-veille-batiment-deux-sevres-79', 'Google Actualités — veille bâtiment Deux-Sèvres (79)', 'agrégateur de presse locale', 'https://news.google.com/', 'https://news.google.com/rss/search?q=b%C3%A2timent+Deux-S%C3%A8vres+79&hl=fr&gl=FR&ceid=FR:fr', 'https://news.google.com/rss/search?q=b%C3%A2timent+Deux-S%C3%A8vres+79&hl=fr&gl=FR&ceid=FR:fr', 'La veille du 2026-11-22 indexe notamment « 63 millions d''investissements publics à venir : en Deux-Sèvres, les acteurs du BTP veulent leur part du gâteau » ; risque : fuite de données de marchés publics et de plans de chantiers.'),
    (13, 'corpus:batiment-79-13-ville-de-niort-actualites-urbanisme-et-travaux', 'Ville de Niort — actualités (urbanisme et travaux)', 'collectivité (ville)', 'https://www.niort.fr/', 'https://www.niort.fr/actualites/', 'https://news.google.com/rss/search?q=Niort+b%C3%A2timent+travaux&hl=fr&gl=FR&ceid=FR:fr', 'Article vérifié : « Des SMS frauduleux usurpent le nom de la Ville de Niort, la municipalité sonne l''alerte » — https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html'),
    (14, 'corpus:batiment-79-14-ville-de-bressuire-actualites-urbanisme-et-travaux', 'Ville de Bressuire — actualités (urbanisme et travaux)', 'collectivité (ville)', 'https://www.ville-bressuire.fr/', 'https://www.ville-bressuire.fr/systeme/actualites/', 'https://news.google.com/rss/search?q=Bressuire+b%C3%A2timent+travaux&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé sur cette source le 2026-11-22 ; risque : faux avis d''appels d''offres de travaux diffusés au nom de la ville pour collecter des cautionnements.'),
    (15, 'corpus:batiment-79-15-ville-de-parthenay-actualites-urbanisme-et-travaux', 'Ville de Parthenay — actualités (urbanisme et travaux)', 'collectivité (ville)', 'https://www.parthenay.fr/', 'https://www.parthenay.fr/actualites', 'https://www.parthenay.fr/actualites/rss', 'Aucun incident cyber observé sur cette source le 2026-11-22 ; risque : annonces de chantiers municipaux copiées sur un site miroir pour capter les candidatures d''entreprises.'),
    (16, 'corpus:batiment-79-16-artizo-annuaire-des-artisans-des-deux-sevres', 'Artizo — annuaire des artisans des Deux-Sèvres', 'annuaire d''artisans du bâtiment', 'https://www.artizo.fr/catalogue/deux-sevres/', 'https://www.artizo.fr/catalogue/deux-sevres/', '', 'Aucun fait cyber observé le 2026-11-22 ; risque : usurpation de fiches d''artisans vérifiés du 79 pour demander des acomptes.'),
    (17, 'corpus:batiment-79-17-ffb-tp-79-la-fede-79-dans-ma-poche-federation-departementale-btp', 'FFB TP 79 — La Fédé 79 dans ma poche (fédération départementale BTP)', 'fédération départementale du bâtiment et des travaux publics', 'https://www.ffb79.fr/', 'https://www.ffb79.fr/', '', 'Aucun incident cyber observé le 2026-11-22 ; risque : courriels usurpant la FFB 79 demandant aux entreprises de travaux publics de payer une cotisation sur un faux site.'),
    (18, 'corpus:batiment-79-18-ici-poitou-rubrique-btp-et-actualites-des-deux-sevres-79', 'ICI Poitou — rubrique BTP et actualités des Deux-Sèvres (79)', 'radio publique locale (Radio France)', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'https://www.ici.fr/theme/btp', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'Article vérifié : « Deux-Sèvres : un Ehpad de Champdeniers victime d''une cyberattaque avec demande de rançon » (11/12/2025) — https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797'),
    (19, 'corpus:batiment-79-19-radio-gatine-actualites-des-deux-sevres', 'Radio Gâtine — actualités des Deux-Sèvres', 'radio associative locale', 'https://radiogatine.fr/news', 'https://radiogatine.fr/news', 'https://radiogatine.fr/rss-feed-1', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux messages au nom de radios locales annonçant des chantiers publics pour capter des données d''entreprises.'),
    (20, 'corpus:batiment-79-20-niort-info-presse-locale-chantiers-et-habitat', 'Niort info — presse locale (chantiers et habitat)', 'presse en ligne locale', 'https://niortinfo.media/', 'https://niortinfo.media/?s=chantier', 'https://niortinfo.media/feed/', 'Aucun incident cyber observé le 2026-11-22 ; risque : articles sur les chantiers niortais copiés pour diffuser des liens de phishing vers les artisans.'),
    (21, 'corpus:batiment-79-21-alouette-actualites-deux-sevres-construction-et-chantiers', 'Alouette — actualités Deux-Sèvres (construction et chantiers)', 'radio locale', 'https://www.alouette.fr/infos', 'https://www.alouette.fr/infos', '', 'Aucun incident cyber observé le 2026-11-22 ; risque : faux appels d''offres de chantiers éoliens ciblant les sous-traitants du 79.'),
    (22, 'corpus:batiment-79-22-france-3-nouvelle-aquitaine-edition-deux-sevres', 'France 3 Nouvelle-Aquitaine — édition Deux-Sèvres', 'télévision publique locale', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', '', 'Aucun incident cyber observé le 2026-11-22 ; risque : faux communiqués sur des projets de construction diffusés au nom de la rédaction locale.')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, 'cti', COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       'source d information sectorielle, diffusion publique', true, 'narrative',
       CASE WHEN flux <> '' THEN 'rss' ELSE 'html' END,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-batiment-79.jsonl', 'ligne', ord))::jsonb,
       3600, type || ', secteur batiment, departement 79 (Deux-Sèvres). Exemple cyber : ' || cyber,
       'Nouvelle-Aquitaine', '79'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, description = EXCLUDED.description,
  format = EXCLUDED.format, parser = EXCLUDED.parser, enabled = true;

INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus batiment-79 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:batiment-79-01-capeb-deux-sevres-section-departementale-du-batiment', 'https://www.capeb.fr/deux-sevres/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-01-capeb-deux-sevres-section-departementale-du-batiment', 'https://www.capeb.fr/deux-sevres/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-01-capeb-deux-sevres-section-departementale-du-batiment', 'https://news.google.com/rss/search?q=CAPEB+Deux-S%C3%A8vres+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-02-cma-nouvelle-aquitaine-cma-des-deux-sevres-79', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-deux-sevres-niort', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-02-cma-nouvelle-aquitaine-cma-des-deux-sevres-79', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Deux-S%C3%A8vres', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-02-cma-nouvelle-aquitaine-cma-des-deux-sevres-79', 'https://news.google.com/rss/search?q=CMA+Deux-S%C3%A8vres+artisanat&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-03-pro-rge-entreprises-rge-en-deux-sevres-79', 'https://pro-rge.fr/entreprise/d/79/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-03-pro-rge-entreprises-rge-en-deux-sevres-79', 'https://pro-rge.fr/entreprises/deux-sevres-79/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-03-pro-rge-entreprises-rge-en-deux-sevres-79', 'https://news.google.com/rss/search?q=RGE+Deux-S%C3%A8vres+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-04-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-04-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-04-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://news.google.com/rss/search?q=Qualibat+b%C3%A2timent+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-05-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-05-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/magazine/actus', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-05-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://news.google.com/rss/search?q=artisanat+b%C3%A2timent+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-06-caue-79-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'https://www.caue79.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-06-caue-79-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'https://www.caue79.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-07-siteartisan-annuaire-des-artisans-du-batiment', 'https://www.siteartisan.fr/annuaire/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-07-siteartisan-annuaire-des-artisans-du-batiment', 'https://www.siteartisan.fr/blog/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-07-siteartisan-annuaire-des-artisans-du-batiment', 'https://www.siteartisan.fr/blog/feed.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-79-08-odeys-cluster-de-la-construction-et-de-l-amenagement-durables', 'https://www.odeys.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-08-odeys-cluster-de-la-construction-et-de-l-amenagement-durables', 'https://www.odeys.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-08-odeys-cluster-de-la-construction-et-de-l-amenagement-durables', 'https://www.odeys.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-79-09-actu-fr-actu-deux-sevres', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-09-actu-fr-actu-deux-sevres', 'https://actu.fr/deux-sevres/dernieres-actus', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-09-actu-fr-actu-deux-sevres', 'https://actu.fr/deux-sevres/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-79-10-la-nouvelle-republique-edition-deux-sevres-79', 'https://www.lanouvellerepublique.fr/deux-sevres', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-10-la-nouvelle-republique-edition-deux-sevres-79', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-79-11-placeco-actualites-economiques-des-deux-sevres', 'https://www.placeco.fr/deux-sevres/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-11-placeco-actualites-economiques-des-deux-sevres', 'https://news.google.com/rss/search?q=Plac%C3%A9co+Deux-S%C3%A8vres+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-12-google-actualites-veille-batiment-deux-sevres-79', 'https://news.google.com/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-12-google-actualites-veille-batiment-deux-sevres-79', 'https://news.google.com/rss/search?q=b%C3%A2timent+Deux-S%C3%A8vres+79&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-13-ville-de-niort-actualites-urbanisme-et-travaux', 'https://www.niort.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-13-ville-de-niort-actualites-urbanisme-et-travaux', 'https://www.niort.fr/actualites/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-13-ville-de-niort-actualites-urbanisme-et-travaux', 'https://news.google.com/rss/search?q=Niort+b%C3%A2timent+travaux&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-14-ville-de-bressuire-actualites-urbanisme-et-travaux', 'https://www.ville-bressuire.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-14-ville-de-bressuire-actualites-urbanisme-et-travaux', 'https://www.ville-bressuire.fr/systeme/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-14-ville-de-bressuire-actualites-urbanisme-et-travaux', 'https://news.google.com/rss/search?q=Bressuire+b%C3%A2timent+travaux&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-79-15-ville-de-parthenay-actualites-urbanisme-et-travaux', 'https://www.parthenay.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-15-ville-de-parthenay-actualites-urbanisme-et-travaux', 'https://www.parthenay.fr/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-15-ville-de-parthenay-actualites-urbanisme-et-travaux', 'https://www.parthenay.fr/actualites/rss', 'text/xml;charset=utf-8'),
  ('corpus:batiment-79-16-artizo-annuaire-des-artisans-des-deux-sevres', 'https://www.artizo.fr/catalogue/deux-sevres/', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-17-ffb-tp-79-la-fede-79-dans-ma-poche-federation-departementale-btp', 'https://www.ffb79.fr/', 'text/html'),
  ('corpus:batiment-79-18-ici-poitou-rubrique-btp-et-actualites-des-deux-sevres-79', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-18-ici-poitou-rubrique-btp-et-actualites-des-deux-sevres-79', 'https://www.ici.fr/theme/btp', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-18-ici-poitou-rubrique-btp-et-actualites-des-deux-sevres-79', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml'),
  ('corpus:batiment-79-19-radio-gatine-actualites-des-deux-sevres', 'https://radiogatine.fr/news', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-19-radio-gatine-actualites-des-deux-sevres', 'https://radiogatine.fr/rss-feed-1', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-79-20-niort-info-presse-locale-chantiers-et-habitat', 'https://niortinfo.media/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-20-niort-info-presse-locale-chantiers-et-habitat', 'https://niortinfo.media/?s=chantier', 'text/html; charset=UTF-8'),
  ('corpus:batiment-79-20-niort-info-presse-locale-chantiers-et-habitat', 'https://niortinfo.media/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-79-21-alouette-actualites-deux-sevres-construction-et-chantiers', 'https://www.alouette.fr/infos', 'text/html; charset=utf-8'),
  ('corpus:batiment-79-22-france-3-nouvelle-aquitaine-edition-deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type);
