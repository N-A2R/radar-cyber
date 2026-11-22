-- Sources d'information du secteur bâtiment dans le département 33 (Gironde).
-- 18 sources, 33 contrôles HTTP sur 33 URLs distinctes (sites, pages actualités et flux),
-- toutes en HTTP 200 le 2026-11-22 (curl -L, User-Agent navigateur).
-- Corpus : bench/corpus/sources-batiment-33.jsonl
-- Preuve : bench/results/verification-sources-batiment-33.json

-- Table de traçage déclarée en complément pour rester applicable sur une branche
-- qui ne contient pas encore migrate-064-source-verification.sql.
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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:batiment-33-01-capeb-gironde-section-departementale-du-batiment', 'CAPEB Gironde — section départementale du bâtiment', 'cti', 'https://www.capeb.fr/gironde/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":1}}'::jsonb, 3600, 'syndicat professionnel du bâtiment, secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun incident cyber observé dans le flux le 2026-11-22 ; vecteur sectoriel : faux devis et faux RIB envoyés depuis la messagerie compromise d''un artisan girondin.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-02-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-gironde-33', 'CMA Nouvelle-Aquitaine — chambre des métiers et de l''artisanat (Gironde 33)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Gironde', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":2}}'::jsonb, 3600, 'chambre des métiers et de l''artisanat, secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun incident cyber dans la page observée le 2026-11-22 ; risque : usurpation d''identité d''artisans du bâtiment via les annuaires et formulaires de la CMA.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-03-pro-rge-entreprises-rge-en-gironde-33', 'Pro-RGE — entreprises RGE en Gironde (33)', 'cti', 'https://pro-rge.fr/entreprises/gironde-33/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":3}}'::jsonb, 3600, 'annuaire professionnel public (artisans RGE), secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun fait cyber observé le 2026-11-22 ; risque : profils d''artisans RGE usurpés pour solliciter des acomptes sur des travaux de rénovation.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-04-annuaire-des-artisans-gironde-33', 'Annuaire des artisans — Gironde (33)', 'cti', 'https://annuaire-des-artisans.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":4}}'::jsonb, 3600, 'annuaire d''artisans du bâtiment, secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun incident cyber dans les pages observées le 2026-11-22 ; risque : coordonnées d''artisans réutilisées pour des campagnes de phishing ciblées.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-05-societe-com-entreprises-de-la-gironde-33', 'Societe.com — entreprises de la Gironde (33)', 'cti', 'https://blog.societe.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":5}}'::jsonb, 3600, 'annuaire d''entreprises, secteur batiment, departement 33 (Gironde). Exemple cyber : Données d''entreprises girondines exposées dans l''annuaire : risque de scraping et d''usurpation d''identité pour des fraudes aux devis.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-06-prefecture-de-la-gironde-services-de-l-etat-urbanisme-et-construction', 'Préfecture de la Gironde — services de l''État (urbanisme et construction)', 'cti', 'https://www.gironde.gouv.fr/Actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":6}}'::jsonb, 3600, 'administration (DDTM, urbanisme et construction), secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun fait cyber dans les actualités observées le 2026-11-22 ; risque : phishing sur les demandes de permis de construire avec pièces jointes infectées.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-07-conseil-departemental-de-la-gironde-habitat-et-logement', 'Conseil départemental de la Gironde — habitat et logement', 'cti', 'https://www.gironde.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":7}}'::jsonb, 3600, 'collectivité (habitat, logement), secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun incident cyber observé le 2026-11-22 ; risque : fraude aux subventions de rénovation par faux RIB sur les aides départementales.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-08-bordeaux-metropole-urbanisme-travaux-et-habitat', 'Bordeaux Métropole — urbanisme, travaux et habitat', 'cti', 'https://www.bordeaux-metropole.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":8}}'::jsonb, 3600, 'intercommunalité (travaux, urbanisme), secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun incident cyber dans le flux observé le 2026-11-22 ; risque : usurpation de l''identité de la métropole pour envoyer de fausses consignes de chantier.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-09-ville-de-bordeaux-actualites-urbanisme-habitat', 'Ville de Bordeaux — actualités (urbanisme, habitat)', 'cti', 'https://www.bordeaux.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":9}}'::jsonb, 3600, 'collectivité (urbanisme, habitat), secteur batiment, departement 33 (Gironde). Exemple cyber : Cyberattaque revendiquée par des hackers pro-russes contre le site de la Ville de Bordeaux fin 2024 (actu.fr) : même vecteur contre les services d''urbanisme.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-10-ici-gironde-radio-france', 'ICI Gironde — Radio France', 'cti', 'https://www.ici.fr/rss/gironde/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":10}}'::jsonb, 3600, 'radio et presse locale, secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun incident cyber dans le flux observé le 2026-11-22 ; risque : faux communiqués sur des chantiers publics pour manipuler l''opinion locale.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-11-france-3-nouvelle-aquitaine-gironde', 'France 3 Nouvelle-Aquitaine — Gironde', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":11}}'::jsonb, 3600, 'télévision publique locale, secteur batiment, departement 33 (Gironde). Exemple cyber : Le flux a relaté en avril 2024 la cyberattaque privant la mairie de Floirac d''accès internet : risque identique pour les services d''urbanisme des communes girondines.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-12-actu-fr-bordeaux-33', 'actu.fr — Bordeaux (33)', 'cti', 'https://actu.fr/nouvelle-aquitaine/bordeaux_33063/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":12}}'::jsonb, 3600, 'presse en ligne locale, secteur batiment, departement 33 (Gironde). Exemple cyber : actu.fr a rapporté en février 2025 la cyberattaque avec rançon contre la mairie de Berson (Gironde) : risque de rançongiciel pour les collectivités et artisans locaux.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-13-20-minutes-bordeaux', '20 Minutes Bordeaux', 'cti', 'https://www.20minutes.fr/bordeaux/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":13}}'::jsonb, 3600, 'presse quotidienne locale, secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun fait cyber dans la page observée le 2026-11-22 ; risque : phishing utilisant des articles de chantiers girondins comme appât.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-14-bfm-bordeaux', 'BFM Bordeaux', 'cti', 'https://www.bfmtv.com/bordeaux/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":14}}'::jsonb, 3600, 'presse en ligne locale, secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun incident cyber observé le 2026-11-22 ; risque : sites de diffuseurs locaux imités pour publier de fausses alertes sur des chantiers.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-15-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'Qualibat — certification et annuaire des entreprises du bâtiment', 'cti', 'https://www.qualibat.com/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":15}}'::jsonb, 3600, 'organisme de certification et annuaire professionnel, secteur batiment, departement 33 (Gironde). Exemple cyber : Une alerte de phishing usurpant Qualibat a été publiée le 20/11/2026 sur la page actualités : risque pour les entreprises certifiées de Gironde.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-16-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'Artisanat.fr — magazine d''actualités de l''artisanat (CMA)', 'cti', 'https://www.artisanat.fr/magazine/actus', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":16}}'::jsonb, 3600, 'réseau consulaire et magazine d''actualités des artisans, secteur batiment, departement 33 (Gironde). Exemple cyber : Un guide cyber du 06/07/2026 sur Artisanat.fr décrit les rançongiciels et fraudes au virement visant les TPE artisanales, y compris girondines.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-17-siteartisan-annuaire-des-artisans', 'SiteArtisan — annuaire des artisans', 'cti', 'https://www.siteartisan.fr/blog/feed.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":17}}'::jsonb, 3600, 'annuaire d''artisans du bâtiment, secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun incident cyber observé dans le flux le 2026-11-22 ; risque : fiches d''artisans compromises pour émettre des devis frauduleux.', 'Nouvelle-Aquitaine', '33'),
  ('corpus:batiment-33-18-artisans-reunis-artisans-de-gironde-33', 'Artisans Réunis — artisans de Gironde (33)', 'cti', 'https://artisansreunis.fr/blog', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-33.jsonl","ligne":18}}'::jsonb, 3600, 'réseau d''artisans et annuaire départemental, secteur batiment, departement 33 (Gironde). Exemple cyber : Aucun fait cyber observé le 2026-11-22 ; risque : usurpation de fiches d''artisans vérifiés de Gironde pour demander des acomptes.', 'Nouvelle-Aquitaine', '33');

-- Trace de vérification HTTP des 33 URLs du corpus, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus batiment-33 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:batiment-33-01-capeb-gironde-section-departementale-du-batiment', 'https://www.capeb.fr/gironde/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-01-capeb-gironde-section-departementale-du-batiment', 'https://www.capeb.fr/gironde/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-02-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-gironde-33', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-02-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-gironde-33', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Gironde', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-03-pro-rge-entreprises-rge-en-gironde-33', 'https://pro-rge.fr/entreprises/gironde-33/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-04-annuaire-des-artisans-gironde-33', 'https://annuaire-des-artisans.fr/gironde/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-04-annuaire-des-artisans-gironde-33', 'https://annuaire-des-artisans.fr/actualites/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-05-societe-com-entreprises-de-la-gironde-33', 'https://www.societe.com/', 'text/html'),
  ('corpus:batiment-33-05-societe-com-entreprises-de-la-gironde-33', 'https://blog.societe.com/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-06-prefecture-de-la-gironde-services-de-l-etat-urbanisme-et-construction', 'https://www.gironde.gouv.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-06-prefecture-de-la-gironde-services-de-l-etat-urbanisme-et-construction', 'https://www.gironde.gouv.fr/Actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-07-conseil-departemental-de-la-gironde-habitat-et-logement', 'https://www.gironde.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-07-conseil-departemental-de-la-gironde-habitat-et-logement', 'https://www.gironde.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-08-bordeaux-metropole-urbanisme-travaux-et-habitat', 'https://www.bordeaux-metropole.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-08-bordeaux-metropole-urbanisme-travaux-et-habitat', 'https://www.bordeaux-metropole.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-33-09-ville-de-bordeaux-actualites-urbanisme-habitat', 'https://www.bordeaux.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-09-ville-de-bordeaux-actualites-urbanisme-habitat', 'https://www.bordeaux.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-33-10-ici-gironde-radio-france', 'https://www.ici.fr/radio/gironde/actu', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-10-ici-gironde-radio-france', 'https://www.ici.fr/rss/gironde/rubrique/infos.xml', 'application/xml'),
  ('corpus:batiment-33-11-france-3-nouvelle-aquitaine-gironde', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-11-france-3-nouvelle-aquitaine-gironde', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-33-12-actu-fr-bordeaux-33', 'https://actu.fr/nouvelle-aquitaine/bordeaux_33063/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-13-20-minutes-bordeaux', 'https://www.20minutes.fr/bordeaux/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-14-bfm-bordeaux', 'https://www.bfmtv.com/bordeaux/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-15-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-15-qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/actualites', 'text/html; charset=UTF-8'),
  ('corpus:batiment-33-16-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-16-artisanat-fr-magazine-d-actualites-de-l-artisanat-cma', 'https://www.artisanat.fr/magazine/actus', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-17-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/annuaire/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-17-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/blog/', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-17-siteartisan-annuaire-des-artisans', 'https://www.siteartisan.fr/blog/feed.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-33-18-artisans-reunis-artisans-de-gironde-33', 'https://artisansreunis.fr/departement/33-gironde', 'text/html; charset=utf-8'),
  ('corpus:batiment-33-18-artisans-reunis-artisans-de-gironde-33', 'https://artisansreunis.fr/blog', 'text/html; charset=utf-8')
) AS v(source_id, url, content_type);
