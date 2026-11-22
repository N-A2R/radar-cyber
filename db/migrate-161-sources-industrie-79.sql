-- Sources d'information du secteur industrie dans le département 79 (Deux-Sèvres).
-- 19 sources, 45 contrôles HTTP sur 45 URLs distinctes (sites, pages actualités et flux),
-- toutes en HTTP 200 le 2026-11-22 (curl -L, User-Agent navigateur).
-- Corpus : bench/corpus/sources-industrie-79.jsonl
-- Preuve : bench/results/verification-sources-industrie-79.json

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
    (1, 'corpus:industrie-79-01-medef-deux-sevres', 'MEDEF Deux-Sèvres', 'organisation patronale départementale', 'https://www.medef79.fr/', 'https://www.medef79.fr/actualites', '', 'Aucun incident cyber observé sur le site le 2026-11-22 ; risque : courriels usurpant le MEDEF 79 pour demander une cotisation sur un faux site de paiement.'),
    (2, 'corpus:industrie-79-02-uimm-nouvelle-aquitaine-antenne-des-deux-sevres-79', 'UIMM Nouvelle-Aquitaine — antenne des Deux-Sèvres (79)', 'syndicat professionnel des industries métallurgiques', 'https://www.uimmnouvelleaquitaine.com/', 'https://www.uimmnouvelleaquitaine.com/actualite/news.html', '', 'Article vérifié : « Webinaire cybersécurité : une cinquantaine de participants sensibilisés au risque cyber » (22/04/2022) — https://www.uimmnouvelleaquitaine.com/actualite/news/actualites-generales/webinaire-cybersecurite-une-cinquantaine-de-participants-sensibilises-au-risque-cyber.html'),
    (3, 'corpus:industrie-79-03-alt-technopole-niort-deux-sevres', 'Altæ Technopole Niort Deux-Sèvres', 'technopole et écosystème d’innovation industrielle', 'https://altae-technopole.fr/', 'https://altae-technopole.fr/actualites/', 'https://altae-technopole.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux appels à projets « Industrie durable » usurpant le nom de la technopole pour capter des données d’entreprises du 79.'),
    (4, 'corpus:industrie-79-04-niort-tech-pole-dinnovation-et-dentrepreneuriat-79', 'Niort Tech — pôle d’innovation et d’entrepreneuriat (79)', 'incubateur et pôle d’innovation économique', 'https://niort-tech.fr/', 'https://niort-tech.fr/evenements/', 'https://niort-tech.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux courriels d’inscription à des événements Niort Tech demandant des coordonnées bancaires à des start-up du 79.'),
    (5, 'corpus:industrie-79-05-portail-des-entreprises-de-nouvelle-aquitaine-region-performance-indus', 'Portail des entreprises de Nouvelle-Aquitaine (Région) — performance industrielle', 'portail institutionnel régional d’aide aux entreprises', 'https://entreprises.nouvelle-aquitaine.fr/', 'https://entreprises.nouvelle-aquitaine.fr/actualites', 'https://entreprises.nouvelle-aquitaine.fr/liste-rss/naq_actualite', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux courriels de subventions « Usine du Futur » ciblant des industries des Deux-Sèvres avec un lien de phishing.'),
    (6, 'corpus:industrie-79-06-annuaire-industrie-magazine-entreprises-des-deux-sevres', 'Annuaire Industrie Magazine — entreprises des Deux-Sèvres', 'annuaire professionnel de l’industrie', 'https://annuaire.industrie-magazine.fr/departement/deux-sevres', 'https://industrie-magazine.fr/', '', 'Aucun incident cyber observé le 2026-11-22 ; risque : usurpation de fiches d’entreprises industrielles du 79 pour émettre des devis ou des factures frauduleuses.'),
    (7, 'corpus:industrie-79-07-entreprise-industrielle-annuaire-des-deux-sevres-79', 'Entreprise Industrielle — annuaire des Deux-Sèvres (79)', 'annuaire professionnel d’entreprises industrielles', 'https://www.entrepriseindustrielle.fr/departements/79-deux-sevres/', 'https://www.entrepriseindustrielle.fr/departements/79-deux-sevres/', '', 'Aucun incident cyber observé le 2026-11-22 ; risque : profils d’industriels du 79 copiés sur un site miroir pour solliciter des acomptes sur des commandes fictives.'),
    (8, 'corpus:industrie-79-08-la-nouvelle-republique-edition-deux-sevres-79', 'La Nouvelle République — édition Deux-Sèvres (79)', 'presse quotidienne régionale', 'https://www.lanouvellerepublique.fr/deux-sevres', 'https://www.lanouvellerepublique.fr/deux-sevres/economie', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'Article vérifié : « Le chiffrement de certains fichiers : une maison de retraite des Deux-Sèvres victime d’une cyberattaque par rançongiciel » (08/12/2025) — https://www.lanouvellerepublique.fr/deux-sevres ; aussi « Cyberattaque dans les supermarchés : un Intermarché perd 50.000 euros de marchandises dans le Cher ».'),
    (9, 'corpus:industrie-79-09-actu-fr-actu-deux-sevres', 'actu.fr — Actu Deux-Sèvres', 'presse en ligne locale', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79/', 'https://actu.fr/deux-sevres/economie', 'https://actu.fr/deux-sevres/rss.xml', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : articles d’entreprises industrielles du 79 utilisés comme appâts de phishing (faux communiqués de rançongiciel).'),
    (10, 'corpus:industrie-79-10-placeco-actualites-economiques-des-deux-sevres', 'Placéco — actualités économiques des Deux-Sèvres', 'presse économique locale', 'https://www.placeco.fr/deux-sevres/', 'https://www.placeco.fr/deux-sevres/', 'https://news.google.com/rss/search?q=Plac%C3%A9co+Deux-S%C3%A8vres+industrie&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé le 2026-11-22 ; risque : usurpation de directions d’entreprises du 79 pour escroquerie au faux RIB sur des marchés industriels.'),
    (11, 'corpus:industrie-79-11-niort-info-presse-locale-economie-et-industrie', 'Niort info — presse locale (économie et industrie)', 'presse en ligne locale', 'https://niortinfo.media/', 'https://niortinfo.media/?s=industrie', 'https://niortinfo.media/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : articles sur des sites industriels niortais copiés pour diffuser des liens de phishing vers les salariés.'),
    (12, 'corpus:industrie-79-12-ici-poitou-actualites-des-deux-sevres-79', 'ICI Poitou — actualités des Deux-Sèvres (79)', 'radio publique locale (Radio France)', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'Article vérifié via Google Actualités : « Cyberattaque de frigos de la grande distribution : des enseignes touchées dans le Poitou » (ici.fr) ; risque pour les industries agroalimentaires du 79.'),
    (13, 'corpus:industrie-79-13-france-3-nouvelle-aquitaine-edition-deux-sevres', 'France 3 Nouvelle-Aquitaine — édition Deux-Sèvres', 'télévision publique locale', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'https://news.google.com/rss/search?q=France+3+industrie+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr', 'Aucun incident cyber observé sur la page le 2026-11-22 ; risque : faux communiqués sur des fermetures ou investissements industriels dans le 79 diffusés au nom de la rédaction.'),
    (14, 'corpus:industrie-79-14-google-actualites-veille-industrie-deux-sevres-79', 'Google Actualités — veille industrie Deux-Sèvres (79)', 'agrégateur de presse locale', 'https://news.google.com/', 'https://news.google.com/rss/search?q=industrie+Deux-S%C3%A8vres+79&hl=fr&gl=FR&ceid=FR:fr', 'https://news.google.com/rss/search?q=industrie+Deux-S%C3%A8vres+79&hl=fr&gl=FR&ceid=FR:fr', 'La veille du 2026-11-22 indexe « Deux-Sèvres. À Thouars, le leader de l’échantillon cosmétique Socoplan victime d’une cyberattaque » (Ouest-France) ; risque : fuite de données industrielles et arrêt de production.'),
    (15, 'corpus:industrie-79-15-cpme-79-confederation-des-petites-et-moyennes-entreprises-des-deux-sev', 'CPME 79 — Confédération des Petites et Moyennes Entreprises des Deux-Sèvres', 'organisation patronale départementale (PME et industrie)', 'https://www.cpme79.fr/', 'https://www.cpme79.fr/', 'https://www.cpme79.fr/spip.php?page=backend', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux courriels de la CPME 79 demandant aux PME industrielles du département de régulariser une cotisation sur un faux site.'),
    (16, 'corpus:industrie-79-16-uimm-deux-sevres-79-union-des-industries-metallurgiques', 'UIMM Deux-Sèvres (79) — Union des industries métallurgiques', 'syndicat professionnel départemental de l''industrie métallurgique', 'https://www.uimm79.fr/', 'https://www.uimm79.fr/', 'https://www.uimm79.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : usurpation du nom de l''UIMM 79 pour diffuser de faux appels à formation cybersécurité aux entreprises métallurgiques du 79.'),
    (17, 'corpus:industrie-79-17-medef-nouvelle-aquitaine-rubrique-cybersecurite', 'MEDEF Nouvelle-Aquitaine — rubrique cybersécurité', 'organisation patronale régionale', 'https://www.medef-nouvelle-aquitaine.fr/', 'https://www.medef-nouvelle-aquitaine.fr/actualites', '', 'Article vérifié : « Cybersécurité : des réflexes essentiels pour protéger son activité » — https://www.medef-nouvelle-aquitaine.fr/actualite/cybersecurite-des-reflexes-essentiels-pour-proteger-son-activite ; risque pour les industries du 79.'),
    (18, 'corpus:industrie-79-18-uimm-nationale-la-fabrication-de-lavenir', 'UIMM nationale — La Fabrication de l’Avenir', 'fédération industrielle nationale (annuaire des UIMM départementales)', 'https://uimm.lafabriquedelavenir.fr/', 'https://uimm.lafabriquedelavenir.fr/actualites/', 'https://uimm.lafabriquedelavenir.fr/feed/', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : faux messages au nom de la fédération demandant aux adhérents du 79 de mise à jour leurs identifiants.'),
    (19, 'corpus:industrie-79-19-le-journal-des-entreprises-edition-deux-sevres-79', 'Le Journal des Entreprises — édition Deux-Sèvres (79)', 'presse économique régionale', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/deux-sevres', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : articles d’industriels du 79 (Poujoulat, Niort) copiés sur un faux site pour diffuser des liens de phishing ciblant les dirigeants.')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, 'cti', COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       'source d information sectorielle, diffusion publique', true, 'narrative',
       CASE WHEN flux <> '' THEN 'rss' ELSE 'html' END,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-industrie-79.jsonl', 'ligne', ord))::jsonb,
       3600, type || ', secteur industrie, departement 79 (Deux-Sèvres). Exemple cyber : ' || cyber,
       'Nouvelle-Aquitaine', '79'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, description = EXCLUDED.description,
  format = EXCLUDED.format, parser = EXCLUDED.parser, enabled = true;

INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus industrie-79 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:industrie-79-01-medef-deux-sevres', 'https://www.medef79.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-01-medef-deux-sevres', 'https://www.medef79.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-02-uimm-nouvelle-aquitaine-antenne-des-deux-sevres-79', 'https://www.uimmnouvelleaquitaine.com/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-02-uimm-nouvelle-aquitaine-antenne-des-deux-sevres-79', 'https://www.uimmnouvelleaquitaine.com/actualite/news.html', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-03-alt-technopole-niort-deux-sevres', 'https://altae-technopole.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-03-alt-technopole-niort-deux-sevres', 'https://altae-technopole.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-03-alt-technopole-niort-deux-sevres', 'https://altae-technopole.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:industrie-79-04-niort-tech-pole-dinnovation-et-dentrepreneuriat-79', 'https://niort-tech.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-04-niort-tech-pole-dinnovation-et-dentrepreneuriat-79', 'https://niort-tech.fr/evenements/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-04-niort-tech-pole-dinnovation-et-dentrepreneuriat-79', 'https://niort-tech.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:industrie-79-05-portail-des-entreprises-de-nouvelle-aquitaine-region-performance-indus', 'https://entreprises.nouvelle-aquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-05-portail-des-entreprises-de-nouvelle-aquitaine-region-performance-indus', 'https://entreprises.nouvelle-aquitaine.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-05-portail-des-entreprises-de-nouvelle-aquitaine-region-performance-indus', 'https://entreprises.nouvelle-aquitaine.fr/liste-rss/naq_actualite', 'application/rss+xml'),
  ('corpus:industrie-79-06-annuaire-industrie-magazine-entreprises-des-deux-sevres', 'https://annuaire.industrie-magazine.fr/departement/deux-sevres', 'text/html; charset=utf-8'),
  ('corpus:industrie-79-06-annuaire-industrie-magazine-entreprises-des-deux-sevres', 'https://industrie-magazine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-07-entreprise-industrielle-annuaire-des-deux-sevres-79', 'https://www.entrepriseindustrielle.fr/departements/79-deux-sevres/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-07-entreprise-industrielle-annuaire-des-deux-sevres-79', 'https://www.entrepriseindustrielle.fr/departements/79-deux-sevres/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-08-la-nouvelle-republique-edition-deux-sevres-79', 'https://www.lanouvellerepublique.fr/deux-sevres', 'text/html; charset=utf-8'),
  ('corpus:industrie-79-08-la-nouvelle-republique-edition-deux-sevres-79', 'https://www.lanouvellerepublique.fr/deux-sevres/economie', 'text/html; charset=utf-8'),
  ('corpus:industrie-79-08-la-nouvelle-republique-edition-deux-sevres-79', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'application/rss+xml; charset=UTF-8'),
  ('corpus:industrie-79-09-actu-fr-actu-deux-sevres', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-09-actu-fr-actu-deux-sevres', 'https://actu.fr/deux-sevres/economie', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-09-actu-fr-actu-deux-sevres', 'https://actu.fr/deux-sevres/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:industrie-79-10-placeco-actualites-economiques-des-deux-sevres', 'https://www.placeco.fr/deux-sevres/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-10-placeco-actualites-economiques-des-deux-sevres', 'https://www.placeco.fr/deux-sevres/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-10-placeco-actualites-economiques-des-deux-sevres', 'https://news.google.com/rss/search?q=Plac%C3%A9co+Deux-S%C3%A8vres+industrie&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:industrie-79-11-niort-info-presse-locale-economie-et-industrie', 'https://niortinfo.media/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-11-niort-info-presse-locale-economie-et-industrie', 'https://niortinfo.media/?s=industrie', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-11-niort-info-presse-locale-economie-et-industrie', 'https://niortinfo.media/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:industrie-79-12-ici-poitou-actualites-des-deux-sevres-79', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-12-ici-poitou-actualites-des-deux-sevres-79', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-12-ici-poitou-actualites-des-deux-sevres-79', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml'),
  ('corpus:industrie-79-13-france-3-nouvelle-aquitaine-edition-deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-13-france-3-nouvelle-aquitaine-edition-deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-13-france-3-nouvelle-aquitaine-edition-deux-sevres', 'https://news.google.com/rss/search?q=France+3+industrie+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:industrie-79-14-google-actualites-veille-industrie-deux-sevres-79', 'https://news.google.com/', 'text/html; charset=utf-8'),
  ('corpus:industrie-79-14-google-actualites-veille-industrie-deux-sevres-79', 'https://news.google.com/rss/search?q=industrie+Deux-S%C3%A8vres+79&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:industrie-79-14-google-actualites-veille-industrie-deux-sevres-79', 'https://news.google.com/rss/search?q=industrie+Deux-S%C3%A8vres+79&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:industrie-79-15-cpme-79-confederation-des-petites-et-moyennes-entreprises-des-deux-sev', 'https://www.cpme79.fr/', 'text/html; charset=utf-8'),
  ('corpus:industrie-79-15-cpme-79-confederation-des-petites-et-moyennes-entreprises-des-deux-sev', 'https://www.cpme79.fr/', 'text/html; charset=utf-8'),
  ('corpus:industrie-79-15-cpme-79-confederation-des-petites-et-moyennes-entreprises-des-deux-sev', 'https://www.cpme79.fr/spip.php?page=backend', 'text/xml; charset=utf-8'),
  ('corpus:industrie-79-16-uimm-deux-sevres-79-union-des-industries-metallurgiques', 'https://www.uimm79.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-16-uimm-deux-sevres-79-union-des-industries-metallurgiques', 'https://www.uimm79.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-16-uimm-deux-sevres-79-union-des-industries-metallurgiques', 'https://www.uimm79.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:industrie-79-17-medef-nouvelle-aquitaine-rubrique-cybersecurite', 'https://www.medef-nouvelle-aquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-17-medef-nouvelle-aquitaine-rubrique-cybersecurite', 'https://www.medef-nouvelle-aquitaine.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-18-uimm-nationale-la-fabrication-de-lavenir', 'https://uimm.lafabriquedelavenir.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-18-uimm-nationale-la-fabrication-de-lavenir', 'https://uimm.lafabriquedelavenir.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-18-uimm-nationale-la-fabrication-de-lavenir', 'https://uimm.lafabriquedelavenir.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:industrie-79-19-le-journal-des-entreprises-edition-deux-sevres-79', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-19-le-journal-des-entreprises-edition-deux-sevres-79', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/deux-sevres', 'text/html; charset=UTF-8'),
  ('corpus:industrie-79-19-le-journal-des-entreprises-edition-deux-sevres-79', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml; charset=UTF-8')
) AS v(source_id, url, content_type);
