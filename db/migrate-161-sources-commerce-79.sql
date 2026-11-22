-- Sources d'information du secteur « commerce » du département 79 (Deux-Sèvres).
-- 20 sources, 54 URL de sources contrôlées en HTTP 200 le 2026-11-22
-- (GET avec User-Agent navigateur, redirections suivies, 13 flux avec items ;
-- 4 articles cyber également vérifiés).
-- Corpus détaillé : bench/corpus/sources-commerce-79.jsonl
-- Preuve HTTP : bench/results/verification-sources-commerce-79.json

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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:commerce-79-cma-nouvelle-aquitaine-actualites-de-l-artisanat-et-des-commerces-co', 'CMA Nouvelle-Aquitaine — actualités de l’artisanat et des commerces (couvre le 79)', 'presse', 'https://cma-nouvelleaquitaine.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 1'),
  ('corpus:commerce-79-cpme-79-confederation-des-petites-et-moyennes-entreprises-des-deux-s', 'CPME 79 — Confédération des petites et moyennes entreprises des Deux-Sèvres', 'presse', 'https://www.cpme79.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 2'),
  ('corpus:commerce-79-medef-deux-sevres-actualites-des-entreprises', 'MEDEF Deux-Sèvres — actualités des entreprises', 'presse', 'https://www.medef79.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 3'),
  ('corpus:commerce-79-u2p-union-des-entreprises-de-proximite-artisans-commercants-79', 'U2P — Union des entreprises de proximité (artisans, commerçants, 79)', 'presse', 'https://u2p-france.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 4'),
  ('corpus:commerce-79-deuxsevres-fr-annuaire-des-professionnels-et-actualites-des-deux-sev', 'Deuxsevres.fr — annuaire des professionnels et actualités des Deux-Sèvres', 'presse', 'https://www.deuxsevres.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 5'),
  ('corpus:commerce-79-ville-de-niort-actualites-et-service-commerce-du-centre-ville', 'Ville de Niort — actualités et service commerce du centre-ville', 'presse', 'https://www.vivre-a-niort.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 6'),
  ('corpus:commerce-79-niort-agglo-toutes-les-actualites-et-filiere-commerce', 'Niort Agglo — toutes les actualités et filière commerce', 'presse', 'https://www.niortagglo.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 7'),
  ('corpus:commerce-79-agglomeration-du-bocage-bressuirais-agglo-2b-actualites', 'Agglomération du Bocage Bressuirais (Agglo 2B) — actualités', 'presse', 'https://www.agglo2b.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 8'),
  ('corpus:commerce-79-communaute-de-communes-parthenay-gatine-actualites', 'Communauté de communes Parthenay-Gâtine — actualités', 'presse', 'https://www.cc-parthenay-gatine.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 9'),
  ('corpus:commerce-79-maison-de-l-emploi-et-des-entreprises-de-parthenay-et-gatine', 'Maison de l’Emploi et des Entreprises de Parthenay et Gâtine', 'presse', 'https://www.mdee-parthenaygatine.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 10'),
  ('corpus:commerce-79-niort-marais-poitevin-tourisme-actualites-infos-metiers', 'Niort Marais Poitevin Tourisme — actualités infos métiers', 'presse', 'https://www.niortmaraispoitevin.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 11'),
  ('corpus:commerce-79-niort-info-rubrique-commerce-local', 'Niort info — rubrique Commerce local', 'presse', 'https://niortinfo.media/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 12'),
  ('corpus:commerce-79-la-nouvelle-republique-edition-deux-sevres-economie-et-commerce', 'La Nouvelle République — édition Deux-Sèvres (économie et commerce)', 'presse', 'https://www.lanouvellerepublique.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 13'),
  ('corpus:commerce-79-la-nouvelle-republique-edition-niort-economie-et-commerce', 'La Nouvelle République — édition Niort (économie et commerce)', 'presse', 'https://www.lanouvellerepublique.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 14'),
  ('corpus:commerce-79-actu-fr-actu-deux-sevres-filtre-geographique-79', 'actu.fr — Actu Deux-Sèvres (filtre géographique 79)', 'presse', 'https://actu.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 15'),
  ('corpus:commerce-79-actu-fr-actu-niort', 'actu.fr — Actu Niort', 'presse', 'https://actu.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 16'),
  ('corpus:commerce-79-ici-poitou-radio-france-actualites-de-la-region-niortaise', 'ICI Poitou (Radio France) — actualités de la région niortaise', 'presse', 'https://www.ici.fr/radio/poitou', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 17'),
  ('corpus:commerce-79-radio-gatine-actualites-de-parthenay-et-du-nord-des-deux-sevres', 'Radio Gâtine — actualités de Parthenay et du nord des Deux-Sèvres', 'presse', 'https://radiogatine.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 18'),
  ('corpus:commerce-79-rcf-poitou-deux-sevres-actualite-du-departement', 'RCF Poitou Deux-Sèvres — actualité du département', 'presse', 'https://www.rcf.fr/poitou-deuxsevres', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 19'),
  ('corpus:commerce-79-inforadar-fil-deux-sevres', 'InfoRadar — fil Deux-Sèvres', 'presse', 'https://inforadar.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-79.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source commerce — Deux-Sèvres (79) ; corpus ligne 20')
ON CONFLICT (id) DO NOTHING;

WITH urls(source_id, url, content_type, items) AS (
VALUES
    ('corpus:commerce-79-cma-nouvelle-aquitaine-actualites-de-l-artisanat-et-des-commerces-co', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-cma-nouvelle-aquitaine-actualites-de-l-artisanat-et-des-commerces-co', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-cpme-79-confederation-des-petites-et-moyennes-entreprises-des-deux-s', 'https://www.cpme79.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-cpme-79-confederation-des-petites-et-moyennes-entreprises-des-deux-s', 'https://www.cpme79.fr/Actualites', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-cpme-79-confederation-des-petites-et-moyennes-entreprises-des-deux-s', 'https://www.cpme79.fr/spip.php?page=backend', 'text/xml; charset=utf-8', 10),
    ('corpus:commerce-79-medef-deux-sevres-actualites-des-entreprises', 'https://www.medef79.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-medef-deux-sevres-actualites-des-entreprises', 'https://www.medef79.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-u2p-union-des-entreprises-de-proximite-artisans-commercants-79', 'https://u2p-france.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-u2p-union-des-entreprises-de-proximite-artisans-commercants-79', 'https://u2p-france.fr/search', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-u2p-union-des-entreprises-de-proximite-artisans-commercants-79', 'https://u2p-france.fr/rss.xml', 'application/rss+xml; charset=utf-8', 162),
    ('corpus:commerce-79-deuxsevres-fr-annuaire-des-professionnels-et-actualites-des-deux-sev', 'https://www.deuxsevres.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-deuxsevres-fr-annuaire-des-professionnels-et-actualites-des-deux-sev', 'https://www.deuxsevres.fr/nav-newsactus', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-ville-de-niort-actualites-et-service-commerce-du-centre-ville', 'https://www.vivre-a-niort.com/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-ville-de-niort-actualites-et-service-commerce-du-centre-ville', 'https://www.vivre-a-niort.com/actualites/index.html', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-ville-de-niort-actualites-et-service-commerce-du-centre-ville', 'https://www.vivre-a-niort.com/news.xml', 'application/rss+xml;charset=utf-8', 30),
    ('corpus:commerce-79-niort-agglo-toutes-les-actualites-et-filiere-commerce', 'https://www.niortagglo.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-niort-agglo-toutes-les-actualites-et-filiere-commerce', 'https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-niort-agglo-toutes-les-actualites-et-filiere-commerce', 'https://www.niortagglo.fr/rss.xml', 'application/rss+xml;charset=utf-8', 30),
    ('corpus:commerce-79-agglomeration-du-bocage-bressuirais-agglo-2b-actualites', 'https://www.agglo2b.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-agglomeration-du-bocage-bressuirais-agglo-2b-actualites', 'https://www.agglo2b.fr/actus', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-agglomeration-du-bocage-bressuirais-agglo-2b-actualites', 'https://www.agglo2b.fr/?format=feed&type=rss', 'application/rss+xml; charset=utf-8', 0),
    ('corpus:commerce-79-communaute-de-communes-parthenay-gatine-actualites', 'https://www.cc-parthenay-gatine.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-communaute-de-communes-parthenay-gatine-actualites', 'https://www.cc-parthenay-gatine.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-communaute-de-communes-parthenay-gatine-actualites', 'https://www.cc-parthenay-gatine.fr/actualites/rss', 'text/xml;charset=utf-8', 284),
    ('corpus:commerce-79-maison-de-l-emploi-et-des-entreprises-de-parthenay-et-gatine', 'https://www.mdee-parthenaygatine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-maison-de-l-emploi-et-des-entreprises-de-parthenay-et-gatine', 'https://www.mdee-parthenaygatine.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-maison-de-l-emploi-et-des-entreprises-de-parthenay-et-gatine', 'https://www.mdee-parthenaygatine.fr/feed/', 'application/rss+xml', 10),
    ('corpus:commerce-79-niort-marais-poitevin-tourisme-actualites-infos-metiers', 'https://www.niortmaraispoitevin.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-niort-marais-poitevin-tourisme-actualites-infos-metiers', 'https://www.niortmaraispoitevin.com/espace-pro/actualites-infos-metiers/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-niort-info-rubrique-commerce-local', 'https://niortinfo.media/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-niort-info-rubrique-commerce-local', 'https://niortinfo.media/category/commerce-local/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-niort-info-rubrique-commerce-local', 'https://niortinfo.media/category/commerce-local/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:commerce-79-la-nouvelle-republique-edition-deux-sevres-economie-et-commerce', 'https://www.lanouvellerepublique.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-la-nouvelle-republique-edition-deux-sevres-economie-et-commerce', 'https://www.lanouvellerepublique.fr/deux-sevres/economie', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-la-nouvelle-republique-edition-deux-sevres-economie-et-commerce', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'application/rss+xml; charset=UTF-8', 40),
    ('corpus:commerce-79-la-nouvelle-republique-edition-niort-economie-et-commerce', 'https://www.lanouvellerepublique.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-la-nouvelle-republique-edition-niort-economie-et-commerce', 'https://www.lanouvellerepublique.fr/niort/economie', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-la-nouvelle-republique-edition-niort-economie-et-commerce', 'https://www.lanouvellerepublique.fr/api/v1/rss/6705263824a8a983658b456c', 'application/rss+xml; charset=UTF-8', 40),
    ('corpus:commerce-79-actu-fr-actu-deux-sevres-filtre-geographique-79', 'https://actu.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-actu-fr-actu-deux-sevres-filtre-geographique-79', 'https://actu.fr/pays-de-la-loire/deux-sevres_79/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-actu-fr-actu-deux-sevres-filtre-geographique-79', 'https://actu.fr/rss.xml', 'application/rss+xml; charset=utf-8', 30),
    ('corpus:commerce-79-actu-fr-actu-niort', 'https://actu.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-actu-fr-actu-niort', 'https://actu.fr/nouvelle-aquitaine/niort_79191', 'text/html; charset=utf-8', 0),
    ('corpus:commerce-79-actu-fr-actu-niort', 'https://actu.fr/rss.xml', 'application/rss+xml; charset=utf-8', 30),
    ('corpus:commerce-79-ici-poitou-radio-france-actualites-de-la-region-niortaise', 'https://www.ici.fr/radio/poitou', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-ici-poitou-radio-france-actualites-de-la-region-niortaise', 'https://www.ici.fr/radio/poitou', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-ici-poitou-radio-france-actualites-de-la-region-niortaise', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:commerce-79-radio-gatine-actualites-de-parthenay-et-du-nord-des-deux-sevres', 'https://radiogatine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-radio-gatine-actualites-de-parthenay-et-du-nord-des-deux-sevres', 'https://radiogatine.fr/news/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-radio-gatine-actualites-de-parthenay-et-du-nord-des-deux-sevres', 'https://radiogatine.fr/rss-feed-1', 'text/xml; charset=UTF-8', 15),
    ('corpus:commerce-79-rcf-poitou-deux-sevres-actualite-du-departement', 'https://www.rcf.fr/poitou-deuxsevres', 'text/html;charset=utf-8', 0),
    ('corpus:commerce-79-rcf-poitou-deux-sevres-actualite-du-departement', 'https://www.rcf.fr/poitou-deuxsevres', 'text/html;charset=utf-8', 0),
    ('corpus:commerce-79-inforadar-fil-deux-sevres', 'https://inforadar.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:commerce-79-inforadar-fil-deux-sevres', 'https://inforadar.fr/tag/deux-sevres', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', 'ok200',
       'Corpus commerce-79 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
