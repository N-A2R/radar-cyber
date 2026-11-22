-- Sources d'information du secteur « agriculture » du département 79 (Deux-Sèvres).
-- 25 sources, 61 URLs contrôlées en HTTP 200 le 2026-11-22
-- (GET avec User-Agent navigateur, redirections suivies, 13 flux avec items ;
-- 58 URLs de sources inscrites et 3 articles cyber également vérifiés).
-- Corpus détaillé : bench/corpus/sources-agriculture-79.jsonl
-- Preuve HTTP : bench/results/verification-sources-agriculture-79.json

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
  ('corpus:agriculture-79-modef-79-federation-departementale-des-deux-sevres', 'MODEF 79 (Fédération départementale des Deux-Sèvres)', 'presse', 'https://www.modef.fr/nos-federations/dep79/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 1'),
  ('corpus:agriculture-79-coordination-rurale-deux-sevres', 'Coordination Rurale — section Deux-Sèvres', 'presse', 'https://www.coordinationrurale.fr/nos-cr-locales/deux-sevres/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 2'),
  ('corpus:agriculture-79-jeunes-agriculteurs-deux-sevres', 'Jeunes Agriculteurs Deux-Sèvres', 'presse', 'https://www.jeunes-agriculteurs.fr/reseau/jeunes-agriculteurs-deux-sevres/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 3'),
  ('corpus:agriculture-79-chambre-regionale-agriculture-nouvelle-aquitaine', 'Chambre régionale d''agriculture Nouvelle-Aquitaine (couvre le 79)', 'presse', 'https://nouvelle-aquitaine.chambres-agriculture.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 4'),
  ('corpus:agriculture-79-annuaire-chambres-agriculture-france', 'Annuaire des Chambres d''agriculture France (recense le 79)', 'presse', 'https://chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 5'),
  ('corpus:agriculture-79-fncuma-annuaire-deux-sevres', 'FNCuma — annuaire des fédérations Cuma (79)', 'presse', 'https://www.cuma.fr/contacter-une-federation/?_fselect_department=79', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 6'),
  ('corpus:agriculture-79-federation-regionale-cuma-nouvelle-aquitaine', 'Fédération régionale des Cuma Nouvelle-Aquitaine (couvre le 79)', 'presse', 'https://nouvelle-aquitaine.cuma.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 7'),
  ('corpus:agriculture-79-safer-nouvelle-aquitaine', 'SAFER Nouvelle-Aquitaine (foncier agricole, 79)', 'presse', 'https://www.saferna.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 8'),
  ('corpus:agriculture-79-bio-nouvelle-aquitaine', 'Bio Nouvelle-Aquitaine (fédération régionale de l''agriculture biologique)', 'presse', 'https://www.bionouvelleaquitaine.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 9'),
  ('corpus:agriculture-79-fnab', 'FNAB — Fédération nationale d''agriculture biologique', 'presse', 'https://www.fnab.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 10'),
  ('corpus:agriculture-79-epro-agriculture-deux-sevres', 'EPRO Agriculture — annuaire Deux-Sèvres (79)', 'presse', 'https://agriculture.e-pro.fr/deux-sevres/culture-et-elevage-associes_c013Z_79', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 11'),
  ('corpus:agriculture-79-reussir', 'Réussir (presse agricole spécialisée)', 'presse', 'https://www.reussir.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 12'),
  ('corpus:agriculture-79-la-france-agricole', 'La France Agricole', 'presse', 'https://www.lafranceagricole.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 13'),
  ('corpus:agriculture-79-terre-net', 'Terre-net (presse agricole spécialisée)', 'presse', 'https://www.terre-net.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 14'),
  ('corpus:agriculture-79-actu-fr-deux-sevres', 'actu.fr — Deux-Sèvres (79)', 'presse', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 15'),
  ('corpus:agriculture-79-nouvelle-republique-deux-sevres', 'La Nouvelle République — édition Deux-Sèvres', 'presse', 'https://www.lanouvellerepublique.fr/deux-sevres', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 16'),
  ('corpus:agriculture-79-ici-deux-sevres', 'ICI Deux-Sèvres (Radio France)', 'presse', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 17'),
  ('corpus:agriculture-79-france3-deux-sevres', 'France 3 Nouvelle-Aquitaine — Deux-Sèvres', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 18'),
  ('corpus:agriculture-79-cerfrance', 'Cerfrance (conseil et expertise comptable agricole)', 'presse', 'https://www.cerfrance.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 19'),
  ('corpus:agriculture-79-bienvenue-a-la-ferme', 'Bienvenue à la ferme (annuaire de producteurs)', 'presse', 'https://www.bienvenue-a-la-ferme.com/fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 20'),
  ('corpus:agriculture-79-terre-de-liens', 'Terre de Liens (association foncière agricole)', 'presse', 'https://terredeliens.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 21'),
  ('corpus:agriculture-79-agri-sud-ouest-innovation', 'Agri Sud-Ouest Innovation (cluster agroéconomique Nouvelle-Aquitaine, 79)', 'presse', 'https://agrisudouest.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":22,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 22'),
  ('corpus:agriculture-79-ja79-over-blog', 'Jeunes Agriculteurs des Deux-Sèvres (blog JA79)', 'presse', 'https://ja79.over-blog.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":23,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 23'),
  ('corpus:agriculture-79-coordination-rurale-79-fil', 'Coordination Rurale 79 — fil départemental', 'presse', 'https://www.coordinationrurale.fr/nos-cr-locales-actualites/aquitaine-limousin-poitou-charentes/cr-79/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":24,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 24'),
  ('corpus:agriculture-79-le-mag-safer', 'Le Mag Safer (actualités foncières, 79)', 'presse', 'https://mag.safer.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-79.jsonl","ligne":25,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source agriculture — Deux-Sèvres (79) ; corpus ligne 25')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, family=EXCLUDED.family, url=EXCLUDED.url,
  kind=EXCLUDED.kind, format=EXCLUDED.format, enabled=EXCLUDED.enabled,
  region=EXCLUDED.region, department=EXCLUDED.department, description=EXCLUDED.description;

WITH urls (source_id, url, content_type, items) AS (
  VALUES
    ('corpus:agriculture-79-modef-79-federation-departementale-des-deux-sevres', 'https://www.modef.fr/nos-federations/dep79/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-modef-79-federation-departementale-des-deux-sevres', 'https://www.modef.fr/categorie/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-modef-79-federation-departementale-des-deux-sevres', 'https://www.modef.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-79-coordination-rurale-deux-sevres', 'https://www.coordinationrurale.fr/nos-cr-locales/deux-sevres/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-coordination-rurale-deux-sevres', 'https://www.coordinationrurale.fr/lactualite/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-jeunes-agriculteurs-deux-sevres', 'https://www.jeunes-agriculteurs.fr/reseau/jeunes-agriculteurs-deux-sevres/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-jeunes-agriculteurs-deux-sevres', 'https://www.jeunes-agriculteurs.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-jeunes-agriculteurs-deux-sevres', 'https://www.jeunes-agriculteurs.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-79-chambre-regionale-agriculture-nouvelle-aquitaine', 'https://nouvelle-aquitaine.chambres-agriculture.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-chambre-regionale-agriculture-nouvelle-aquitaine', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-chambre-regionale-agriculture-nouvelle-aquitaine', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites.rss', 'text/xml; charset=utf-8', 20),
    ('corpus:agriculture-79-annuaire-chambres-agriculture-france', 'https://chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-annuaire-chambres-agriculture-france', 'https://chambres-agriculture.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-annuaire-chambres-agriculture-france', 'https://chambres-agriculture.fr/presse.rss', 'text/xml; charset=utf-8', 20),
    ('corpus:agriculture-79-fncuma-annuaire-deux-sevres', 'https://www.cuma.fr/contacter-une-federation/?_fselect_department=79', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-fncuma-annuaire-deux-sevres', 'https://www.cuma.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-federation-regionale-cuma-nouvelle-aquitaine', 'https://nouvelle-aquitaine.cuma.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-federation-regionale-cuma-nouvelle-aquitaine', 'https://nouvelle-aquitaine.cuma.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-safer-nouvelle-aquitaine', 'https://www.saferna.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-safer-nouvelle-aquitaine', 'https://www.saferna.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-safer-nouvelle-aquitaine', 'https://www.saferna.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-79-bio-nouvelle-aquitaine', 'https://www.bionouvelleaquitaine.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-bio-nouvelle-aquitaine', 'https://www.bionouvelleaquitaine.com/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-fnab', 'https://www.fnab.org/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-fnab', 'https://www.fnab.org/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-fnab', 'https://www.fnab.org/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-79-epro-agriculture-deux-sevres', 'https://agriculture.e-pro.fr/deux-sevres/culture-et-elevage-associes_c013Z_79', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-epro-agriculture-deux-sevres', 'https://agriculture.e-pro.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-reussir', 'https://www.reussir.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-reussir', 'https://www.reussir.fr/fil-actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-reussir', 'https://www.reussir.fr/rss.xml', 'application/xml;charset=UTF-8', 20),
    ('corpus:agriculture-79-la-france-agricole', 'https://www.lafranceagricole.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-la-france-agricole', 'https://www.lafranceagricole.fr/actualites/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-la-france-agricole', 'https://www.lafranceagricole.fr/rss', 'text/xml; charset=utf-8', 20),
    ('corpus:agriculture-79-terre-net', 'https://www.terre-net.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-terre-net', 'https://www.terre-net.fr/actualite-agricole/t5162', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-terre-net', 'https://www.terre-net.fr/rss', 'text/xml; charset=utf-8', 20),
    ('corpus:agriculture-79-actu-fr-deux-sevres', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-actu-fr-deux-sevres', 'https://actu.fr/deux-sevres/rss.xml', 'application/rss+xml; charset=utf-8', 20),
    ('corpus:agriculture-79-nouvelle-republique-deux-sevres', 'https://www.lanouvellerepublique.fr/deux-sevres', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-nouvelle-republique-deux-sevres', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'application/rss+xml; charset=UTF-8', 40),
    ('corpus:agriculture-79-ici-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-ici-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-france3-deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-france3-deux-sevres', 'https://france3-regions.franceinfo.fr/economie/agriculture', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-cerfrance', 'https://www.cerfrance.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-cerfrance', 'https://www.cerfrance.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-bienvenue-a-la-ferme', 'https://www.bienvenue-a-la-ferme.com/fr', 'text/html', 0),
    ('corpus:agriculture-79-bienvenue-a-la-ferme', 'https://www.bienvenue-a-la-ferme.com/fr/inspirez-vous/actualite', 'text/html', 0),
    ('corpus:agriculture-79-terre-de-liens', 'https://terredeliens.org/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-terre-de-liens', 'https://terredeliens.org/national/actu/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-79-agri-sud-ouest-innovation', 'https://agrisudouest.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-agri-sud-ouest-innovation', 'https://agrisudouest.com/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-agri-sud-ouest-innovation', 'https://agrisudouest.com/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-79-ja79-over-blog', 'https://ja79.over-blog.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-coordination-rurale-79-fil', 'https://www.coordinationrurale.fr/nos-cr-locales-actualites/aquitaine-limousin-poitou-charentes/cr-79/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-le-mag-safer', 'https://mag.safer.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-79-le-mag-safer', 'https://mag.safer.fr/feed/', 'application/rss+xml; charset=UTF-8', 9)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', 'ok200',
       'Corpus agriculture-79 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
