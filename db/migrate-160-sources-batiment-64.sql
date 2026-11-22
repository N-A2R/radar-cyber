-- Sources d'information du secteur bâtiment dans le département 64 (Pyrénées-Atlantiques).
-- 21 sources, 48 contrôles HTTP sur 47 URLs distinctes (sites, pages actualités et flux),
-- toutes en HTTP 200 le 2026-11-22 (GET, User-Agent navigateur).
-- Corpus : bench/corpus/sources-batiment-64.jsonl
-- Preuve : bench/results/verification-sources-batiment-64.json

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
    (1, 'corpus:batiment-64-01-caue-64-conseil-d-architecture-d-urbanisme-et-d-environnement-des-pyrenees-atlantiques', 'CAUE 64 — conseil d''architecture, d''urbanisme et d''environnement des Pyrénées-Atlantiques', 'conseil d''architecture, d''urbanisme et d''environnement', 'https://www.caue64.fr/', 'https://www.caue64.fr/accueil/', '', 'Aucun incident cyber observé sur les pages le 2026-11-22 ; risque sectoriel : pièces jointes malveillantes envoyées aux maîtres d''ouvrage du 64 sous couvert de plans ou de documents d''urbanisme.'),
    (2, 'corpus:batiment-64-02-cci-pau-bearn-chambre-de-commerce-et-d-industrie', 'CCI Pau Béarn — chambre de commerce et d''industrie', 'chambre consulaire', 'https://pau.cci.fr/', 'https://pau.cci.fr/?post_type=post', 'https://pau.cci.fr/feed/', 'Article « Trans''Affaires 2026 : préparez votre transmission ou reprise d''entreprise avec la CCI » observé le 2026-11-22 ; risque : faux courriels usurpant la CCI pour solliciter des paiements d''entreprises du bâtiment.'),
    (3, 'corpus:batiment-64-03-cma-nouvelle-aquitaine-actualites-des-artisans-des-pyrenees-atlantiques-64', 'CMA Nouvelle-Aquitaine — actualités des artisans des Pyrénées-Atlantiques (64)', 'chambre des métiers et de l''artisanat', 'https://www.cma64.fr/', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Pyr%C3%A9n%C3%A9es-Atlantiques', '', 'Aucun incident cyber constaté sur la page filtrée 64 le 2026-11-22 ; risque : faux appels de cotisations CMA demandant IBAN et identifiants à des artisans du bâtiment.'),
    (4, 'corpus:batiment-64-04-societe-com-annuaire-des-entreprises-recherche-pyrenees-atlantiques-64', 'Societe.com — annuaire des entreprises (recherche Pyrénées-Atlantiques 64)', 'annuaire professionnel', 'https://www.societe.com/', 'https://www.societe.com/recherche?departement=64', '', 'Aucun incident cyber observé le 2026-11-22 ; risque : usurpation de SIRET d''entreprises du bâtiment du 64 pour émettre de faux devis et détourner des paiements de chantiers.'),
    (5, 'corpus:batiment-64-05-actu-fr-actu-pyrenees-atlantiques-64', 'actu.fr — Actu Pyrénées-Atlantiques (64)', 'presse en ligne locale', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/rss.xml', 'Actualités locales du 64 relevées le 2026-11-22 ; risque sectoriel : faux communiqués de chantiers utilisés comme appâts de phishing ciblant les entreprises du bâtiment.'),
    (6, 'corpus:batiment-64-06-ici-pyrenees-atlantiques-64-actualites-de-radio-france', 'ICI Pyrénées-Atlantiques (64) — actualités de Radio France', 'radio locale (service public)', 'https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64', 'https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64', '', 'Page « Pyrénées-Atlantiques - L''info près de chez vous » consultée le 2026-11-22 ; risque : faux communiqués de travaux publics diffusés au nom de la radio locale.'),
    (7, 'corpus:batiment-64-07-france-3-nouvelle-aquitaine-edition-pyrenees-atlantiques', 'France 3 Nouvelle-Aquitaine — édition Pyrénées-Atlantiques', 'télévision publique locale', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss', 'Aucun incident cyber constaté dans le flux le 2026-11-22 ; risque sectoriel : rançongiciel visant les services d''urbanisme des communes des Pyrénées-Atlantiques.'),
    (8, 'corpus:batiment-64-08-capeb-federation-nationale-des-artisans-du-batiment', 'CAPEB — fédération nationale des artisans du bâtiment', 'syndicat professionnel du bâtiment (fédération nationale)', 'https://www.capeb.fr/', 'https://www.capeb.fr/actualites', '', 'Articles « COP31 : les entreprises artisanales du bâtiment... » et « Carto Silice : l''OPPBTP publie la mise à jour du rapport... » observés le 2026-11-22 ; risque : campagnes de phishing ciblant les artisans du 64.'),
    (9, 'corpus:batiment-64-09-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'Qualibat — certification et annuaire des entreprises du bâtiment', 'organisme de certification et annuaire professionnel', 'https://www.qualibat.com/', 'https://www.qualibat.com/actualites', '', 'Alerte « nouvelle campagne de phishing en cours » visible sur la page actualités le 2026-11-22 ; concerne directement les entreprises certifiées des Pyrénées-Atlantiques.'),
    (10, 'corpus:batiment-64-10-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'Artisanat.fr — magazine d''actualités de l''artisanat (CMA)', 'réseau consulaire et magazine d''actualités des artisans', 'https://www.artisanat.fr/', 'https://www.artisanat.fr/magazine/actus', '', 'Rubrique « L''actualité du faire » consultée le 2026-11-22 ; risque sectoriel : guides de cybersécurité pour TPE artisanales du bâtiment, cible fréquente de fraude au RIB.'),
    (11, 'corpus:batiment-64-11-odeys-cluster-de-la-construction-et-de-l-amenagement-durables-nouvelle-aquitaine', 'Odéys — cluster de la construction et de l''aménagement durables (Nouvelle-Aquitaine)', 'cluster professionnel de la construction durable', 'https://www.odeys.fr/', 'https://www.odeys.fr/actualites', 'https://www.odeys.fr/rss.xml', 'Aucun incident cyber relevé dans le flux le 2026-11-22 ; risque : faux appels à projets usurpant le cluster auprès d''entreprises béarnaises et basques.'),
    (12, 'corpus:batiment-64-12-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'CERC Nouvelle-Aquitaine — observatoire de la construction', 'observatoire régional de la construction', 'https://www.cerc-na.fr/', 'https://www.cerc-na.fr/category/actualites/', 'https://www.cerc-na.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : diffusion de fausses statistiques du bâtiment par un site imité ciblant le département 64.'),
    (13, 'corpus:batiment-64-13-bing-actualites-veille-batiment-pyrenees-atlantiques-64', 'Bing Actualités — veille bâtiment Pyrénées-Atlantiques (64)', 'agrégateur de presse locale', 'https://www.bing.com/news', 'https://www.bing.com/news/search?q=b%C3%A2timent+Pyr%C3%A9n%C3%A9es-Atlantiques&format=rss', 'https://www.bing.com/news/search?q=b%C3%A2timent+Pyr%C3%A9n%C3%A9es-Atlantiques&format=rss', 'Le flux du 2026-11-22 relaie « Pyrénées-Atlantiques : réhabilitation du bâtiment C du site Jean-Jacques Rousseau à Bayonne » et « Réemploi dans le bâtiment » ; risque : appâts de phishing reprenant ces chantiers.'),
    (14, 'corpus:batiment-64-14-prefecture-des-pyrenees-atlantiques-actualites-habitat-et-urbanisme', 'Préfecture des Pyrénées-Atlantiques — actualités (habitat et urbanisme)', 'préfecture (habitat et urbanisme)', 'https://www.pyrenees-atlantiques.gouv.fr/', 'https://www.pyrenees-atlantiques.gouv.fr/Actualites', '', 'Aucun incident cyber constaté le 2026-11-22 ; risque : faux courriels de la préfecture demandant aux collectivités et artisans du 64 de transmettre des dossiers de construction via un formulaire non officiel.'),
    (15, 'corpus:batiment-64-15-ville-de-bayonne-actualites-urbanisme-et-chantiers', 'Ville de Bayonne — actualités (urbanisme et chantiers)', 'collectivité (ville)', 'https://www.bayonne.fr/', 'https://www.bayonne.fr/information-transversale/actualites', '', 'Aucun incident cyber observé le 2026-11-22 ; risque : faux courriels de la mairie demandant le paiement en ligne de frais de permis de construire à des artisans bayonnais.'),
    (16, 'corpus:batiment-64-16-la-depeche-du-midi-edition-pyrenees-atlantiques-64', 'La Dépêche du Midi — édition Pyrénées-Atlantiques (64)', 'presse locale', 'https://www.ladepeche.fr/', 'https://www.ladepeche.fr/pyrenees-atlantiques', 'https://www.ladepeche.fr/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : compromission de messageries d''artisans et de négociants en matériaux du 64 avec falsification de factures.'),
    (17, 'corpus:batiment-64-17-mediabask-quotidien-local-du-pays-basque', 'Mediabask — quotidien local du Pays basque', 'presse locale quotidienne (Pays basque)', 'https://www.mediabask.eus/', 'https://www.mediabask.eus/', 'https://www.mediabask.eus/eu/rss/sections/mediabask.rss', 'Le flux du 2026-11-22 relaie « Sur le logement, l''extrême droite ne propose rien, est contre tout, et ment » et le point sur le projet LGV ; risque : faux communiqués de chantiers utilisés comme appâts.'),
    (18, 'corpus:batiment-64-18-ici-pays-basque-actualites-et-renovation', 'ICI Pays Basque — actualités et rénovation', 'radio locale (service public)', 'https://www.ici.fr/', 'https://www.ici.fr/radio/pays-basque', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'Article « St-Jean-Pied-de-Port remporte 25 000 euros pour rénover son église » observé le 2026-11-22 ; risque : fausses annonces de subventions de rénovation ciblant les artisans du 64.'),
    (19, 'corpus:batiment-64-19-ici-bearn-bigorre-actualites-de-pau-et-du-bearn', 'ICI Béarn Bigorre — actualités de Pau et du Béarn', 'radio locale (service public)', 'https://www.ici.fr/', 'https://www.ici.fr/radio/bearn', 'https://www.ici.fr/rss/bearn/rubrique/infos.xml', 'Le flux du 2026-11-22 relaie « Poly clinique Pau Pyrénées : une fusion coûteuse et une gestion sévèrement épinglée par la Chambre régionale des comptes » ; risque : usurpation de communications de chantiers publics béarnais.'),
    (20, 'corpus:batiment-64-20-departement-des-pyrenees-atlantiques-le64-fr', 'Département des Pyrénées-Atlantiques — le64.fr', 'institutionnel (conseil départemental)', 'https://www.le64.fr/', 'https://www.le64.fr/lactualite-du-departement', 'https://le64.fr/rss.xml', 'Le flux RSS du 2026-11-22 relaie les actualités du département 64, dont « Inauguration de la maison d''Arthez à Saint-Palais » ; risque : faux courriels d''aides à la rénovation usurpant le conseil départemental.'),
    (21, 'corpus:batiment-64-21-greta-cfa-aquitaine-pole-batiment-travaux-publics-bearn-pays-basque', 'GRETA-CFA Aquitaine — pôle Bâtiment Travaux Publics Béarn / Pays Basque', 'organisme de formation BTP et apprentissage', 'https://greta-cfa-aquitaine.fr/', 'https://greta-cfa-aquitaine.fr/actualites/', '', 'La page « Découvrez les dernières actualités des GRETA-CFA Aquitaine » et la filière « Bâtiment Travaux Publics » sont visibles le 2026-11-22 ; risque : faux courriels d''inscription demandant des coordonnées bancaires à des apprentis du 64.')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, 'cti', COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       'source d information sectorielle, diffusion publique', true, 'narrative',
       CASE WHEN flux <> '' THEN 'rss' ELSE 'html' END,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-batiment-64.jsonl', 'ligne', ord))::jsonb,
       3600, type || ', secteur batiment, departement 64 (Pyrénées-Atlantiques). Exemple cyber : ' || cyber,
       'Nouvelle-Aquitaine', '64'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, description = EXCLUDED.description,
  format = EXCLUDED.format, parser = EXCLUDED.parser, enabled = true;

-- Trace de vérification HTTP des 48 URLs du corpus, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus batiment-64 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:batiment-64-01-caue-64-conseil-d-architecture-d-urbanisme-et-d-environnement-des-pyrenees-atlantiques', 'https://www.caue64.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-01-caue-64-conseil-d-architecture-d-urbanisme-et-d-environnement-des-pyrenees-atlantiques', 'https://www.caue64.fr/accueil/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-02-cci-pau-bearn-chambre-de-commerce-et-d-industrie', 'https://pau.cci.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-02-cci-pau-bearn-chambre-de-commerce-et-d-industrie', 'https://pau.cci.fr/?post_type=post', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-02-cci-pau-bearn-chambre-de-commerce-et-d-industrie', 'https://pau.cci.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-64-03-cma-nouvelle-aquitaine-actualites-des-artisans-des-pyrenees-atlantiques-64', 'https://www.cma64.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-03-cma-nouvelle-aquitaine-actualites-des-artisans-des-pyrenees-atlantiques-64', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Pyr%C3%A9n%C3%A9es-Atlantiques', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-04-societe-com-annuaire-des-entreprises-recherche-pyrenees-atlantiques-64', 'https://www.societe.com/', 'text/html'),
  ('corpus:batiment-64-04-societe-com-annuaire-des-entreprises-recherche-pyrenees-atlantiques-64', 'https://www.societe.com/recherche?departement=64', 'text/html'),
  ('corpus:batiment-64-05-actu-fr-actu-pyrenees-atlantiques-64', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-05-actu-fr-actu-pyrenees-atlantiques-64', 'https://actu.fr/nouvelle-aquitaine/pyrenees-atlantiques_64/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-64-06-ici-pyrenees-atlantiques-64-actualites-de-radio-france', 'https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-07-france-3-nouvelle-aquitaine-edition-pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-07-france-3-nouvelle-aquitaine-edition-pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-64-08-capeb-federation-nationale-des-artisans-du-batiment', 'https://www.capeb.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-64-08-capeb-federation-nationale-des-artisans-du-batiment', 'https://www.capeb.fr/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-64-09-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-09-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-10-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-64-10-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/magazine/actus', 'text/html; charset=utf-8'),
  ('corpus:batiment-64-11-odeys-cluster-de-la-construction-et-de-l-amenagement-durables-nouvelle-aquitaine', 'https://www.odeys.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-11-odeys-cluster-de-la-construction-et-de-l-amenagement-durables-nouvelle-aquitaine', 'https://www.odeys.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-11-odeys-cluster-de-la-construction-et-de-l-amenagement-durables-nouvelle-aquitaine', 'https://www.odeys.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-64-12-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-12-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/category/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-12-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-64-13-bing-actualites-veille-batiment-pyrenees-atlantiques-64', 'https://www.bing.com/news', 'text/html; charset=utf-8'),
  ('corpus:batiment-64-13-bing-actualites-veille-batiment-pyrenees-atlantiques-64', 'https://www.bing.com/news/search?q=b%C3%A2timent+Pyr%C3%A9n%C3%A9es-Atlantiques&format=rss', 'application/xml; charset=utf-8'),
  ('corpus:batiment-64-14-prefecture-des-pyrenees-atlantiques-actualites-habitat-et-urbanisme', 'https://www.pyrenees-atlantiques.gouv.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-14-prefecture-des-pyrenees-atlantiques-actualites-habitat-et-urbanisme', 'https://www.pyrenees-atlantiques.gouv.fr/Actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-15-ville-de-bayonne-actualites-urbanisme-et-chantiers', 'https://www.bayonne.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-15-ville-de-bayonne-actualites-urbanisme-et-chantiers', 'https://www.bayonne.fr/information-transversale/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-16-la-depeche-du-midi-edition-pyrenees-atlantiques-64', 'https://www.ladepeche.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-16-la-depeche-du-midi-edition-pyrenees-atlantiques-64', 'https://www.ladepeche.fr/pyrenees-atlantiques', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-16-la-depeche-du-midi-edition-pyrenees-atlantiques-64', 'https://www.ladepeche.fr/rss.xml', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-64-17-mediabask-quotidien-local-du-pays-basque', 'https://www.mediabask.eus/', 'text/html; charset=utf-8'),
  ('corpus:batiment-64-17-mediabask-quotidien-local-du-pays-basque', 'https://www.mediabask.eus/eu/rss/sections/mediabask.rss', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-64-18-ici-pays-basque-actualites-et-renovation', 'https://www.ici.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-18-ici-pays-basque-actualites-et-renovation', 'https://www.ici.fr/radio/pays-basque', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-18-ici-pays-basque-actualites-et-renovation', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'application/xml'),
  ('corpus:batiment-64-19-ici-bearn-bigorre-actualites-de-pau-et-du-bearn', 'https://www.ici.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-19-ici-bearn-bigorre-actualites-de-pau-et-du-bearn', 'https://www.ici.fr/radio/bearn', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-19-ici-bearn-bigorre-actualites-de-pau-et-du-bearn', 'https://www.ici.fr/rss/bearn/rubrique/infos.xml', 'application/xml'),
  ('corpus:batiment-64-20-departement-des-pyrenees-atlantiques-le64-fr', 'https://www.le64.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-64-20-departement-des-pyrenees-atlantiques-le64-fr', 'https://www.le64.fr/lactualite-du-departement', 'text/html; charset=utf-8'),
  ('corpus:batiment-64-20-departement-des-pyrenees-atlantiques-le64-fr', 'https://le64.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-64-21-greta-cfa-aquitaine-pole-batiment-travaux-publics-bearn-pays-basque', 'https://greta-cfa-aquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-64-21-greta-cfa-aquitaine-pole-batiment-travaux-publics-bearn-pays-basque', 'https://greta-cfa-aquitaine.fr/actualites/', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type);
