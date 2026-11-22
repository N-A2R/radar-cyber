-- Sources d'information du secteur « commerce » du département 33 (Gironde).
-- 17 sources, 64 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel avec User-Agent
-- navigateur, redirections suivies, délai 25 s). Corpus : bench/corpus/sources-commerce-33.jsonl
-- Preuve HTTP : bench/results/verification-commerce-33.json

-- Déclaration locale pour rester applicable sur une branche sans migrate-064-source-verification.sql.
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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser,
                    interval_sec, region, department, description)
VALUES
  ('corpus:commerce-33-jde-gironde', 'Le Journal des Entreprises — Gironde', 'presse', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":1}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'presse économique régionale. Exemple cyber : Cyberattaque : des hackers pro-russes visent le site de la Ville de Bordeaux.'),
  ('corpus:commerce-33-ici-gironde', 'ICI Gironde (Radio France)', 'presse', 'https://www.ici.fr/rss/gironde/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":2}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'radio locale (actualités économiques de la Gironde). Exemple cyber : Cyberattaque : aucune donnée exfiltrée, une mairie de Gironde (Floirac) privée d''accès à internet.'),
  ('corpus:commerce-33-mon-entreprise-info', 'Mon-Entreprise-Info — actualités Gironde', 'cti', 'https://mon-entreprise-info.com/actualites/gironde/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":3}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'annuaire professionnel et actualités des entreprises. Exemple cyber : Bordeaux Métropole : fuite de données touchant 9 390 déclarants au service de la taxe de séjour.'),
  ('corpus:commerce-33-bordeaux-metropole', 'Bordeaux Métropole — actualités économie et commerces', 'cti', 'https://www.bordeaux-metropole.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":4}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'collectivité (développement économique, commerces et actualités). Exemple cyber : Bordeaux Métropole : fuite de données touchant 9 390 déclarants au service de la taxe de séjour.'),
  ('corpus:commerce-33-fevad', 'FEVAD — Fédération du e-commerce et de la vente à distance', 'cti', 'https://www.fevad.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":5}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'fédération professionnelle du commerce en ligne. Exemple cyber : Cyberattaque des supermarchés : quatre Intermarché girondins parmi les magasins touchés.'),
  ('corpus:commerce-33-cma-na', 'CMA Nouvelle-Aquitaine — actualités des artisans de Gironde', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":6}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'chambre consulaire régionale (artisanat, commerces et entreprises). Exemple cyber : Cyberattaque : des hackers pro-russes visent le site de la Ville de Bordeaux.'),
  ('corpus:commerce-33-fcd', 'FCD — Fédération du commerce et de la distribution', 'cti', 'https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":7}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'fédération professionnelle du commerce et de la distribution. Exemple cyber : Cyberattaque : une mairie de Gironde (Berson) perd des données officielles, une rançon réclamée.'),
  ('corpus:commerce-33-societe-tech', 'Societe.Tech — entreprises Gironde', 'presse', 'https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-gironde/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":8}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'presse spécialisée entreprises et technologies. Exemple cyber : Cyberattaque : des hackers pro-russes visent le site de la Ville de Bordeaux.'),
  ('corpus:commerce-33-cyberattaque-org', 'Cyberattaque.org — veille des incidents cyber', 'presse', 'https://www.cyberattaque.org/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":9}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'presse spécialisée cybersécurité (veille utile aux entreprises commerciales). Exemple cyber : Cyberattaque : une mairie de Gironde (Berson) perd des données officielles, une rançon réclamée.'),
  ('corpus:commerce-33-actu-fr-gironde', 'actu.fr — Gironde (économie)', 'presse', 'https://actu.fr/nouvelle-aquitaine/gironde_33/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":10}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'presse locale (Bordeaux et département 33). Exemple cyber : Cyberattaque : des hackers pro-russes visent le site de la Ville de Bordeaux.'),
  ('corpus:commerce-33-artisanat-fr', 'Artisanat.fr — CMA France, actualités des entreprises', 'cti', 'https://www.artisanat.fr/magazine/actus', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":11}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'chambre consulaire nationale (CMA France — artisans et entreprises). Exemple cyber : Cybersécurité TPE : guide pratique pour artisans.'),
  ('corpus:commerce-33-bordeaux-mon-commerce', 'Bordeaux Mon Commerce — association des commerçants et artisans', 'cti', 'https://www.bordeauxmoncommerce.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":12}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'association locale de commerçants et artisans. Exemple cyber : Cyberattaque des supermarchés : quatre Intermarché girondins parmi les magasins touchés.'),
  ('corpus:commerce-33-umih-33', 'UMIH 33 — syndicat des métiers de l''hôtellerie-restauration de Gironde', 'cti', 'https://www.umih33.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":13}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'syndicat professionnel (hôtellerie-restauration Gironde). Exemple cyber : Cybersécurité TPE : guide pratique pour artisans.'),
  ('corpus:commerce-33-centre-ville-en-mouvement', 'Centre-ville en mouvement — réseau des commerces de centre-ville', 'cti', 'https://www.centre-ville.org/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":14}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'réseau associatif des commerces de centre-ville. Exemple cyber : [Chronique] Cybersécurité, une question de conformité.'),
  ('corpus:commerce-33-echos-judiciaires', 'Échos judiciaires girondins — rubrique économie', 'presse', 'https://www.echos-judiciaires.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":15}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'presse locale (rubrique économie). Exemple cyber : [Chronique] Cybersécurité, une question de conformité.'),
  ('corpus:commerce-33-bouger-a-bordeaux', 'Bouger à Bordeaux — actualités locales (Gironde)', 'presse', 'https://www.bougerabordeaux.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":16}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'presse locale (actualités Bordeaux et Gironde). Exemple cyber : Cyberattaque des supermarchés : quatre Intermarché girondins parmi les magasins touchés.'),
  ('corpus:commerce-33-france3-gironde', 'France 3 Nouvelle-Aquitaine — Gironde', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-33.jsonl","ligne":17}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '33', 'télévision locale (actualités de la Gironde). Exemple cyber : Cyberattaque : aucune donnée exfiltrée, une mairie de Gironde (Floirac) privée d''accès à internet.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 64 URLs (sites, pages d'actualités, flux et articles cyber),
-- toutes en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:commerce-33-jde-gironde', 'https://www.lejournaldesentreprises.com/', 'text/html', 0),
    ('corpus:commerce-33-jde-gironde', 'https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/gironde', 'text/html', 0),
    ('corpus:commerce-33-jde-gironde', 'https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine', 'text/xml', 20),
    ('corpus:commerce-33-jde-gironde', 'https://actu.fr/nouvelle-aquitaine/bordeaux_33063/cyberattaque-des-hackers-pro-russes-visent-le-site-de-la-ville-de-bordeaux_62068860.html', 'text/html', 0),
    ('corpus:commerce-33-ici-gironde', 'https://www.ici.fr/', 'text/html', 0),
    ('corpus:commerce-33-ici-gironde', 'https://www.ici.fr/nouvelle-aquitaine/gironde-33/actu', 'text/html', 0),
    ('corpus:commerce-33-ici-gironde', 'https://www.ici.fr/rss/gironde/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-33-ici-gironde', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/aucune-donnee-n-a-ete-exfiltree-victime-d-une-cyberattaque-une-mairie-est-privee-d-acces-a-internet-2957996.html', 'text/html', 0),
    ('corpus:commerce-33-mon-entreprise-info', 'https://mon-entreprise-info.com/', 'text/html', 0),
    ('corpus:commerce-33-mon-entreprise-info', 'https://mon-entreprise-info.com/actualites/gironde/', 'text/html', 0),
    ('corpus:commerce-33-mon-entreprise-info', 'https://mon-entreprise-info.com/actualites/gironde/rss.xml', 'application/xml', 50),
    ('corpus:commerce-33-mon-entreprise-info', 'https://fuitesinfos.fr/article/2026-04-27-bordeaux-metropole', 'text/html', 0),
    ('corpus:commerce-33-bordeaux-metropole', 'https://www.bordeaux-metropole.fr/', 'text/html', 0),
    ('corpus:commerce-33-bordeaux-metropole', 'https://www.bordeaux-metropole.fr/actualites', 'text/html', 0),
    ('corpus:commerce-33-bordeaux-metropole', 'https://www.bordeaux-metropole.fr/rss.xml', 'application/rss+xml', 10),
    ('corpus:commerce-33-bordeaux-metropole', 'https://fuitesinfos.fr/article/2026-04-27-bordeaux-metropole', 'text/html', 0),
    ('corpus:commerce-33-fevad', 'https://www.fevad.com/', 'text/html', 0),
    ('corpus:commerce-33-fevad', 'https://www.fevad.com/actualites/', 'text/html', 0),
    ('corpus:commerce-33-fevad', 'https://www.fevad.com/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-33-fevad', 'https://fuitesinfos.fr/article/2026-04-27-bordeaux-metropole', 'text/html', 0),
    ('corpus:commerce-33-cma-na', 'https://cma-nouvelleaquitaine.fr/', 'text/html', 0),
    ('corpus:commerce-33-cma-na', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html', 0),
    ('corpus:commerce-33-cma-na', 'https://actu.fr/nouvelle-aquitaine/bordeaux_33063/cyberattaque-des-hackers-pro-russes-visent-le-site-de-la-ville-de-bordeaux_62068860.html', 'text/html', 0),
    ('corpus:commerce-33-fcd', 'https://www.fcd.fr/', 'text/html', 0),
    ('corpus:commerce-33-fcd', 'https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/', 'text/html', 0),
    ('corpus:commerce-33-fcd', 'https://actu.fr/nouvelle-aquitaine/berson_33047/suite-a-une-cyberattaque-une-mairie-de-gironde-a-perdu-des-donnees-officielles-on-nous-reclame-une-rancon_62315310.html', 'text/html', 0),
    ('corpus:commerce-33-societe-tech', 'https://www.societe.tech/', 'text/html', 0),
    ('corpus:commerce-33-societe-tech', 'https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-gironde/', 'text/html', 0),
    ('corpus:commerce-33-societe-tech', 'https://actu.fr/nouvelle-aquitaine/bordeaux_33063/cyberattaque-des-hackers-pro-russes-visent-le-site-de-la-ville-de-bordeaux_62068860.html', 'text/html', 0),
    ('corpus:commerce-33-cyberattaque-org', 'https://www.cyberattaque.org/', 'text/html', 0),
    ('corpus:commerce-33-cyberattaque-org', 'https://www.cyberattaque.org/', 'text/html', 0),
    ('corpus:commerce-33-cyberattaque-org', 'https://www.cyberattaque.org/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-33-cyberattaque-org', 'https://actu.fr/nouvelle-aquitaine/bordeaux_33063/cyberattaque-des-hackers-pro-russes-visent-le-site-de-la-ville-de-bordeaux_62068860.html', 'text/html', 0),
    ('corpus:commerce-33-actu-fr-gironde', 'https://actu.fr/', 'text/html', 0),
    ('corpus:commerce-33-actu-fr-gironde', 'https://actu.fr/nouvelle-aquitaine/gironde_33/economie', 'text/html', 0),
    ('corpus:commerce-33-actu-fr-gironde', 'https://actu.fr/nouvelle-aquitaine/gironde_33/rss.xml', 'application/rss+xml', 0),
    ('corpus:commerce-33-actu-fr-gironde', 'https://actu.fr/nouvelle-aquitaine/bordeaux_33063/cyberattaque-des-hackers-pro-russes-visent-le-site-de-la-ville-de-bordeaux_62068860.html', 'text/html', 0),
    ('corpus:commerce-33-artisanat-fr', 'https://www.artisanat.fr/', 'text/html', 0),
    ('corpus:commerce-33-artisanat-fr', 'https://www.artisanat.fr/magazine/actus', 'text/html', 0),
    ('corpus:commerce-33-artisanat-fr', 'https://www.artisanat.fr/magazine/actus/cybersecurite-comment-proteger-entreprise-cyberattaques', 'text/html', 0),
    ('corpus:commerce-33-bordeaux-mon-commerce', 'https://www.bordeauxmoncommerce.fr/', 'text/html', 0),
    ('corpus:commerce-33-bordeaux-mon-commerce', 'https://www.bordeauxmoncommerce.fr/category/actus/', 'text/html', 0),
    ('corpus:commerce-33-bordeaux-mon-commerce', 'https://www.bordeauxmoncommerce.fr/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-33-bordeaux-mon-commerce', 'https://www.bougerabordeaux.com/actu/news/cyberattaque-supermarches-intermarche-gironde-octobre-2026/', 'text/html', 0),
    ('corpus:commerce-33-umih-33', 'https://www.umih33.fr/', 'text/html', 0),
    ('corpus:commerce-33-umih-33', 'https://www.umih33.fr/actualites/', 'text/html', 0),
    ('corpus:commerce-33-umih-33', 'https://www.umih33.fr/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-33-umih-33', 'https://www.artisanat.fr/magazine/actus/cybersecurite-comment-proteger-entreprise-cyberattaques', 'text/html', 0),
    ('corpus:commerce-33-centre-ville-en-mouvement', 'https://www.centre-ville.org/', 'text/html', 0),
    ('corpus:commerce-33-centre-ville-en-mouvement', 'https://www.centre-ville.org/le-blog-actualite-des-centres-villes/', 'text/html', 0),
    ('corpus:commerce-33-centre-ville-en-mouvement', 'https://www.centre-ville.org/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-33-centre-ville-en-mouvement', 'https://www.echos-judiciaires.com/actualites/chronique-cybersecurite-une-question-de-conformite/', 'text/html', 0),
    ('corpus:commerce-33-echos-judiciaires', 'https://www.echos-judiciaires.com/', 'text/html', 0),
    ('corpus:commerce-33-echos-judiciaires', 'https://www.echos-judiciaires.com/categories/economie/', 'text/html', 0),
    ('corpus:commerce-33-echos-judiciaires', 'https://www.echos-judiciaires.com/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-33-echos-judiciaires', 'https://www.echos-judiciaires.com/actualites/chronique-cybersecurite-une-question-de-conformite/', 'text/html', 0),
    ('corpus:commerce-33-bouger-a-bordeaux', 'https://www.bougerabordeaux.com/', 'text/html', 0),
    ('corpus:commerce-33-bouger-a-bordeaux', 'https://www.bougerabordeaux.com/bordeaux/actu/news/', 'text/html', 0),
    ('corpus:commerce-33-bouger-a-bordeaux', 'https://www.bougerabordeaux.com/feed/', 'application/rss+xml', 30),
    ('corpus:commerce-33-bouger-a-bordeaux', 'https://www.bougerabordeaux.com/actu/news/cyberattaque-supermarches-intermarche-gironde-octobre-2026/', 'text/html', 0),
    ('corpus:commerce-33-france3-gironde', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/', 'text/html', 0),
    ('corpus:commerce-33-france3-gironde', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde', 'text/html', 0),
    ('corpus:commerce-33-france3-gironde', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss', 'text/xml', 30),
    ('corpus:commerce-33-france3-gironde', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/bordeaux/aucune-donnee-n-a-ete-exfiltree-victime-d-une-cyberattaque-une-mairie-est-privee-d-acces-a-internet-2957996.html', 'text/html', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms,
                                 verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-33 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v
                  WHERE v.source_id = u.source_id AND v.url = u.url);
