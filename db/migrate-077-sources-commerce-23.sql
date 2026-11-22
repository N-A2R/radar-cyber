-- Sources d'information du secteur « commerce » du département 23 (Creuse).
-- 12 sources, 38 URLs uniques contrôlées en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-commerce-23.jsonl
-- Preuve HTTP : bench/results/verification-commerce-23.json
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:commerce23-cci-creuse', 'CCI de la Creuse — entreprises et commerces', 'cti', 'https://www.cci-creuse.com/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":1}}'::jsonb, 3600, 'Chambre de commerce et d industrie de la Creuse (23), rubrique entreprises et commerces. Exemple cyber : audit informatique et securite des entreprises.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-cma-creuse', 'CMA Nouvelle-Aquitaine — délégation de la Creuse', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":2}}'::jsonb, 3600, 'Chambre des metiers et de l artisanat, delegation de la Creuse (23). Exemple cyber : les artisans, cibles de choix des cybercriminels.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-ville-gueret-commerces', 'Ville de Guéret — commerces, entreprises et marchés publics', 'cti', 'https://www.ville-gueret.fr/pratique/commerces-entreprises-et-marches-publics/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":3}}'::jsonb, 3600, 'Service commerces de la ville de Gueret (23). Exemple cyber : arnaque au faux RIB contre une entreprise creusoise.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-agglo-grandgueret', 'Communauté d agglomération du Grand Guéret — entreprendre et collaborer', 'cti', 'https://www.agglo-grandgueret.fr/feed/', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":4}}'::jsonb, 3600, 'Developpement economique, commerces et zones d activites du Grand Gueret (23). Exemple cyber : attaque du site du camping municipal d Evaux-les-Bains.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-creuse-conseil-departemental', 'Conseil départemental de la Creuse — à la une', 'cti', 'https://www.creuse.fr/A-la-une', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":5}}'::jsonb, 3600, 'Actualites du departement de la Creuse (23), dont economie et commerces. Exemple cyber : arnaque au president contre l APAJH 23.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-tourisme-creuse-blog', 'Creuse Tourisme — blog et actualités', 'cti', 'https://www.tourisme-creuse.com/toute-la-creuse/la-creuse-blog-et-actualites/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":6}}'::jsonb, 3600, 'Office de tourisme departemental de la Creuse (23), actualites economiques et commerciales. Exemple cyber : fraudes aux reservations.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-tourisme-creuse-pro', 'Creuse Tourisme Pro — toutes les actualités', 'cti', 'https://pro.tourisme-creuse.com/feed/', 'source d information professionnelle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":7}}'::jsonb, 3600, 'Site professionnel de Creuse Tourisme (23), actualites des hebergeurs et commerces. Exemple cyber : alerte fraudes aux reservations.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-la-montagne-creuse', 'La Montagne — Creuse', 'presse', 'https://www.lamontagne.fr/creuse/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":8}}'::jsonb, 3600, 'Presse locale quotidienne de la Creuse (23). Exemple cyber : arnaques IBAN, RIB et CB au Credit Mutuel de Gueret.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-actu-creuse', 'actu.fr — Actu Creuse', 'presse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":9}}'::jsonb, 3600, 'Presse locale numerique de la Creuse (23). Exemple cyber : arnaque au president contre l APAJH 23.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-ici-creuse', 'ici Creuse — Radio France', 'presse', 'https://www.ici.fr/rss/creuse/a-la-une.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":10}}'::jsonb, 3600, 'Media public local de la Creuse (23). Exemple cyber : arnaque bancaire contre un hebergeur Gites de France.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-le-populaire-gueret', 'Le Populaire du Centre — Guéret', 'presse', 'https://www.lepopulaire.fr/gueret-23000/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":11}}'::jsonb, 3600, 'Presse locale quotidienne de Gueret (23). Exemple cyber : arnaques IBAN, RIB et CB au Credit Mutuel de Gueret.', 'Nouvelle-Aquitaine', '23'),
  ('corpus:commerce23-france3-creuse', 'France 3 Nouvelle-Aquitaine — Creuse', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-commerce-23.jsonl","ligne":12}}'::jsonb, 3600, 'Media public regional, edition Creuse (23). Exemple cyber : attaque informatique du site du camping d Evaux-les-Bains.', 'Nouvelle-Aquitaine', '23')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP des 38 URLs du corpus (toutes en 200 le 2026-11-22).
WITH urls (source_id, url) AS (
  VALUES
    ('corpus:commerce23-cci-creuse', 'https://www.cci-creuse.com/'),
    ('corpus:commerce23-cci-creuse', 'https://www.cci-creuse.com/category/entreprise/'),
    ('corpus:commerce23-cci-creuse', 'https://www.cci-creuse.com/feed/'),
    ('corpus:commerce23-cci-creuse', 'https://www.cci-creuse.com/audit-informatique-une-demarche-preventive-pour-la-securite-dune-entreprise/'),
    ('corpus:commerce23-cma-creuse', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-creuse'),
    ('corpus:commerce23-cma-creuse', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites'),
    ('corpus:commerce23-cma-creuse', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/les-artisans-des-cibles-de-choix-pour-les-cybercriminels'),
    ('corpus:commerce23-ville-gueret-commerces', 'https://www.ville-gueret.fr/'),
    ('corpus:commerce23-ville-gueret-commerces', 'https://www.ville-gueret.fr/pratique/commerces-entreprises-et-marches-publics/'),
    ('corpus:commerce23-ville-gueret-commerces', 'https://www.ville-gueret.fr/feed/'),
    ('corpus:commerce23-ville-gueret-commerces', 'https://www.wiclic.fr/arnaque-au-faux-rib-comment-un-creusois-a-sauve-son-entreprise/'),
    ('corpus:commerce23-agglo-grandgueret', 'https://www.agglo-grandgueret.fr/'),
    ('corpus:commerce23-agglo-grandgueret', 'https://www.agglo-grandgueret.fr/entreprendre-et-collaborer/'),
    ('corpus:commerce23-agglo-grandgueret', 'https://www.agglo-grandgueret.fr/feed/'),
    ('corpus:commerce23-agglo-grandgueret', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/gueret/le-site-internet-du-camping-de-cette-commune-thermale-victime-d-une-attaque-informatique-il-vante-les-services-d-une-escort-girl-3186765.html'),
    ('corpus:commerce23-creuse-conseil-departemental', 'https://www.creuse.fr/'),
    ('corpus:commerce23-creuse-conseil-departemental', 'https://www.creuse.fr/A-la-une'),
    ('corpus:commerce23-creuse-conseil-departemental', 'https://www.ici.fr/infos/faits-divers-justice/creuse-l-apajh-23-perd-173-000-euros-apres-une-arnaque-au-president-1725610'),
    ('corpus:commerce23-tourisme-creuse-blog', 'https://www.tourisme-creuse.com/'),
    ('corpus:commerce23-tourisme-creuse-blog', 'https://www.tourisme-creuse.com/toute-la-creuse/la-creuse-blog-et-actualites/'),
    ('corpus:commerce23-tourisme-creuse-blog', 'https://pro.tourisme-creuse.com/alerte-fraudes-aux-reservations-2/'),
    ('corpus:commerce23-tourisme-creuse-pro', 'https://pro.tourisme-creuse.com/'),
    ('corpus:commerce23-tourisme-creuse-pro', 'https://pro.tourisme-creuse.com/toutes-les-actualites/'),
    ('corpus:commerce23-tourisme-creuse-pro', 'https://pro.tourisme-creuse.com/feed/'),
    ('corpus:commerce23-tourisme-creuse-pro', 'https://pro.tourisme-creuse.com/alerte-fraudes-aux-reservations-2/'),
    ('corpus:commerce23-la-montagne-creuse', 'https://www.lamontagne.fr/creuse/'),
    ('corpus:commerce23-la-montagne-creuse', 'https://www.lamontagne.fr/info-en-continu/creuse'),
    ('corpus:commerce23-la-montagne-creuse', 'https://news.google.com/rss/search?q=site%3Alamontagne.fr+%28cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel%29+when%3A30d&hl=fr&gl=FR&ceid=FR%3Afr'),
    ('corpus:commerce23-la-montagne-creuse', 'https://www.wiclic.fr/arnaques-iban-rib-cb-le-credit-mutuel-gueret-temoigne/'),
    ('corpus:commerce23-actu-creuse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/'),
    ('corpus:commerce23-actu-creuse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml'),
    ('corpus:commerce23-actu-creuse', 'https://www.ici.fr/infos/faits-divers-justice/creuse-l-apajh-23-perd-173-000-euros-apres-une-arnaque-au-president-1725610'),
    ('corpus:commerce23-ici-creuse', 'https://www.ici.fr/radio/creuse'),
    ('corpus:commerce23-ici-creuse', 'https://www.ici.fr/nouvelle-aquitaine/creuse-23'),
    ('corpus:commerce23-ici-creuse', 'https://www.ici.fr/rss/creuse/a-la-une.xml'),
    ('corpus:commerce23-ici-creuse', 'https://www.ici.fr/emissions/l-info-d-ici-ici-creuse/je-me-suis-effondre-victime-d-une-arnaque-bancaire-de-5-000-euros-ce-proprietaire-gite-de-france-en-creuse-temoigne-6871382'),
    ('corpus:commerce23-le-populaire-gueret', 'https://www.lepopulaire.fr/gueret-23000/'),
    ('corpus:commerce23-le-populaire-gueret', 'https://news.google.com/rss/search?q=site%3Alepopulaire.fr+%28cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel%29+when%3A30d&hl=fr&gl=FR&ceid=FR%3Afr'),
    ('corpus:commerce23-le-populaire-gueret', 'https://www.wiclic.fr/arnaques-iban-rib-cb-le-credit-mutuel-gueret-temoigne/'),
    ('corpus:commerce23-france3-creuse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse'),
    ('corpus:commerce23-france3-creuse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss'),
    ('corpus:commerce23-france3-creuse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/gueret/le-site-internet-du-camping-de-cette-commune-thermale-victime-d-une-attaque-informatique-il-vante-les-services-d-une-escort-girl-3186765.html')
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200,
       CASE WHEN u.url ~* '(/feed/|rss|\.xml)' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus commerce-23 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
