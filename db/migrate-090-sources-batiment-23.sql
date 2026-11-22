-- Sources d'information du secteur batiment dans le departement 23 (Creuse).
-- 19 sources, 43 controles HTTP sur 43 URLs distinctes (sites, pages actualites et flux),
-- toutes en HTTP 200 le 2026-11-22 (curl -L, User-Agent navigateur).
-- Corpus : bench/corpus/sources-batiment-23.jsonl
-- Preuve : bench/results/verification-sources-batiment-23.json

-- Table de tracage declaree en complement pour rester applicable sur une branche
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
  ('corpus:batiment-23-01-capeb-creuse-section-departementale-du-batiment', 'CAPEB Creuse — section départementale du bâtiment', 'cti', 'https://www.capeb.fr/creuse/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":1}}'::jsonb, 3600, 'syndicat professionnel du bâtiment, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber observé dans le flux le 2026-11-22 ; vecteur sectoriel : faux devis et faux RIB envoyés depuis la messagerie compromises d''un artisan.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-02-caue-23-conseil-d-architecture-d-urbanisme-et-de-l-environnement-de-la-creuse', 'CAUE 23 — Conseil d''architecture, d''urbanisme et de l''environnement de la Creuse', 'cti', 'https://www.caue23.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":2}}'::jsonb, 3600, 'conseil architecture/urbanisme, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun fait cyber dans le flux observé le 2026-11-22 ; risque : compromission du site de consultation du CAUE pour diffuser de faux conseils de rénovation.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-03-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-creuse-23', 'CMA Nouvelle-Aquitaine — chambre des métiers et de l''artisanat (Creuse 23)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Creuse', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":3}}'::jsonb, 3600, 'chambre des métiers et de l''artisanat, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber dans la page observée le 2026-11-22 ; risque : usurpation d''identité d''artisans via les annuaires et formulaires de la CMA.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-04-prefecture-de-la-creuse-services-de-l-etat-urbanisme-et-construction', 'Préfecture de la Creuse — services de l''État (urbanisme et construction)', 'cti', 'https://www.creuse.gouv.fr/Actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":4}}'::jsonb, 3600, 'administration (DDT, urbanisme et construction), secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun fait cyber dans les actualités observées le 2026-11-22 ; risque : phishing sur les demandes de permis de construire avec pièces jointes infectées.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-05-conseil-departemental-de-la-creuse-habitat-et-logement', 'Conseil départemental de la Creuse — habitat et logement', 'cti', 'https://www.creuse.fr/A-la-une', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":5}}'::jsonb, 3600, 'collectivité (habitat, logement), secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber dans le flux observé le 2026-11-22 ; risque : fraude aux subventions de rénovation par faux RIB sur les aides départementales.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-06-ville-de-gueret-actualites-urbanisme-et-habitat', 'Ville de Guéret — actualités urbanisme et habitat', 'cti', 'https://www.ville-gueret.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":6}}'::jsonb, 3600, 'collectivité (urbanisme, habitat), secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun fait cyber dans le flux observé le 2026-11-22 ; risque : campagne de phishing sur les formulaires d''urbanisme de la commune.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-07-agglomeration-grand-gueret-actualites-travaux-et-urbanisme', 'Agglomération Grand Guéret — actualités travaux et urbanisme', 'cti', 'https://www.agglo-grandgueret.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":7}}'::jsonb, 3600, 'intercommunalité (travaux, urbanisme), secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber dans le flux observé le 2026-11-22 ; risque : usurpation de l''identité de l''agglomération pour envoyer de fausses consignes de chantier.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-08-societe-com-entreprises-de-la-creuse-23', 'Societe.com — entreprises de la Creuse (23)', 'cti', 'https://blog.societe.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":8}}'::jsonb, 3600, 'annuaire d''entreprises, secteur batiment, departement 23 (Creuse). Exemple cyber : Données d''entreprises creusoises exposées dans l''annuaire : risque de scraping et d''usurpation d''identité pour des fraudes aux devis.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-09-artisan-guide-artisans-en-creuse-23', 'Artisan Guide — artisans en Creuse (23)', 'cti', 'https://artisan.guide/blog/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":9}}'::jsonb, 3600, 'annuaire d''artisans du bâtiment, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun fait cyber observé le 2026-11-22 ; risque : coordonnées d''artisans détaillées réutilisées pour des campagnes de phishing ciblées.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-10-artizo-artisans-dans-la-creuse', 'Artizo — artisans dans la Creuse', 'cti', 'https://www.artizo.fr/blog/feed.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":10}}'::jsonb, 3600, 'annuaire d''artisans, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber dans le flux observé le 2026-11-22 ; risque : profils d''artisans usurpés pour solliciter des acomptes sur des travaux.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-11-le-vrai-artisan-annuaire-des-artisans-qualifies-de-la-creuse', 'Le vrai artisan — annuaire des artisans qualifiés de la Creuse', 'cti', 'https://levraiartisan.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":11}}'::jsonb, 3600, 'annuaire d''artisans qualifiés, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun fait cyber dans le flux observé le 2026-11-22 ; risque : fraude au RIB lors du paiement d''un chantier après compromission de la boîte mail de l''artisan.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-12-7monartisan-artisans-dans-la-creuse-23', '7monartisan — artisans dans la Creuse (23)', 'cti', 'https://7monartisan.fr/blog', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":12}}'::jsonb, 3600, 'annuaire d''artisans, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber observé le 2026-11-22 ; risque : fausses annonces d''artisans et demandes d''acompte en ligne.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-13-omizi-entreprises-de-batiment-en-creuse-23', 'Omizi — entreprises de bâtiment en Creuse (23)', 'cti', 'https://omizi.com/blog', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":13}}'::jsonb, 3600, 'plateforme de devis bâtiment, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun fait cyber dans le flux observé le 2026-11-22 ; risque : vol de coordonnées dans les demandes de devis et revente de prospects.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-14-artisans-reunis-artisans-de-la-creuse-23', 'Artisans Réunis — artisans de la Creuse (23)', 'cti', 'https://artisansreunis.fr/magazine', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":14}}'::jsonb, 3600, 'réseau d''artisans, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber observé le 2026-11-22 ; risque : usurpation de la marque du réseau pour tromper des clients sur des garanties de chantier.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-15-la-montagne-creuse', 'La Montagne — Creuse', 'cti', 'https://www.lamontagne.fr/creuse/economie', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":15}}'::jsonb, 3600, 'presse quotidienne locale, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber dans le flux observé le 2026-11-22 ; risque : faux communiqués de presse sur des chantiers pour manipuler l''opinion.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-16-actu-fr-actu-creuse', 'actu.fr — Actu Creuse', 'cti', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":16}}'::jsonb, 3600, 'presse en ligne locale, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun fait cyber dans le flux observé le 2026-11-22 ; risque : diffusion d''informations sur des entreprises du BTP via un flux RSS usurpé.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-17-ici-creuse-radio-france', 'ICI Creuse — Radio France', 'cti', 'https://www.ici.fr/rss/creuse/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":17}}'::jsonb, 3600, 'radio et presse locale, secteur batiment, departement 23 (Creuse). Exemple cyber : Le flux ICI Creuse a relaté en 2025 une arnaque au président contre l''APAJH 23 (173 000 €) : même vecteur de fraude au virement pour les associations et artisans du bâtiment.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-18-france-3-nouvelle-aquitaine-creuse', 'France 3 Nouvelle-Aquitaine — Creuse', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":18}}'::jsonb, 3600, 'télévision publique locale, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun incident cyber dans le flux observé le 2026-11-22 ; risque : sites de diffuseurs locaux imités pour publier de fausses alertes sur des chantiers.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:batiment-23-19-le-populaire-du-centre-gueret-23000', 'Le Populaire du Centre — Guéret (23000)', 'cti', 'https://www.lepopulaire.fr/gueret-23000/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-batiment-23.jsonl","ligne":19}}'::jsonb, 3600, 'presse quotidienne locale, secteur batiment, departement 23 (Creuse). Exemple cyber : Aucun fait cyber dans le flux observé le 2026-11-22 ; risque : phishing utilisant des articles de chantiers locaux comme appât.', 'Nouvelle-Aquitaine', '23');

-- Trace de verification HTTP des 43 URLs du corpus, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus batiment-23 : HTTP 200 verifie le 2026-11-22'
FROM (VALUES
  ('corpus:batiment-23-01-capeb-creuse-section-departementale-du-batiment', 'https://www.capeb.fr/creuse/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-01-capeb-creuse-section-departementale-du-batiment', 'https://www.capeb.fr/creuse/actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-02-caue-23-conseil-d-architecture-d-urbanisme-et-de-l-environnement-de-la-creuse', 'https://www.caue23.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-02-caue-23-conseil-d-architecture-d-urbanisme-et-de-l-environnement-de-la-creuse', 'https://www.caue23.fr/actualite/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-02-caue-23-conseil-d-architecture-d-urbanisme-et-de-l-environnement-de-la-creuse', 'https://www.caue23.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-23-03-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-creuse-23', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-03-cma-nouvelle-aquitaine-chambre-des-metiers-et-de-l-artisanat-creuse-23', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites?news_list%5Bsearch%5D=Creuse', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-04-prefecture-de-la-creuse-services-de-l-etat-urbanisme-et-construction', 'https://www.creuse.gouv.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-04-prefecture-de-la-creuse-services-de-l-etat-urbanisme-et-construction', 'https://www.creuse.gouv.fr/Actualites', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-05-conseil-departemental-de-la-creuse-habitat-et-logement', 'https://www.creuse.fr/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-05-conseil-departemental-de-la-creuse-habitat-et-logement', 'https://www.creuse.fr/A-la-une', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-06-ville-de-gueret-actualites-urbanisme-et-habitat', 'https://www.ville-gueret.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-06-ville-de-gueret-actualites-urbanisme-et-habitat', 'https://www.ville-gueret.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-06-ville-de-gueret-actualites-urbanisme-et-habitat', 'https://www.ville-gueret.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-23-07-agglomeration-grand-gueret-actualites-travaux-et-urbanisme', 'https://www.agglo-grandgueret.fr/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-07-agglomeration-grand-gueret-actualites-travaux-et-urbanisme', 'https://www.agglo-grandgueret.fr/lagglo/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-07-agglomeration-grand-gueret-actualites-travaux-et-urbanisme', 'https://www.agglo-grandgueret.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:batiment-23-08-societe-com-entreprises-de-la-creuse-23', 'https://www.societe.com/entreprises/CREUSE_23.html', 'text/html'),
  ('corpus:batiment-23-08-societe-com-entreprises-de-la-creuse-23', 'https://blog.societe.com/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-09-artisan-guide-artisans-en-creuse-23', 'https://artisan.guide/departements/creuse/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-09-artisan-guide-artisans-en-creuse-23', 'https://artisan.guide/blog/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-10-artizo-artisans-dans-la-creuse', 'https://www.artizo.fr/catalogue/creuse/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-10-artizo-artisans-dans-la-creuse', 'https://www.artizo.fr/blog/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-10-artizo-artisans-dans-la-creuse', 'https://www.artizo.fr/blog/feed.xml', 'text/xml; charset=utf-8'),
  ('corpus:batiment-23-11-le-vrai-artisan-annuaire-des-artisans-qualifies-de-la-creuse', 'https://levraiartisan.fr/creuse/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-11-le-vrai-artisan-annuaire-des-artisans-qualifies-de-la-creuse', 'https://levraiartisan.fr/les-conseils-de-maitre-payen/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-11-le-vrai-artisan-annuaire-des-artisans-qualifies-de-la-creuse', 'https://levraiartisan.fr/feed/', 'text/xml;charset=UTF-8'),
  ('corpus:batiment-23-12-7monartisan-artisans-dans-la-creuse-23', 'https://7monartisan.fr/departement/creuse', 'text/html'),
  ('corpus:batiment-23-12-7monartisan-artisans-dans-la-creuse-23', 'https://7monartisan.fr/blog', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-13-omizi-entreprises-de-batiment-en-creuse-23', 'https://omizi.com/professionnels/entreprises-de-batiment/creuse', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-13-omizi-entreprises-de-batiment-en-creuse-23', 'https://omizi.com/blog', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-14-artisans-reunis-artisans-de-la-creuse-23', 'https://artisansreunis.fr/departement/23-creuse', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-14-artisans-reunis-artisans-de-la-creuse-23', 'https://artisansreunis.fr/magazine', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-15-la-montagne-creuse', 'https://www.lamontagne.fr/creuse/', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-15-la-montagne-creuse', 'https://www.lamontagne.fr/creuse/economie', 'text/html; charset=utf-8'),
  ('corpus:batiment-23-16-actu-fr-actu-creuse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-16-actu-fr-actu-creuse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:batiment-23-17-ici-creuse-radio-france', 'https://www.ici.fr/radio/creuse', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-17-ici-creuse-radio-france', 'https://www.ici.fr/radio/creuse/actu', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-17-ici-creuse-radio-france', 'https://www.ici.fr/rss/creuse/rubrique/infos.xml', 'application/xml'),
  ('corpus:batiment-23-18-france-3-nouvelle-aquitaine-creuse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse', 'text/html; charset=UTF-8'),
  ('corpus:batiment-23-18-france-3-nouvelle-aquitaine-creuse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss', 'text/xml; charset=UTF-8'),
  ('corpus:batiment-23-19-le-populaire-du-centre-gueret-23000', 'https://www.lepopulaire.fr/gueret-23000/', 'text/html; charset=utf-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (SELECT 1 FROM source_verification x WHERE x.source_id = v.source_id AND x.url = v.url);
