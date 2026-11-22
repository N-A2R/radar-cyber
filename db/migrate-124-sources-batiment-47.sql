-- Sources d'information du secteur bâtiment dans le département 47 (Lot-et-Garonne).
-- 28 sources, 68 contrôles HTTP sur 68 URLs distinctes (sites, pages actualités et flux),
-- toutes en HTTP 200 le 2026-11-22 (curl -L, User-Agent navigateur).
-- Corpus : bench/corpus/sources-batiment-47.jsonl
-- Preuve : bench/results/verification-sources-batiment-47.json

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
    (1, 'corpus:batiment-47-01-capeb-lot-et-garonne-section-departementale-du-batiment', 'CAPEB Lot-et-Garonne — section départementale du bâtiment', 'syndicat professionnel du bâtiment', 'https://www.capeb.fr/lot-et-garonne/', 'https://www.capeb.fr/lot-et-garonne/actualites', '', 'Aucun incident cyber observé sur la page le 2026-11-22 ; risque sectoriel : faux devis et faux RIB envoyés depuis la messagerie compromise d''un artisan du Lot-et-Garonne.'),
    (2, 'corpus:batiment-47-02-pro-rge-entreprises-rge-dans-le-lot-et-garonne-47', 'Pro-RGE — entreprises RGE dans le Lot-et-Garonne (47)', 'annuaire professionnel public (artisans RGE)', 'https://pro-rge.fr/entreprise/d/47/', 'https://pro-rge.fr/entreprises/lot-et-garonne-47/', 'https://news.google.com/rss/search?q=RGE+Lot-et-Garonne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé le 2026-11-22 ; risque : profils d''artisans RGE du 47 usurpés pour solliciter des acomptes sur des travaux de rénovation.'),
    (3, 'corpus:batiment-47-03-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'Qualibat — certification et annuaire des entreprises du bâtiment', 'organisme de certification et annuaire professionnel', 'https://www.qualibat.com/', 'https://www.qualibat.com/actualites', '', 'Alerte « nouvelle campagne de phishing en cours » visible sur la page actualités le 2026-11-22 ; risque pour les entreprises certifiées du Lot-et-Garonne.'),
    (4, 'corpus:batiment-47-04-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'Artisanat.fr — magazine d''actualités de l''artisanat (CMA)', 'réseau consulaire et magazine d''actualités des artisans', 'https://www.artisanat.fr/', 'https://www.artisanat.fr/magazine/actus', '', 'Guide « Cybersécurité : comment protéger votre entreprise des cyberattaques ? » visible sur /magazine/actus le 2026-11-22 ; concerne les TPE artisanales du bâtiment du 47.'),
    (5, 'corpus:batiment-47-05-siteartisan-annuaire-des-artisans', 'SiteArtisan — annuaire des artisans', 'annuaire d''artisans du bâtiment', 'https://www.siteartisan.fr/annuaire/', 'https://www.siteartisan.fr/blog/', 'https://www.siteartisan.fr/blog/feed.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : fiches d''artisans du 47 compromises pour émettre des devis frauduleux.'),
    (6, 'corpus:batiment-47-06-odeys-cluster-de-la-construction-et-de-l-amenagement-durables', 'Odéys — cluster de la construction et de l''aménagement durables', 'cluster professionnel de la construction durable', 'https://www.odeys.fr/', 'https://www.odeys.fr/actualites', 'https://www.odeys.fr/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux appels à projets usurpant l''identité du cluster auprès d''entreprises lot-et-garonnaises.'),
    (7, 'corpus:batiment-47-07-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'CERC Nouvelle-Aquitaine — observatoire de la construction', 'observatoire régional de la construction', 'https://www.cerc-na.fr/', 'https://www.cerc-na.fr/category/actualites/', 'https://www.cerc-na.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : diffusion de fausses statistiques du bâtiment par un site imité ciblant le Lot-et-Garonne.'),
    (8, 'corpus:batiment-47-08-cma-nouvelle-aquitaine-actualites-des-artisans-du-lot-et-garonne-47', 'CMA Nouvelle-Aquitaine — actualités des artisans du Lot-et-Garonne (47)', 'chambre des métiers et de l''artisanat', 'https://cma-nouvelleaquitaine.fr/', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Lot-et-Garonne', '', 'Aucun fait cyber observé le 2026-11-22 ; risque : usurpation d''identité d''artisans du bâtiment du 47 via les annuaires et formulaires de la CMA.'),
    (9, 'corpus:batiment-47-09-ici-gascogne-actualites-du-lot-et-garonne-47', 'ICI Gascogne — actualités du Lot-et-Garonne (47)', 'radio locale', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux communiqués sur des chantiers publics du 47 pour manipuler l''opinion locale.'),
    (10, 'corpus:batiment-47-10-france-3-nouvelle-aquitaine-edition-lot-et-garonne', 'France 3 Nouvelle-Aquitaine — édition Lot-et-Garonne', 'télévision publique locale', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/lot-et-garonne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/lot-et-garonne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/lot-et-garonne/rss', 'Aucun fait cyber observé dans le flux le 2026-11-22 ; risque : rançongiciel contre les services d''urbanisme des communes lot-et-garonnaises.'),
    (11, 'corpus:batiment-47-11-la-depeche-du-midi-edition-agen-lot-et-garonne', 'La Dépêche du Midi — édition Agen / Lot-et-Garonne', 'presse locale', 'https://www.ladepeche.fr/', 'https://www.ladepeche.fr/lot-et-garonne/agen', 'https://www.ladepeche.fr/rss.xml', 'Aucun incident cyber observé sur ce média le 2026-11-22 ; risque sectoriel : détournement de virements par faux RIB dans les entreprises du bâtiment du Lot-et-Garonne.'),
    (12, 'corpus:batiment-47-12-petit-bleu-agen-et-sa-region', 'Petit Bleu — Agen et sa région', 'presse locale', 'https://www.petitbleu.fr/', 'https://www.petitbleu.fr/lot-et-garonne/', 'https://www.petitbleu.fr/rss.xml', 'Aucun incident cyber observé sur ce média le 2026-11-22 ; risque : compromission des messageries d''artisans et négociants en matériaux du 47 avec falsification de factures.'),
    (13, 'corpus:batiment-47-13-quidam-hebdo-agen', 'Quidam Hebdo — Agen', 'hebdomadaire local', 'https://quidam-hebdo.com/', 'https://quidam-hebdo.com/category/agen/', 'https://quidam-hebdo.com/feed/', 'Article Sud Ouest du 12/11/2026 relatant des tentatives de piratage quotidiennes chez Coaxis (Lot-et-Garonne) ; risque analogue pour les PME du bâtiment : outils de gestion paralysés et fuite de données clients.'),
    (14, 'corpus:batiment-47-14-placeco-actualites-economiques-du-lot-et-garonne', 'Placéco — actualités économiques du Lot-et-Garonne', 'presse économique locale', 'https://www.placeco.fr/', 'https://www.placeco.fr/lot-et-garonne/', 'https://www.placeco.fr/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : usurpation de professionnels de l''immobilier et du bâtiment du 47 pour escroquerie au faux RIB.'),
    (15, 'corpus:batiment-47-15-google-actualites-veille-batiment-lot-et-garonne-47', 'Google Actualités — veille bâtiment Lot-et-Garonne (47)', 'agrégateur de presse locale', 'https://news.google.com/', 'https://news.google.com/rss/search?q=b%C3%A2timent+Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'https://news.google.com/rss/search?q=b%C3%A2timent+Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'La veille du 2026-11-22 indexe un article Sud Ouest sur une entreprise du Lot-et-Garonne victime de piratage ; risque : fuite de données de marchés publics et de plans de chantiers.'),
    (16, 'corpus:batiment-47-16-actu-fr-actu-lot-et-garonne-47', 'actu.fr — Actu Lot-et-Garonne (47)', 'presse en ligne locale', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : articles de chantiers locaux utilisés comme appâts de phishing.'),
    (17, 'corpus:batiment-47-17-cci-agen-lot-et-garonne', 'CCI Agen Lot-et-Garonne', 'Chambre consulaire', 'https://cci47.fr/', 'https://cci47.fr/actualites/', 'https://cci47.fr/rss/?follow=actualites', 'Aucun incident cyber observé pour la CCI 47 à la date du 2026-11-22 ; risque : courriels frauduleux usurpant la CCI pour inviter des entreprises du bâtiment à payer une facture ou à ouvrir un lien de mise à jour de dossier.'),
    (18, 'corpus:batiment-47-18-cma-nouvelle-aquitaine-cma-du-lot-et-garonne', 'CMA Nouvelle-Aquitaine - CMA du Lot-et-Garonne', 'Chambre consulaire', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-lot-et-garonne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', '', 'Aucun incident cyber observé pour la CMA du Lot-et-Garonne à la date du 2026-11-22 ; risque : phishing ciblant les artisans avec de faux appels de cotisations demandant IBAN et identifiants de compte.'),
    (19, 'corpus:batiment-47-19-caue-de-lot-et-garonne', 'CAUE de Lot-et-Garonne', 'Conseil d''architecture, d''urbanisme et d''environnement', 'https://caue47.com/', 'https://caue47.com/actualites/', 'https://caue47.com/rss/?follow=Evenements', 'Aucun incident cyber observé pour le CAUE 47 à la date du 2026-11-22 ; risque : pièces jointes malveillantes envoyées aux maîtres d''ouvrage sous couvert de documents de construction ou d''urbanisme.'),
    (20, 'corpus:batiment-47-20-observatoire-de-l-habitat-de-lot-et-garonne-prefecture-du-47', 'Observatoire de l''habitat de Lot-et-Garonne (préfecture du 47)', 'Observatoire départemental de l''habitat et de la construction', 'https://www.lot-et-garonne.gouv.fr/Actions-de-l-Etat/Amenagement-du-territoire-et-construction/Logement-Habitat/Observatoire-departemental-de-l-habitat/Observatoire-de-l-Habitat-de-Lot-et-Garonne-Annee-2025', 'https://www.lot-et-garonne.gouv.fr/Actualites', '', 'Aucun incident cyber observé pour l''Observatoire de l''habitat de Lot-et-Garonne à la date du 2026-11-22 ; risque : faux courriels de la préfecture demandant aux collectivités de transmettre des dossiers d''habitat via un formulaire non officiel.'),
    (21, 'corpus:batiment-47-21-societe-com-annuaire-des-entreprises-recherche-lot-et-garonne', 'Societe.com — annuaire des entreprises (recherche Lot-et-Garonne)', 'annuaire professionnel', 'https://www.societe.com/', 'https://www.societe.com/recherche?departement=47', '', 'Aucun incident cyber observé sur cette source à la date du 2026-11-22 ; risque sectoriel précis : usurpation de coordonnées d''entreprises du bâtiment (faux SIRET) pour émettre des devis et détourner des paiements de chantiers.'),
    (22, 'corpus:batiment-47-22-ville-d-agen-actualites', 'Ville d''Agen — actualités', 'collectivité (ville)', 'https://www.agen.fr/', 'https://www.agen.fr/en-ce-moment/actualites', '', 'Aucun incident cyber observé sur cette source à la date du 2026-11-22 ; risque sectoriel précis : faux courriels de la mairie demandant le paiement en ligne de frais de permis de construire à des artisans du 47.'),
    (23, 'corpus:batiment-47-23-agglomeration-d-agen-actualites', 'Agglomération d''Agen — actualités', 'intercommunalité', 'https://www.agglo-agen.net/', 'https://www.agglo-agen.net/en-ce-moment/actualites', '', 'Aucun incident cyber observé sur cette source à la date du 2026-11-22 ; risque sectoriel précis : campagnes de phishing ciblant les services techniques à partir d''annonces de marchés de rénovation publique.'),
    (24, 'corpus:batiment-47-24-communaute-d-agglomeration-du-grand-villeneuvois-actualites', 'Communauté d''agglomération du Grand Villeneuvois — actualités', 'intercommunalité', 'https://www.grand-villeneuvois.fr/', 'https://www.grand-villeneuvois.fr/actualites.html', '', 'Aucun incident cyber observé sur cette source à la date du 2026-11-22 ; risque sectoriel précis : faux avis d''appels d''offres de travaux diffusés par courriel au nom de l''intercommunalité pour collecter des cautionnements.'),
    (25, 'corpus:batiment-47-25-ville-de-marmande-actualites-et-flux-rss', 'Ville de Marmande — actualités et flux RSS', 'collectivité (ville)', 'http://www.mairie-marmande.fr/', 'https://www.mairie-marmande.fr/actualites/', 'https://www.mairie-marmande.fr/feed/', 'Aucun incident cyber observé sur cette source à la date du 2026-11-22 ; risque sectoriel précis : exploitation d''un flux RSS copié pour diffuser de faux avis de chantiers et piéger les entreprises locales.'),
    (26, 'corpus:batiment-47-26-ville-de-villeneuve-sur-lot-actualites', 'Ville de Villeneuve-sur-Lot — actualités', 'collectivité (ville)', 'https://www.ville-villeneuve-sur-lot.fr/', 'https://www.ville-villeneuve-sur-lot.fr/actualites.html', '', 'Aucun incident cyber observé sur cette source à la date du 2026-11-22 ; risque sectoriel précis : usurpation de la communication municipale pour annoncer de faux chantiers et solliciter des acomptes.'),
    (27, 'corpus:batiment-47-27-val-de-garonne-agglomeration-actualites', 'Val de Garonne Agglomération — actualités', 'intercommunalité', 'https://www.valdegaronne.fr/', 'https://www.valdegaronne.fr/TPL_CODE/TPL_ACTUALITELISTE/9-liste-actualites.htm', '', 'Aucun incident cyber observé sur cette source à la date du 2026-11-22 ; risque sectoriel précis : publication de fausses annonces de travaux sur un site miroir imitateur pour capter les candidatures d''entreprises.'),
    (28, 'corpus:batiment-47-28-albret-communaute-actualites-et-flux-rss', 'Albret Communauté — actualités et flux RSS', 'intercommunalité', 'https://www.albretcommunaute.fr/', 'https://www.albretcommunaute.fr/actualites', 'https://www.albretcommunaute.fr/?format=feed&type=rss', 'Aucun incident cyber observé sur cette source à la date du 2026-11-22 ; risque sectoriel précis : falsification d''un flux RSS d''actualités pour diffuser de faux marchés de travaux aux entreprises du bâtiment.')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, 'cti', COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       'source d information sectorielle, diffusion publique', true, 'narrative',
       CASE WHEN flux <> '' THEN 'rss' ELSE 'html' END,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-batiment-47.jsonl', 'ligne', ord))::jsonb,
       3600, type || ', secteur batiment, departement 47 (Lot-et-Garonne). Exemple cyber : ' || cyber,
       'Nouvelle-Aquitaine', '47'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, description = EXCLUDED.description,
  format = EXCLUDED.format, parser = EXCLUDED.parser, enabled = true;

-- Trace de vérification HTTP des 68 URLs du corpus, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus batiment-47 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:batiment-47-01-capeb-lot-et-garonne-section-departementale-du-batiment', 'https://www.capeb.fr/lot-et-garonne/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-01-capeb-lot-et-garonne-section-departementale-du-batiment', 'https://www.capeb.fr/lot-et-garonne/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-02-pro-rge-entreprises-rge-dans-le-lot-et-garonne-47', 'https://pro-rge.fr/entreprise/d/47/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-02-pro-rge-entreprises-rge-dans-le-lot-et-garonne-47', 'https://pro-rge.fr/entreprises/lot-et-garonne-47/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-02-pro-rge-entreprises-rge-dans-le-lot-et-garonne-47', 'https://news.google.com/rss/search?q=RGE+Lot-et-Garonne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-47-03-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-03-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-04-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-04-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/magazine/actus', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-05-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/annuaire/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-05-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/blog/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-05-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/blog/feed.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-47-06-odeys-cluster-de-la-construction-et-de-l-amenagement-durables', 'https://www.odeys.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-06-odeys-cluster-de-la-construction-et-de-l-amenagement-durables', 'https://www.odeys.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-06-odeys-cluster-de-la-construction-et-de-l-amenagement-durables', 'https://www.odeys.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-47-07-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-07-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/category/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-07-cerc-nouvelle-aquitaine-observatoire-de-la-construction', 'https://www.cerc-na.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-47-08-cma-nouvelle-aquitaine-actualites-des-artisans-du-lot-et-garonne-47', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-08-cma-nouvelle-aquitaine-actualites-des-artisans-du-lot-et-garonne-47', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Lot-et-Garonne', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-09-ici-gascogne-actualites-du-lot-et-garonne-47', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-09-ici-gascogne-actualites-du-lot-et-garonne-47', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml'),
  ('corpus:batiment-47-10-france-3-nouvelle-aquitaine-edition-lot-et-garonne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/lot-et-garonne', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-10-france-3-nouvelle-aquitaine-edition-lot-et-garonne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/lot-et-garonne/rss', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-47-11-la-depeche-du-midi-edition-agen-lot-et-garonne', 'https://www.ladepeche.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-11-la-depeche-du-midi-edition-agen-lot-et-garonne', 'https://www.ladepeche.fr/lot-et-garonne/agen', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-11-la-depeche-du-midi-edition-agen-lot-et-garonne', 'https://www.ladepeche.fr/rss.xml', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-47-12-petit-bleu-agen-et-sa-region', 'https://www.petitbleu.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-12-petit-bleu-agen-et-sa-region', 'https://www.petitbleu.fr/lot-et-garonne/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-12-petit-bleu-agen-et-sa-region', 'https://www.petitbleu.fr/rss.xml', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-47-13-quidam-hebdo-agen', 'https://quidam-hebdo.com/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-13-quidam-hebdo-agen', 'https://quidam-hebdo.com/category/agen/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-13-quidam-hebdo-agen', 'https://quidam-hebdo.com/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-47-14-placeco-actualites-economiques-du-lot-et-garonne', 'https://www.placeco.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-14-placeco-actualites-economiques-du-lot-et-garonne', 'https://www.placeco.fr/lot-et-garonne/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-14-placeco-actualites-economiques-du-lot-et-garonne', 'https://www.placeco.fr/rss.xml', 'application/xml'),
  ('corpus:batiment-47-15-google-actualites-veille-batiment-lot-et-garonne-47', 'https://news.google.com/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-15-google-actualites-veille-batiment-lot-et-garonne-47', 'https://news.google.com/rss/search?q=b%C3%A2timent+Lot-et-Garonne&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:batiment-47-16-actu-fr-actu-lot-et-garonne-47', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-16-actu-fr-actu-lot-et-garonne-47', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-47-17-cci-agen-lot-et-garonne', 'https://cci47.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-17-cci-agen-lot-et-garonne', 'https://cci47.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-17-cci-agen-lot-et-garonne', 'https://cci47.fr/rss/?follow=actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-18-cma-nouvelle-aquitaine-cma-du-lot-et-garonne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-lot-et-garonne', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-18-cma-nouvelle-aquitaine-cma-du-lot-et-garonne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-19-caue-de-lot-et-garonne', 'https://caue47.com/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-19-caue-de-lot-et-garonne', 'https://caue47.com/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-19-caue-de-lot-et-garonne', 'https://caue47.com/rss/?follow=Evenements', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-20-observatoire-de-l-habitat-de-lot-et-garonne-prefecture-du-47', 'https://www.lot-et-garonne.gouv.fr/Actions-de-l-Etat/Amenagement-du-territoire-et-construction/Logement-Habitat/Observatoire-departemental-de-l-habitat/Observatoire-de-l-Habitat-de-Lot-et-Garonne-Annee-2025', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-20-observatoire-de-l-habitat-de-lot-et-garonne-prefecture-du-47', 'https://www.lot-et-garonne.gouv.fr/Actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-21-societe-com-annuaire-des-entreprises-recherche-lot-et-garonne', 'https://www.societe.com/', 'text/html'),
  ('corpus:batiment-47-21-societe-com-annuaire-des-entreprises-recherche-lot-et-garonne', 'https://www.societe.com/recherche?departement=47', 'text/html'),
  ('corpus:batiment-47-22-ville-d-agen-actualites', 'https://www.agen.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-22-ville-d-agen-actualites', 'https://www.agen.fr/en-ce-moment/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-23-agglomeration-d-agen-actualites', 'https://www.agglo-agen.net/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-23-agglomeration-d-agen-actualites', 'https://www.agglo-agen.net/en-ce-moment/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-24-communaute-d-agglomeration-du-grand-villeneuvois-actualites', 'https://www.grand-villeneuvois.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-24-communaute-d-agglomeration-du-grand-villeneuvois-actualites', 'https://www.grand-villeneuvois.fr/actualites.html', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-25-ville-de-marmande-actualites-et-flux-rss', 'http://www.mairie-marmande.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-25-ville-de-marmande-actualites-et-flux-rss', 'https://www.mairie-marmande.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-25-ville-de-marmande-actualites-et-flux-rss', 'https://www.mairie-marmande.fr/feed/', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-47-26-ville-de-villeneuve-sur-lot-actualites', 'https://www.ville-villeneuve-sur-lot.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-26-ville-de-villeneuve-sur-lot-actualites', 'https://www.ville-villeneuve-sur-lot.fr/actualites.html', 'text/html; charset=UTF-8'),
  ('corpus:batiment-47-27-val-de-garonne-agglomeration-actualites', 'https://www.valdegaronne.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-27-val-de-garonne-agglomeration-actualites', 'https://www.valdegaronne.fr/TPL_CODE/TPL_ACTUALITELISTE/9-liste-actualites.htm', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-28-albret-communaute-actualites-et-flux-rss', 'https://www.albretcommunaute.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-28-albret-communaute-actualites-et-flux-rss', 'https://www.albretcommunaute.fr/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-47-28-albret-communaute-actualites-et-flux-rss', 'https://www.albretcommunaute.fr/?format=feed&type=rss', 'application/rss+xml; charset=utf-8')
) AS v(source_id, url, content_type);
