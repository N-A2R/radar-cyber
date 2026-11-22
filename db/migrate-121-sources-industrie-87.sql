-- Sources d'information du secteur industrie dans le département 87 (Haute-Vienne).
-- 13 sources, 30 contrôles HTTP sur 30 URLs distinctes (sites, pages actualités et flux),
-- toutes en HTTP 200 le 2026-11-22 (GET, User-Agent navigateur, redirections suivies).
-- Corpus : bench/corpus/sources-industrie-87.jsonl
-- Preuve : bench/results/verification-sources-industrie-87.json

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
    (1, 'corpus:industrie-87-01-cpme-87', 'CPME 87', 'organisation patronale départementale (PME, commerce, services et industrie)', 'https://www.cpme87.fr/', 'https://www.cpme87.fr/actualites/', '', 'Aucun incident cyber observé sur les actualités le 2026-11-22 ; risque : courriels usurpant la CPME 87 pour demander une cotisation sur un faux site de paiement.'),
    (2, 'corpus:industrie-87-02-medef-limousin', 'MEDEF Limousin (territorial 87)', 'organisation patronale régionale couvrant la Haute-Vienne', 'https://limousin.territoriaux.medef.com/', 'https://limousin.territoriaux.medef.com/fr/actualites', '', 'Aucun incident cyber observé sur les actualités le 2026-11-22 ; risque : invitation falsifiée à un événement MEDEF Limousin captant les coordonnées de dirigeants industriels du 87.'),
    (3, 'corpus:industrie-87-03-pole-formation-uimm-limousin', 'Pôle Formation UIMM Limousin', 'centre de formation des industries métallurgiques et mécaniques', 'https://www.formations-industrieslimousin.fr/', 'https://www.formations-industrieslimousin.fr/actualites/', 'https://www.formations-industrieslimousin.fr/feed/', 'Aucun incident cyber observé dans le flux RSS le 2026-11-22 ; risque : faux courriels d’inscription à une formation UIMM avec pièce jointe malveillante.'),
    (4, 'corpus:industrie-87-04-uimm-nouvelle-aquitaine', 'UIMM Nouvelle-Aquitaine', 'syndicat professionnel des industries métallurgiques', 'https://www.uimmnouvelleaquitaine.com/', 'https://www.uimmnouvelleaquitaine.com/actualite/news.html', '', 'Aucun incident cyber observé sur la page d’actualités le 2026-11-22 ; risque : usurpation du logo UIMM pour diffuser un faux webinaire cybersécurité aux entreprises du 87.'),
    (5, 'corpus:industrie-87-05-cma-haute-vienne', 'CMA Limoges — Chambre des Métiers et de l’Artisanat de la Haute-Vienne', 'chambre consulaire des métiers et de l’artisanat industriel', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/', '', 'Aucun incident cyber observé sur les actualités le 2026-11-22 ; risque : fausse facture CMA Limoges adressée aux artisans industriels de la Haute-Vienne.'),
    (6, 'corpus:industrie-87-06-limoges-metropole-industrie', 'Limoges Métropole — filière industrie', 'collectivité territoriale : filière industrie et parc technologique', 'https://www.limoges-metropole.fr/entreprises/filieres/autres-filieres/industrie', 'https://www.limoges-metropole.fr/informations-transversales/actualites', 'https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'Aucun incident cyber observé dans le flux RSS le 2026-11-22 ; risque : faux appel à projets industriels usurpant le nom de Limoges Métropole pour collecter des données d’entreprises.'),
    (7, 'corpus:industrie-87-07-le-populaire-du-centre', 'Le Populaire du Centre — Haute-Vienne', 'presse quotidienne régionale (87)', 'https://www.lepopulaire.fr/', 'https://www.lepopulaire.fr/haute-vienne/', '', 'Aucun incident cyber observé sur la page Haute-Vienne le 2026-11-22 ; risque : faux lien d’article sur une cyberattaque locale conduisant à un site de hameçonnage.'),
    (8, 'corpus:industrie-87-08-france3-haute-vienne', 'franceinfo : France 3 Haute-Vienne', 'média public régional (87)', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss', 'Article vérifié : « Cyberattaque : le service d’identification des bovins et ovins touché, le travail des éleveurs limousins perturbé » (31/12/2024) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/le-service-d-identification-des-bovins-et-ovins-victime-d-une-cyberattaque-le-travail-des-eleveurs-limousins-perturbe-3084484.html'),
    (9, 'corpus:industrie-87-09-7-a-limoges', '7 à Limoges — actualité et économie', 'télévision locale (Limoges et Haute-Vienne)', 'https://www.7alimoges.tv/', 'https://www.7alimoges.tv/Actualite_r16.html', 'https://www.7alimoges.tv/xml/syndication.rss', 'Aucun incident cyber observé dans le flux RSS le 2026-11-22 ; risque : fausse alerte d’info locale invitant à télécharger une application infectée.'),
    (10, 'corpus:industrie-87-10-societe-tech-haute-vienne', 'Societe.Tech — actualité des entreprises de Haute-Vienne', 'presse économique et technologique locale (87)', 'https://www.societe.tech/', 'https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-haute-vienne/', '', 'Aucun incident cyber observé sur la page Haute-Vienne le 2026-11-22 ; risque : faux communiqué de cyberattaque chez un industriel du 87 pour capter des données d’entreprises.'),
    (11, 'corpus:industrie-87-11-journal-des-entreprises-na', 'Le Journal des Entreprises — Nouvelle-Aquitaine / Haute-Vienne', 'presse économique régionale', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/haute-vienne', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'Aucun incident cyber observé dans le flux RSS le 2026-11-22 ; risque : faux courriel de rédaction proposant un dossier « industrie 87 » avec pièce jointe malveillante.'),
    (12, 'corpus:industrie-87-12-entreprises-nouvelle-aquitaine', 'Portail des entreprises de Nouvelle-Aquitaine', 'portail institutionnel régional d’aide aux entreprises', 'https://entreprises.nouvelle-aquitaine.fr/', 'https://entreprises.nouvelle-aquitaine.fr/actualites', '', 'Aucun incident cyber observé sur les actualités le 2026-11-22 ; risque : faux portail de demande d’aide régionale reprenant l’identité du site pour demander un RIB.'),
    (13, 'corpus:industrie-87-13-medef-nouvelle-aquitaine', 'MEDEF Nouvelle-Aquitaine', 'organisation patronale régionale couvrant la Haute-Vienne', 'https://www.medef-nouvelle-aquitaine.fr/', 'https://www.medef-nouvelle-aquitaine.fr/actualites', '', 'Aucun incident cyber observé sur les actualités le 2026-11-22 ; risque : courriel d’hameçonnage imitant le MEDEF Nouvelle-Aquitaine et ses adhérents industriels.')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, 'cti', COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       'source d information sectorielle, diffusion publique', true, 'narrative',
       CASE WHEN flux <> '' THEN 'rss' ELSE 'html' END,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-industrie-87.jsonl', 'ligne', ord))::jsonb,
       3600, type || ', secteur industrie, departement 87 (Haute-Vienne). Exemple cyber : ' || cyber,
       'Nouvelle-Aquitaine', '87'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, description = EXCLUDED.description,
  format = EXCLUDED.format, parser = EXCLUDED.parser, enabled = true;

INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus industrie-87 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:industrie-87-01-cpme-87', 'https://www.cpme87.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-01-cpme-87', 'https://www.cpme87.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-02-medef-limousin', 'https://limousin.territoriaux.medef.com/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-02-medef-limousin', 'https://limousin.territoriaux.medef.com/fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-03-pole-formation-uimm-limousin', 'https://www.formations-industrieslimousin.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-03-pole-formation-uimm-limousin', 'https://www.formations-industrieslimousin.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-03-pole-formation-uimm-limousin', 'https://www.formations-industrieslimousin.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:industrie-87-04-uimm-nouvelle-aquitaine', 'https://www.uimmnouvelleaquitaine.com/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-04-uimm-nouvelle-aquitaine', 'https://www.uimmnouvelleaquitaine.com/actualite/news.html', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-05-cma-haute-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-05-cma-haute-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-06-limoges-metropole-industrie', 'https://www.limoges-metropole.fr/entreprises/filieres/autres-filieres/industrie', 'text/html; charset=utf-8'),
  ('corpus:industrie-87-06-limoges-metropole-industrie', 'https://www.limoges-metropole.fr/informations-transversales/actualites', 'text/html; charset=utf-8'),
  ('corpus:industrie-87-06-limoges-metropole-industrie', 'https://www.limoges-metropole.fr/informations-transversales/actualites/rss', 'text/xml;charset=utf-8'),
  ('corpus:industrie-87-07-le-populaire-du-centre', 'https://www.lepopulaire.fr/', 'text/html; charset=utf-8'),
  ('corpus:industrie-87-07-le-populaire-du-centre', 'https://www.lepopulaire.fr/haute-vienne/', 'text/html; charset=utf-8'),
  ('corpus:industrie-87-08-france3-haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-08-france3-haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss', 'text/xml; charset=UTF-8'),
  ('corpus:industrie-87-09-7-a-limoges', 'https://www.7alimoges.tv/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-09-7-a-limoges', 'https://www.7alimoges.tv/Actualite_r16.html', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-09-7-a-limoges', 'https://www.7alimoges.tv/xml/syndication.rss', 'text/xml; charset=UTF-8'),
  ('corpus:industrie-87-10-societe-tech-haute-vienne', 'https://www.societe.tech/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-10-societe-tech-haute-vienne', 'https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-haute-vienne/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-11-journal-des-entreprises-na', 'https://www.lejournaldesentreprises.com/nouvelle-aquitaine', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-11-journal-des-entreprises-na', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/haute-vienne', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-11-journal-des-entreprises-na', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml; charset=UTF-8'),
  ('corpus:industrie-87-12-entreprises-nouvelle-aquitaine', 'https://entreprises.nouvelle-aquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-12-entreprises-nouvelle-aquitaine', 'https://entreprises.nouvelle-aquitaine.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-13-medef-nouvelle-aquitaine', 'https://www.medef-nouvelle-aquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:industrie-87-13-medef-nouvelle-aquitaine', 'https://www.medef-nouvelle-aquitaine.fr/actualites', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type);
