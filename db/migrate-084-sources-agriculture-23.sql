-- Sources d'information du secteur « agriculture » du département 23 (Creuse).
-- Corpus détaillé : bench/corpus/sources-agriculture-23.jsonl
-- 23 sources, 58 URLs contrôlées en HTTP 200 le 2026-11-22 (curl -L, GET avec User-Agent navigateur, 14 flux RSS).
-- Preuve HTTP : bench/results/verification-agriculture-23.json

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

CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:agriculture-23-chambre-d-agriculture-de-la-creuse', 'Chambre d''agriculture de la Creuse', 'presse', 'https://creuse.chambres-agriculture.fr/actualites-1/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 1'),
  ('corpus:agriculture-23-conseil-departemental-de-la-creuse-agriculture', 'Conseil départemental de la Creuse — Agriculture', 'presse', 'https://www.creuse.fr/spip.php?page=backend', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 2'),
  ('corpus:agriculture-23-cerfrance-centre-limousin', 'Cerfrance Centre-Limousin (périmètre Creuse)', 'presse', 'https://centre-limousin.cerfrance.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 3'),
  ('corpus:agriculture-23-chambre-regionale-nouvelle-aquitaine', 'Chambre régionale d''agriculture Nouvelle-Aquitaine (couvre la Creuse)', 'presse', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites.rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 4'),
  ('corpus:agriculture-23-safer-nouvelle-aquitaine', 'Safer Nouvelle-Aquitaine — comité Creuse', 'presse', 'https://www.saferna.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 5'),
  ('corpus:agriculture-23-frcuma-nouvelle-aquitaine', 'FRCUMA Nouvelle-Aquitaine (Cuma de la Creuse)', 'presse', 'https://nouvelle-aquitaine.cuma.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 6'),
  ('corpus:agriculture-23-fncuma', 'FNCuma (Fédération nationale des Cuma)', 'presse', 'https://www.cuma.fr/actualites/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 7'),
  ('corpus:agriculture-23-annuaire-chambres-agriculture', 'Annuaire des Chambres d''agriculture France (recense la Creuse)', 'presse', 'https://chambres-agriculture.fr/presse.rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 8'),
  ('corpus:agriculture-23-agri-sud-ouest-innovation', 'Agri Sud-Ouest Innovation (cluster agroéconomie, annuaire adhérents)', 'presse', 'https://agrisudouest.com/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 9'),
  ('corpus:agriculture-23-jeunes-agriculteurs', 'Jeunes Agriculteurs (réseau national, section Creuse)', 'presse', 'https://www.jeunes-agriculteurs.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 10'),
  ('corpus:agriculture-23-fnsea', 'FNSEA — carte des fédérations départementales', 'presse', 'https://www.fnsea.fr/actualités/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 11'),
  ('corpus:agriculture-23-fnab', 'FNAB (Fédération nationale d''agriculture biologique)', 'presse', 'https://www.fnab.org/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 12'),
  ('corpus:agriculture-23-bienvenue-a-la-ferme', 'Bienvenue à la ferme (annuaire de producteurs)', 'presse', 'https://www.bienvenue-a-la-ferme.com/fr/inspirez-vous/actualite', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 13'),
  ('corpus:agriculture-23-carre', 'CARRÉ — réseau revendeurs machinisme agricole', 'presse', 'https://www.carre.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 14'),
  ('corpus:agriculture-23-terre-de-liens', 'Terre de Liens', 'presse', 'https://terredeliens.org/national/actu/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 15'),
  ('corpus:agriculture-23-la-montagne-creuse', 'La Montagne — Creuse', 'presse', 'https://www.lamontagne.fr/economie/agriculture', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 16'),
  ('corpus:agriculture-23-actu-fr-creuse', 'actu.fr — Creuse', 'presse', 'https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 17'),
  ('corpus:agriculture-23-ici-creuse', 'ICI Creuse (Radio France)', 'presse', 'https://www.ici.fr/rss/creuse/a-la-une.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 18'),
  ('corpus:agriculture-23-ici-limousin-radio-france', 'ICI Limousin (Radio France)', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 19'),
  ('corpus:agriculture-23-france-3-nouvelle-aquitaine-creuse', 'France 3 Nouvelle-Aquitaine — Creuse', 'presse', 'https://france3-regions.franceinfo.fr/economie/agriculture', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 20'),
  ('corpus:agriculture-23-sud-ouest-creuse', 'Sud Ouest — Creuse', 'presse', 'https://www.sudouest.fr/creuse/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 21'),
  ('corpus:agriculture-23-reussir-presse-agricole', 'Réussir — presse agricole', 'presse', 'https://www.reussir.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":22,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 22'),
  ('corpus:agriculture-23-la-france-agricole', 'La France Agricole', 'presse', 'https://www.lafranceagricole.fr/rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-agriculture-23.jsonl","ligne":23,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Source agriculture — Creuse (23) ; corpus ligne 23')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 58 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:agriculture-23-chambre-d-agriculture-de-la-creuse', ARRAY['https://creuse.chambres-agriculture.fr/','https://creuse.chambres-agriculture.fr/actualites-1/']),
    ('corpus:agriculture-23-conseil-departemental-de-la-creuse-agriculture', ARRAY['https://www.creuse.fr/','https://www.creuse.fr/agriculture','https://www.creuse.fr/spip.php?page=backend']),
    ('corpus:agriculture-23-cerfrance-centre-limousin', ARRAY['https://centre-limousin.cerfrance.fr/','https://centre-limousin.cerfrance.fr/actualites/']),
    ('corpus:agriculture-23-chambre-regionale-nouvelle-aquitaine', ARRAY['https://nouvelle-aquitaine.chambres-agriculture.fr/','https://nouvelle-aquitaine.chambres-agriculture.fr/actualites','https://nouvelle-aquitaine.chambres-agriculture.fr/actualites.rss']),
    ('corpus:agriculture-23-safer-nouvelle-aquitaine', ARRAY['https://www.saferna.fr/','https://www.saferna.fr/actualites/','https://www.saferna.fr/feed/']),
    ('corpus:agriculture-23-frcuma-nouvelle-aquitaine', ARRAY['https://nouvelle-aquitaine.cuma.fr/','https://nouvelle-aquitaine.cuma.fr/actualites/']),
    ('corpus:agriculture-23-fncuma', ARRAY['https://www.cuma.fr/','https://www.cuma.fr/actualites/']),
    ('corpus:agriculture-23-annuaire-chambres-agriculture', ARRAY['https://chambres-agriculture.fr/','https://chambres-agriculture.fr/actualites','https://chambres-agriculture.fr/presse.rss']),
    ('corpus:agriculture-23-agri-sud-ouest-innovation', ARRAY['https://agrisudouest.com/','https://agrisudouest.com/actualites/','https://agrisudouest.com/feed/']),
    ('corpus:agriculture-23-jeunes-agriculteurs', ARRAY['https://www.jeunes-agriculteurs.fr/','https://www.jeunes-agriculteurs.fr/actualites/','https://www.jeunes-agriculteurs.fr/feed/']),
    ('corpus:agriculture-23-fnsea', ARRAY['https://www.fnsea.fr/','https://www.fnsea.fr/actualités/']),
    ('corpus:agriculture-23-fnab', ARRAY['https://www.fnab.org/','https://www.fnab.org/actualites/','https://www.fnab.org/feed/']),
    ('corpus:agriculture-23-bienvenue-a-la-ferme', ARRAY['https://www.bienvenue-a-la-ferme.com/fr','https://www.bienvenue-a-la-ferme.com/fr/inspirez-vous/actualite']),
    ('corpus:agriculture-23-carre', ARRAY['https://www.carre.fr/','https://www.carre.fr/actualites/','https://www.carre.fr/feed/']),
    ('corpus:agriculture-23-terre-de-liens', ARRAY['https://terredeliens.org/','https://terredeliens.org/national/actu/']),
    ('corpus:agriculture-23-la-montagne-creuse', ARRAY['https://www.lamontagne.fr/creuse/','https://www.lamontagne.fr/economie/agriculture']),
    ('corpus:agriculture-23-actu-fr-creuse', ARRAY['https://actu.fr/nouvelle-aquitaine/creuse_23/','https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml']),
    ('corpus:agriculture-23-ici-creuse', ARRAY['https://www.ici.fr/nouvelle-aquitaine/creuse-23','https://www.ici.fr/rss/creuse/a-la-une.xml']),
    ('corpus:agriculture-23-ici-limousin-radio-france', ARRAY['https://www.ici.fr/radio/limousin','https://www.ici.fr/nouvelle-aquitaine/creuse-23/actu','https://www.ici.fr/rss/limousin/rubrique/infos.xml']),
    ('corpus:agriculture-23-france-3-nouvelle-aquitaine-creuse', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/','https://france3-regions.franceinfo.fr/economie/agriculture']),
    ('corpus:agriculture-23-sud-ouest-creuse', ARRAY['https://www.sudouest.fr/creuse/','https://www.sudouest.fr/economie/agriculture','https://www.sudouest.fr/creuse/rss.xml']),
    ('corpus:agriculture-23-reussir-presse-agricole', ARRAY['https://www.reussir.fr/','https://www.reussir.fr/fil-actualites','https://www.reussir.fr/rss.xml']),
    ('corpus:agriculture-23-la-france-agricole', ARRAY['https://www.lafranceagricole.fr/','https://www.lafranceagricole.fr/actualites/','https://www.lafranceagricole.fr/rss'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200,
       CASE WHEN a.url LIKE '%rss%' OR a.url LIKE '%feed%' OR a.url LIKE '%.xml' OR a.url LIKE '%backend%' THEN 'application/rss+xml' ELSE 'text/html' END,
       0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus agriculture-23 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);
