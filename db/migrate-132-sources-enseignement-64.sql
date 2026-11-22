-- Sources d'information du secteur enseignement dans le departement 64 (Pyrénées-Atlantiques).
-- 24 sources ; URLs des sites, pages d'actualites, flux et articles cyber controlees en HTTP 200 le 2026-11-22
-- (curl -L, User-Agent navigateur, delai 25 s). Corpus : bench/corpus/sources-enseignement-64.jsonl
-- Preuve : bench/results/verification-enseignement-64.json

BEGIN;

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
    (1, 'corpus:ens64-01-lycee-guynemer-oloron-sainte-marie', 'Lycée Guynemer (Oloron-Sainte-Marie)', 'Lycée professionnel et technologique public', 'https://www.lycee-guynemer.com/', 'https://www.lycee-guynemer.com/category/actualites/', 'https://www.lycee-guynemer.com/feed/', 'Pare Feu, Ethical hacking et bonne humeur — 2023-03-16 — https://www.lycee-guynemer.com/pare-feu-ethical-hacking-et-bonne-humeur/'),
    (2, 'corpus:ens64-02-lycee-saint-john-perse', 'Lycée Saint-John Perse', 'Lycée public', 'https://www.lycee-saint-john-perse.fr/', 'https://www.lycee-saint-john-perse.fr/blog', 'https://www.lycee-saint-john-perse.fr/blog-feed.xml', 'Les étudiants de BTS SIO testent des outils innovants autour de l''IA — 2026-11-04 — https://www.lycee-saint-john-perse.fr/post/les-%C3%A9tudiants-de-bts-si-testent-des-outils-innovants-autour-de-l-ia'),
    (3, 'corpus:ens64-03-lycee-des-metiers-moliere-orthez', 'Lycée des Métiers Molière (Orthez)', 'Lycée professionnel public', 'https://lycee-metiers-orthez.fr/', 'https://lycee-metiers-orthez.fr/actualites', 'https://lycee-metiers-orthez.fr/feed', 'Travail sous tension : sensibiliser sur le harcèlement dans le BTP — 2026-04-04 — https://lycee-metiers-orthez.fr/actualites/travail-sous-tension-sensibiliser-sur-le-harcelement-dans-le-btp/5704'),
    (4, 'corpus:ens64-04-ecole-hoteliere-de-biarritz', 'École hôtelière de Biarritz', 'Lycée hôtelier public', 'https://www.ecolehotelierebiarritz.fr/', 'https://www.ecolehotelierebiarritz.fr/category/actualites/', 'https://www.ecolehotelierebiarritz.fr/feed/', 'Nos mots contre leurs maux : les élèves de 2STHR1 s''engagent contre le harcèlement scolaire — 2026-11-08 — https://www.ecolehotelierebiarritz.fr/nos-mots-contre-leurs-maux-les-eleves-de-2sthr1-sengagent-contre-le-harcelement-scolaire/'),
    (5, 'corpus:ens64-05-lycee-saint-cricq-pau', 'Lycée Saint-Cricq (Pau)', 'Lycée public', 'https://www.lycee-saint-cricq.org/', 'https://www.lycee-saint-cricq.org/category/actualite/', 'https://www.lycee-saint-cricq.org/feed/', 'Nouveaux ambassadeurs de la lutte contre le harcèlement — 2023-04-04 — https://www.lycee-saint-cricq.org/actualite/nouveaux-ambassadeurs-de-la-lutte-contre-le-harcelement/'),
    (6, 'corpus:ens64-06-stella-maris-anglet', 'Stella Maris (Anglet)', 'Ensemble scolaire privé catholique', 'https://stellamarisanglet.fr/', 'https://stellamarisanglet.fr/actualites/', 'https://stellamarisanglet.fr/feed/', 'Intervention CNIL auprès des 5ème — 2026-02-02 — https://stellamarisanglet.fr/intervention-cnil-aupres-des-5e/'),
    (7, 'corpus:ens64-07-lycee-saint-joseph-ustaritz', 'Lycée Saint-Joseph (Ustaritz)', 'Lycée privé catholique', 'https://www.saintjo64.fr/', 'https://www.saintjo64.fr/nos-actualites-lycee-saint-joseph-ustaritz/', 'https://www.saintjo64.fr/feed/', 'Intervention de l''association Génération Numérique — 2023-03-06 — https://www.saintjo64.fr/2023/03/06/intervention-de-lassociation-generation-numerique/'),
    (8, 'corpus:ens64-08-lycee-louis-de-foix-bayonne', 'Lycée Louis de Foix (Bayonne)', 'Lycée professionnel public', 'https://louisdefoix.fr/', 'https://louisdefoix.fr/articles/', 'https://louisdefoix.fr/feed/', 'Le lycée engagé dans la Journée nationale de lutte contre le harcèlement — 2026-11-16 — https://louisdefoix.fr/articles/le-lycee-engage-dans-la-journee-nationale-de-lutte-contre-le-harcelement/'),
    (9, 'corpus:ens64-09-universite-de-pau-et-des-pays-de-l-adour-uppa', 'Université de Pau et des Pays de l''Adour (UPPA)', 'université', 'https://www.univ-pau.fr', 'https://www.univ-pau.fr/fr/actualites.html', 'https://www.univ-pau.fr/_plugins/web/vieuppa/fr/filter/org.ametys.web.article.RSS/rss.xml', 'Cybermois 2026 (Pau), publié le 11/10/2024 (modifié 15/10/2026) — https://www.univ-pau.fr/fr/actualites/cybermoi-s2022.html'),
    (10, 'corpus:ens64-10-estia-ecole-d-ingenieurs-bidart', 'ESTIA — École d''ingénieurs (Bidart)', 'école d''ingénieurs', 'https://www.estia.fr', 'https://www.estia.fr/les-actualites/', 'https://www.estia.fr/rss.xml', 'Deux étudiants récompensés par le Prix Innovation Technologique pour le projet DeepSpeak — 13/11/2026 — https://www.estia.fr/les-actualites/deux-etudiants-de-lestia-recompenses-par-le-prix-innovation-technologique-pour-leur-projet-deepspeak/'),
    (11, 'corpus:ens64-11-cci-pau-bearn-formation-et-numerique', 'CCI Pau Béarn — formation et numérique', 'CCI / formation', 'https://pau.cci.fr', 'https://pau.cci.fr/blog/', 'https://pau.cci.fr/feed/', 'ÉVÉNEMENT — La souveraineté numérique en Béarn | 18 juin 2026 — 26/05/2026 — https://pau.cci.fr/souverainete-numerique-bearn/'),
    (12, 'corpus:ens64-12-cma-64-cma-nouvelle-aquitaine-formation-artisanale', 'CMA 64 / CMA Nouvelle-Aquitaine — formation artisanale', 'CMA / formation', 'https://www.cma64.fr', 'https://www.cma64.fr/actualites/', '', 'Nouveauté Pass CMA Liberté (démarches en ligne) — date non confirmée — https://www.cma64.fr/a-cote-de-chez-vous/actualites/nouveaute-pass-cma-liberte'),
    (13, 'corpus:ens64-13-snes-syndicat-national-des-enseignements-du-second-degre', 'SNES — Syndicat National des Enseignements du second degré', 'syndicat enseignement', 'https://www.snes.edu', 'https://www.snes.edu/toute-lactualite/', 'https://www.snes.edu/feed/', '2017 année numérique… ou électorale ? — 13/10/2016 — https://www.snes.edu/article/2017-annee-numerique-ou-electorale/'),
    (14, 'corpus:ens64-14-unsa-education', 'UNSA Éducation', 'syndicat enseignement', 'https://www.unsa-education.fr', 'https://www.unsa-education.fr/thematiques/actualites/', 'https://www.unsa-education.com/feed/', 'Harcèlement & cyberharcèlement, priorité à l''éducation ! — 08/10/2021 — https://www.unsa-education.com/article-/harcelement-cyberharcelement-priorite-a-leducation/'),
    (15, 'corpus:ens64-15-fsu-federation-syndicale-unitaire', 'FSU — Fédération Syndicale Unitaire', 'fédération syndicale', 'https://www.fsu.fr', 'https://fsu.fr/category/nos-actions/evenements/', 'https://fsu.fr/feed/', 'Communiqué – Cyberattaque contre la FSU : vol de données concernant des militant.es — 26/10/2026 — https://fsu.fr/communique-cyberattaque-contre-la-fsu-vol-de-donnees-concernant-des-militant-es/'),
    (16, 'corpus:ens64-16-cfdt-actualites-education-formation', 'CFDT — actualités éducation/formation', 'confédération syndicale', 'https://www.cfdt.fr', 'https://www.cfdt.fr/sinformer/toutes-les-actualites-par-dossiers-thematiques', 'https://www.cfdt.fr/feed', 'Cyberattaque à l''encontre de la CFDT : les mesures mises en place — 30/03/2026 — https://www.cfdt.fr/sinformer/toutes-les-actualites-par-dossiers-thematiques/cyberattaque-a-l-encontre-de-la-cfdt-les-mesures-mises-en-place'),
    (17, 'corpus:ens64-17-actu-fr-pau-pyrenees-atlantiques', 'actu.fr — Pau (Pyrénées-Atlantiques)', 'presse locale', 'https://actu.fr/nouvelle-aquitaine/pau_64445/', 'https://actu.fr/tag/education/', 'https://actu.fr/rss.xml', '« Pas des super-héros mais des experts » : ces élèves du lycée d’Argentan combattent le harcèlement scolaire | 2026-11-18 | https://actu.fr/normandie/argentan_61006/pas-des-super-heros-mais-des-experts-ces-eleves-du-lycee-dargentan-combattent-le-harcelement-scolaire_65068422.html'),
    (18, 'corpus:ens64-18-ici-pays-basque-ex-france-bleu', 'ici — Pays basque (ex-France Bleu)', 'radio locale / presse', 'https://www.ici.fr/pays-basque', 'https://www.ici.fr/pays-basque', 'https://www.ici.fr/rss/infos.xml', 'Analyse d''examens médicaux, réponse au téléphone : l''IA au centre des rencontres numériques du Pays Basque | 2026-11-20 | https://www.ici.fr/emissions/l-info-d-ici-au-pays-basque/analyse-d-examens-medicaux-reponse-au-telephone-l-ia-au-centre-des-rencontres-numeriques-du-pays-basque-1605661'),
    (19, 'corpus:ens64-19-ici-bearn-ex-france-bleu', 'ici — Béarn (ex-France Bleu)', 'radio locale / presse', 'https://www.ici.fr/bearn', 'https://www.ici.fr/bearn', 'https://www.ici.fr/rss/infos.xml', 'Analyse d''examens médicaux, réponse au téléphone : l''IA au centre des rencontres numériques du Pays Basque | 2026-11-20 | https://www.ici.fr/emissions/l-info-d-ici-au-pays-basque/analyse-d-examens-medicaux-reponse-au-telephone-l-ia-au-centre-des-rencontres-numeriques-du-pays-basque-1605661'),
    (20, 'corpus:ens64-20-le-cafe-pedagogique-actualite-de-l-education', 'Le Café pédagogique — Actualité de l''éducation', 'blog/media pédagogique', 'https://www.cafepedagogique.net/', 'https://www.cafepedagogique.net/category/actualite/', 'https://www.cafepedagogique.net/feed/', 'Numérique, IA, interdictions : l''école française toujours en quête d''un cap | 2026-09-18 | https://www.cafepedagogique.net/2026/09/18/numerique-ia-interdictions-lecole-francaise-toujours-en-quete-dun-cap/'),
    (21, 'corpus:ens64-21-annuaire-des-ecoles-colleges-et-lycees-des-pyrenees-atlantiques', 'Annuaire des écoles, collèges et lycées des Pyrénées-Atlantiques', 'annuaire d''établissements', 'https://www.annuaire-education.fr/departement/pyrenees-atlantiques/064.html', '', '', ''),
    (22, 'corpus:ens64-22-lycee-polyvalent-cantau-anglet', 'Lycée polyvalent Cantau (Anglet)', 'lycée', 'https://lycee-cantau.fr/', 'https://lycee-cantau.fr/lycee-cantau-anglet/actualites/', 'https://lycee-cantau.fr/feed/', 'Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
    (23, 'corpus:ens64-23-lycee-professionnel-du-4-septembre-1870-bayonne', 'Lycée professionnel du 4 septembre 1870 (Bayonne)', 'lycée professionnel', 'https://www.lycee4septembre.fr/', 'https://www.lycee4septembre.fr/actualites/', 'https://www.lycee4septembre.fr/feed/', 'Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html'),
    (24, 'corpus:ens64-24-lycee-polyvalent-haute-vue-pau-morlaas', 'Lycée polyvalent Haute-Vue Pau-Morlaàs', 'lycée', 'https://www.lyceeprofessionnel-morlaas.fr/', 'https://www.lyceeprofessionnel-morlaas.fr/actualites/', '', 'Aucun incident propre identifié ; cyberattaque DDoS des sites de la Ville de Pau (31/12/2024, France 3) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, 'cti', COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       'source d information sectorielle, diffusion publique', true, 'narrative',
       CASE WHEN flux <> '' THEN 'rss' ELSE 'html' END,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-enseignement-64.jsonl', 'ligne', ord))::jsonb,
       3600, type || ', secteur enseignement, departement 64 (Pyrénées-Atlantiques). Exemple cyber : ' || cyber,
       'Nouvelle-Aquitaine', '64'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, description = EXCLUDED.description,
  format = EXCLUDED.format, parser = EXCLUDED.parser, enabled = true;

-- Trace de verification HTTP des URLs du corpus, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus enseignement-64 : HTTP 200 verifie le 2026-11-22'
FROM (VALUES
  ('corpus:ens64-01-lycee-guynemer-oloron-sainte-marie', 'https://www.lycee-guynemer.com/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-01-lycee-guynemer-oloron-sainte-marie', 'https://www.lycee-guynemer.com/category/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-01-lycee-guynemer-oloron-sainte-marie', 'https://www.lycee-guynemer.com/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-01-lycee-guynemer-oloron-sainte-marie', 'https://www.lycee-guynemer.com/pare-feu-ethical-hacking-et-bonne-humeur/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-02-lycee-saint-john-perse', 'https://www.lycee-saint-john-perse.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-02-lycee-saint-john-perse', 'https://www.lycee-saint-john-perse.fr/blog', 'text/html; charset=UTF-8'),
  ('corpus:ens64-02-lycee-saint-john-perse', 'https://www.lycee-saint-john-perse.fr/blog-feed.xml', 'text/xml; charset=UTF-8'),
  ('corpus:ens64-02-lycee-saint-john-perse', 'https://www.lycee-saint-john-perse.fr/post/les-%C3%A9tudiants-de-bts-si-testent-des-outils-innovants-autour-de-l-ia', 'text/html; charset=UTF-8'),
  ('corpus:ens64-03-lycee-des-metiers-moliere-orthez', 'https://lycee-metiers-orthez.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-03-lycee-des-metiers-moliere-orthez', 'https://lycee-metiers-orthez.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:ens64-03-lycee-des-metiers-moliere-orthez', 'https://lycee-metiers-orthez.fr/feed', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-03-lycee-des-metiers-moliere-orthez', 'https://lycee-metiers-orthez.fr/actualites/travail-sous-tension-sensibiliser-sur-le-harcelement-dans-le-btp/5704', 'text/html; charset=UTF-8'),
  ('corpus:ens64-04-ecole-hoteliere-de-biarritz', 'https://www.ecolehotelierebiarritz.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-04-ecole-hoteliere-de-biarritz', 'https://www.ecolehotelierebiarritz.fr/category/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-04-ecole-hoteliere-de-biarritz', 'https://www.ecolehotelierebiarritz.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-04-ecole-hoteliere-de-biarritz', 'https://www.ecolehotelierebiarritz.fr/nos-mots-contre-leurs-maux-les-eleves-de-2sthr1-sengagent-contre-le-harcelement-scolaire/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-05-lycee-saint-cricq-pau', 'https://www.lycee-saint-cricq.org/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-05-lycee-saint-cricq-pau', 'https://www.lycee-saint-cricq.org/category/actualite/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-05-lycee-saint-cricq-pau', 'https://www.lycee-saint-cricq.org/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-05-lycee-saint-cricq-pau', 'https://www.lycee-saint-cricq.org/actualite/nouveaux-ambassadeurs-de-la-lutte-contre-le-harcelement/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-06-stella-maris-anglet', 'https://stellamarisanglet.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-06-stella-maris-anglet', 'https://stellamarisanglet.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-06-stella-maris-anglet', 'https://stellamarisanglet.fr/feed/', 'text/xml;charset=UTF-8'),
  ('corpus:ens64-06-stella-maris-anglet', 'https://stellamarisanglet.fr/intervention-cnil-aupres-des-5e/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-07-lycee-saint-joseph-ustaritz', 'https://www.saintjo64.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-07-lycee-saint-joseph-ustaritz', 'https://www.saintjo64.fr/nos-actualites-lycee-saint-joseph-ustaritz/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-07-lycee-saint-joseph-ustaritz', 'https://www.saintjo64.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-07-lycee-saint-joseph-ustaritz', 'https://www.saintjo64.fr/2023/03/06/intervention-de-lassociation-generation-numerique/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-08-lycee-louis-de-foix-bayonne', 'https://louisdefoix.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-08-lycee-louis-de-foix-bayonne', 'https://louisdefoix.fr/articles/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-08-lycee-louis-de-foix-bayonne', 'https://louisdefoix.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-08-lycee-louis-de-foix-bayonne', 'https://louisdefoix.fr/articles/le-lycee-engage-dans-la-journee-nationale-de-lutte-contre-le-harcelement/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-09-universite-de-pau-et-des-pays-de-l-adour-uppa', 'https://www.univ-pau.fr', 'text/html; charset=UTF-8'),
  ('corpus:ens64-09-universite-de-pau-et-des-pays-de-l-adour-uppa', 'https://www.univ-pau.fr/fr/actualites.html', 'text/html; charset=UTF-8'),
  ('corpus:ens64-09-universite-de-pau-et-des-pays-de-l-adour-uppa', 'https://www.univ-pau.fr/_plugins/web/vieuppa/fr/filter/org.ametys.web.article.RSS/rss.xml', 'application/xml'),
  ('corpus:ens64-09-universite-de-pau-et-des-pays-de-l-adour-uppa', 'https://www.univ-pau.fr/fr/actualites/cybermoi-s2022.html', 'text/html; charset=UTF-8'),
  ('corpus:ens64-10-estia-ecole-d-ingenieurs-bidart', 'https://www.estia.fr', 'text/html; charset=utf-8'),
  ('corpus:ens64-10-estia-ecole-d-ingenieurs-bidart', 'https://www.estia.fr/les-actualites/', 'text/html; charset=utf-8'),
  ('corpus:ens64-10-estia-ecole-d-ingenieurs-bidart', 'https://www.estia.fr/rss.xml', 'application/rss+xml;charset=utf-8'),
  ('corpus:ens64-10-estia-ecole-d-ingenieurs-bidart', 'https://www.estia.fr/les-actualites/deux-etudiants-de-lestia-recompenses-par-le-prix-innovation-technologique-pour-leur-projet-deepspeak/', 'text/html; charset=utf-8'),
  ('corpus:ens64-11-cci-pau-bearn-formation-et-numerique', 'https://pau.cci.fr', 'text/html; charset=UTF-8'),
  ('corpus:ens64-11-cci-pau-bearn-formation-et-numerique', 'https://pau.cci.fr/blog/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-11-cci-pau-bearn-formation-et-numerique', 'https://pau.cci.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-11-cci-pau-bearn-formation-et-numerique', 'https://pau.cci.fr/souverainete-numerique-bearn/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-12-cma-64-cma-nouvelle-aquitaine-formation-artisanale', 'https://www.cma64.fr', 'text/html; charset=UTF-8'),
  ('corpus:ens64-12-cma-64-cma-nouvelle-aquitaine-formation-artisanale', 'https://www.cma64.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-12-cma-64-cma-nouvelle-aquitaine-formation-artisanale', 'https://www.cma64.fr/a-cote-de-chez-vous/actualites/nouveaute-pass-cma-liberte', 'text/html; charset=UTF-8'),
  ('corpus:ens64-13-snes-syndicat-national-des-enseignements-du-second-degre', 'https://www.snes.edu', 'text/html; charset=UTF-8'),
  ('corpus:ens64-13-snes-syndicat-national-des-enseignements-du-second-degre', 'https://www.snes.edu/toute-lactualite/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-13-snes-syndicat-national-des-enseignements-du-second-degre', 'https://www.snes.edu/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-13-snes-syndicat-national-des-enseignements-du-second-degre', 'https://www.snes.edu/article/2017-annee-numerique-ou-electorale/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-14-unsa-education', 'https://www.unsa-education.fr', 'text/html; charset=UTF-8'),
  ('corpus:ens64-14-unsa-education', 'https://www.unsa-education.fr/thematiques/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-14-unsa-education', 'https://www.unsa-education.com/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-14-unsa-education', 'https://www.unsa-education.com/article-/harcelement-cyberharcelement-priorite-a-leducation/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-15-fsu-federation-syndicale-unitaire', 'https://www.fsu.fr', 'text/html; charset=UTF-8'),
  ('corpus:ens64-15-fsu-federation-syndicale-unitaire', 'https://fsu.fr/category/nos-actions/evenements/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-15-fsu-federation-syndicale-unitaire', 'https://fsu.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-15-fsu-federation-syndicale-unitaire', 'https://fsu.fr/communique-cyberattaque-contre-la-fsu-vol-de-donnees-concernant-des-militant-es/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-16-cfdt-actualites-education-formation', 'https://www.cfdt.fr', 'text/html; charset=UTF-8'),
  ('corpus:ens64-16-cfdt-actualites-education-formation', 'https://www.cfdt.fr/sinformer/toutes-les-actualites-par-dossiers-thematiques', 'text/html; charset=UTF-8'),
  ('corpus:ens64-16-cfdt-actualites-education-formation', 'https://www.cfdt.fr/feed', 'application/xml'),
  ('corpus:ens64-16-cfdt-actualites-education-formation', 'https://www.cfdt.fr/sinformer/toutes-les-actualites-par-dossiers-thematiques/cyberattaque-a-l-encontre-de-la-cfdt-les-mesures-mises-en-place', 'text/html; charset=UTF-8'),
  ('corpus:ens64-17-actu-fr-pau-pyrenees-atlantiques', 'https://actu.fr/nouvelle-aquitaine/pau_64445/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-17-actu-fr-pau-pyrenees-atlantiques', 'https://actu.fr/tag/education/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-17-actu-fr-pau-pyrenees-atlantiques', 'https://actu.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:ens64-17-actu-fr-pau-pyrenees-atlantiques', 'https://actu.fr/normandie/argentan_61006/pas-des-super-heros-mais-des-experts-ces-eleves-du-lycee-dargentan-combattent-le-harcelement-scolaire_65068422.html', 'text/html; charset=UTF-8'),
  ('corpus:ens64-18-ici-pays-basque-ex-france-bleu', 'https://www.ici.fr/pays-basque', 'text/html; charset=UTF-8'),
  ('corpus:ens64-18-ici-pays-basque-ex-france-bleu', 'https://www.ici.fr/rss/infos.xml', 'application/xml'),
  ('corpus:ens64-18-ici-pays-basque-ex-france-bleu', 'https://www.ici.fr/emissions/l-info-d-ici-au-pays-basque/analyse-d-examens-medicaux-reponse-au-telephone-l-ia-au-centre-des-rencontres-numeriques-du-pays-basque-1605661', 'text/html; charset=UTF-8'),
  ('corpus:ens64-19-ici-bearn-ex-france-bleu', 'https://www.ici.fr/bearn', 'text/html; charset=UTF-8'),
  ('corpus:ens64-19-ici-bearn-ex-france-bleu', 'https://www.ici.fr/rss/infos.xml', 'application/xml'),
  ('corpus:ens64-19-ici-bearn-ex-france-bleu', 'https://www.ici.fr/emissions/l-info-d-ici-au-pays-basque/analyse-d-examens-medicaux-reponse-au-telephone-l-ia-au-centre-des-rencontres-numeriques-du-pays-basque-1605661', 'text/html; charset=UTF-8'),
  ('corpus:ens64-20-le-cafe-pedagogique-actualite-de-l-education', 'https://www.cafepedagogique.net/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-20-le-cafe-pedagogique-actualite-de-l-education', 'https://www.cafepedagogique.net/category/actualite/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-20-le-cafe-pedagogique-actualite-de-l-education', 'https://www.cafepedagogique.net/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-20-le-cafe-pedagogique-actualite-de-l-education', 'https://www.cafepedagogique.net/2026/09/18/numerique-ia-interdictions-lecole-francaise-toujours-en-quete-dun-cap/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-21-annuaire-des-ecoles-colleges-et-lycees-des-pyrenees-atlantiques', 'https://www.annuaire-education.fr/departement/pyrenees-atlantiques/064.html', 'text/html'),
  ('corpus:ens64-22-lycee-polyvalent-cantau-anglet', 'https://lycee-cantau.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-22-lycee-polyvalent-cantau-anglet', 'https://lycee-cantau.fr/lycee-cantau-anglet/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-22-lycee-polyvalent-cantau-anglet', 'https://lycee-cantau.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-22-lycee-polyvalent-cantau-anglet', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8'),
  ('corpus:ens64-23-lycee-professionnel-du-4-septembre-1870-bayonne', 'https://www.lycee4septembre.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-23-lycee-professionnel-du-4-septembre-1870-bayonne', 'https://www.lycee4septembre.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-23-lycee-professionnel-du-4-septembre-1870-bayonne', 'https://www.lycee4septembre.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:ens64-23-lycee-professionnel-du-4-septembre-1870-bayonne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8'),
  ('corpus:ens64-24-lycee-polyvalent-haute-vue-pau-morlaas', 'https://www.lyceeprofessionnel-morlaas.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-24-lycee-polyvalent-haute-vue-pau-morlaas', 'https://www.lyceeprofessionnel-morlaas.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:ens64-24-lycee-polyvalent-haute-vue-pau-morlaas', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/cyberattaque-de-sites-internet-assez-peu-de-consequences-aucune-fuite-de-donnees-a-bordeaux-et-pau-deux-villes-ciblees-par-les-hackers-3085051.html', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (SELECT 1 FROM source_verification x WHERE x.source_id = v.source_id AND x.url = v.url);

COMMIT;
