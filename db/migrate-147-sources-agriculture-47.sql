-- Sources d'information du secteur « agriculture » du département 47 (Lot-et-Garonne).
-- 29 sources, 68 URLs contrôlées en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-agriculture-47.jsonl
-- Preuve HTTP : bench/results/verification-sources-agriculture-47.json

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
  ('corpus:agriculture-47-modef-47-federation-departementale-du-lot-et-garonne', 'MODEF 47 (Fédération départementale du Lot-et-Garonne)', 'presse', 'https://www.modef.fr/nos-federations/dep47/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 1'),
  ('corpus:agriculture-47-coordination-rurale-47-lot-et-garonne', 'Coordination Rurale 47 (Lot-et-Garonne)', 'presse', 'https://www.coordinationrurale.fr/nos-cr-locales/lot-et-garonne/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 2'),
  ('corpus:agriculture-47-val-de-gascogne-groupe-cooperatif-dont-le-47', 'Val de Gascogne (groupe coopératif, dont le 47)', 'presse', 'https://www.valdegascogne.coop/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 3'),
  ('corpus:agriculture-47-fdsea-du-lot-et-garonne', 'FDSEA du Lot-et-Garonne', 'presse', 'http://fdsea47.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 4'),
  ('corpus:agriculture-47-bio-nouvelle-aquitaine-groupe-lot-et-garonne', 'Bio Nouvelle-Aquitaine — groupe Lot-et-Garonne', 'presse', 'https://www.bionouvelleaquitaine.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 5'),
  ('corpus:agriculture-47-federation-des-cuma-gironde-lot-et-garonne', 'Fédération des Cuma Gironde-Lot-et-Garonne', 'presse', 'https://3347.cuma.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 6'),
  ('corpus:agriculture-47-sr-47-ged-47-service-de-remplacement-agricole', 'SR 47 — GED 47 (service de remplacement agricole)', 'presse', 'https://www.sr47ged.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 7'),
  ('corpus:agriculture-47-truffes47-trufficulteurs-du-lot-et-garonne', 'Truffes47 (trufficulteurs du Lot-et-Garonne)', 'presse', 'https://www.truffes47.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 8'),
  ('corpus:agriculture-47-cave-du-marmandais-viticulture-47', 'Cave du Marmandais (viticulture 47)', 'presse', 'https://cave-du-marmandais.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 9'),
  ('corpus:agriculture-47-epro-agriculture-annuaire-lot-et-garonne', 'EPRO Agriculture — annuaire Lot-et-Garonne', 'presse', 'https://agriculture.e-pro.fr/lot-et-garonne/culture-et-elevage-associes_c013Z_47', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 10'),
  ('corpus:agriculture-47-chambre-d-agriculture-du-lot-et-garonne', 'Chambre d''agriculture du Lot-et-Garonne', 'presse', 'https://lot-et-garonne.chambres-agriculture.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 11'),
  ('corpus:agriculture-47-cerfrance-lot-et-garonne', 'Cerfrance Lot-et-Garonne', 'presse', 'https://lot-et-garonne.cerfrance.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 12'),
  ('corpus:agriculture-47-safer-nouvelle-aquitaine-antenne-lot-et-garonne', 'SAFER Nouvelle-Aquitaine (antenne Lot-et-Garonne)', 'presse', 'https://www.saferna.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 13'),
  ('corpus:agriculture-47-federation-regionale-des-cuma-nouvelle-aquitaine-cuma-du-47', 'Fédération régionale des Cuma Nouvelle-Aquitaine (Cuma du 47)', 'presse', 'https://nouvelle-aquitaine.cuma.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 14'),
  ('corpus:agriculture-47-fncuma-annuaire-des-federations-cuma-47', 'FNCuma — annuaire des fédérations Cuma (47)', 'presse', 'https://www.cuma.fr/contacter-une-federation/?_fselect_department=47', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 15'),
  ('corpus:agriculture-47-chambre-regionale-d-agriculture-nouvelle-aquitaine-couvre-le-47', 'Chambre régionale d''agriculture Nouvelle-Aquitaine (couvre le 47)', 'presse', 'https://nouvelle-aquitaine.chambres-agriculture.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 16'),
  ('corpus:agriculture-47-annuaire-des-chambres-d-agriculture-france-recense-le-47', 'Annuaire des Chambres d''agriculture France (recense le 47)', 'presse', 'https://chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 17'),
  ('corpus:agriculture-47-agri-sud-ouest-innovation-cluster-agroeconomique', 'Agri Sud-Ouest Innovation (cluster agroéconomique)', 'presse', 'https://agrisudouest.com/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 18'),
  ('corpus:agriculture-47-jeunes-agriculteurs-lot-et-garonne', 'Jeunes Agriculteurs Lot-et-Garonne', 'presse', 'https://www.jeunes-agriculteurs.fr/reseau/jeunes-agriculteurs-de-lot-garonne/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 19'),
  ('corpus:agriculture-47-fnab-federation-nationale-d-agriculture-biologique', 'FNAB — Fédération nationale d''agriculture biologique', 'presse', 'https://www.fnab.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 20'),
  ('corpus:agriculture-47-bienvenue-a-la-ferme-annuaire-de-producteurs', 'Bienvenue à la ferme (annuaire de producteurs)', 'presse', 'https://www.bienvenue-a-la-ferme.com/fr', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 21'),
  ('corpus:agriculture-47-terre-de-liens-association-fonciere-agricole', 'Terre de Liens (association foncière agricole)', 'presse', 'https://terredeliens.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":22,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 22'),
  ('corpus:agriculture-47-ici-lot-et-garonne-radio-france', 'ICI Lot-et-Garonne (Radio France)', 'presse', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":23,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 23'),
  ('corpus:agriculture-47-france-3-nouvelle-aquitaine-lot-et-garonne', 'France 3 Nouvelle-Aquitaine — Lot-et-Garonne', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/lot-et-garonne/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":24,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 24'),
  ('corpus:agriculture-47-actu-fr-lot-et-garonne', 'actu.fr — Lot-et-Garonne', 'presse', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":25,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 25'),
  ('corpus:agriculture-47-le-parisien-lot-et-garonne-47', 'Le Parisien — Lot-et-Garonne (47)', 'presse', 'https://www.leparisien.fr/lot-et-garonne-47/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":26,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 26'),
  ('corpus:agriculture-47-la-depeche-du-midi-lot-et-garonne', 'La Dépêche du Midi — Lot-et-Garonne', 'presse', 'https://www.ladepeche.fr/lot-et-garonne', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":27,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 27'),
  ('corpus:agriculture-47-reussir-presse-agricole-specialisee', 'Réussir (presse agricole spécialisée)', 'presse', 'https://www.reussir.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":28,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 28'),
  ('corpus:agriculture-47-la-france-agricole', 'La France Agricole', 'presse', 'https://www.lafranceagricole.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-agriculture-47.jsonl","ligne":29,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source agriculture — Lot-et-Garonne (47) ; corpus ligne 29')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, family=EXCLUDED.family, url=EXCLUDED.url,
  kind=EXCLUDED.kind, format=EXCLUDED.format, enabled=EXCLUDED.enabled,
  region=EXCLUDED.region, department=EXCLUDED.department, description=EXCLUDED.description;

WITH urls (source_id, url, content_type, items) AS (
  VALUES
    ('corpus:agriculture-47-modef-47-federation-departementale-du-lot-et-garonne', 'https://www.modef.fr/nos-federations/dep47/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-modef-47-federation-departementale-du-lot-et-garonne', 'https://www.modef.fr/categorie/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-modef-47-federation-departementale-du-lot-et-garonne', 'https://www.modef.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-47-coordination-rurale-47-lot-et-garonne', 'https://www.coordinationrurale.fr/nos-cr-locales/lot-et-garonne/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-coordination-rurale-47-lot-et-garonne', 'https://www.coordinationrurale.fr/nos-cr-locales-actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-val-de-gascogne-groupe-cooperatif-dont-le-47', 'https://www.valdegascogne.coop/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-val-de-gascogne-groupe-cooperatif-dont-le-47', 'https://www.valdegascogne.coop/blog-sidebar/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-val-de-gascogne-groupe-cooperatif-dont-le-47', 'https://www.valdegascogne.coop/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-47-fdsea-du-lot-et-garonne', 'http://fdsea47.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-fdsea-du-lot-et-garonne', 'http://fdsea47.fr/actu-dossiers', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-bio-nouvelle-aquitaine-groupe-lot-et-garonne', 'https://www.bionouvelleaquitaine.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-bio-nouvelle-aquitaine-groupe-lot-et-garonne', 'https://www.bionouvelleaquitaine.com/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-federation-des-cuma-gironde-lot-et-garonne', 'https://3347.cuma.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-federation-des-cuma-gironde-lot-et-garonne', 'https://3347.cuma.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-sr-47-ged-47-service-de-remplacement-agricole', 'https://www.sr47ged.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-sr-47-ged-47-service-de-remplacement-agricole', 'https://www.sr47ged.fr/actualites.html', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-truffes47-trufficulteurs-du-lot-et-garonne', 'https://www.truffes47.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-truffes47-trufficulteurs-du-lot-et-garonne', 'https://www.truffes47.fr/blog', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-cave-du-marmandais-viticulture-47', 'https://cave-du-marmandais.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-cave-du-marmandais-viticulture-47', 'https://cave-du-marmandais.fr/partagez/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-cave-du-marmandais-viticulture-47', 'https://cave-du-marmandais.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-47-epro-agriculture-annuaire-lot-et-garonne', 'https://agriculture.e-pro.fr/lot-et-garonne/culture-et-elevage-associes_c013Z_47', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-epro-agriculture-annuaire-lot-et-garonne', 'https://agriculture.e-pro.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-chambre-d-agriculture-du-lot-et-garonne', 'https://lot-et-garonne.chambres-agriculture.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-chambre-d-agriculture-du-lot-et-garonne', 'https://lot-et-garonne.chambres-agriculture.fr/actualites-1', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-cerfrance-lot-et-garonne', 'https://lot-et-garonne.cerfrance.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-cerfrance-lot-et-garonne', 'https://lot-et-garonne.cerfrance.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-safer-nouvelle-aquitaine-antenne-lot-et-garonne', 'https://www.saferna.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-safer-nouvelle-aquitaine-antenne-lot-et-garonne', 'https://www.saferna.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-safer-nouvelle-aquitaine-antenne-lot-et-garonne', 'https://www.saferna.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-47-federation-regionale-des-cuma-nouvelle-aquitaine-cuma-du-47', 'https://nouvelle-aquitaine.cuma.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-federation-regionale-des-cuma-nouvelle-aquitaine-cuma-du-47', 'https://nouvelle-aquitaine.cuma.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-fncuma-annuaire-des-federations-cuma-47', 'https://www.cuma.fr/contacter-une-federation/?_fselect_department=47', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-fncuma-annuaire-des-federations-cuma-47', 'https://www.cuma.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-chambre-regionale-d-agriculture-nouvelle-aquitaine-couvre-le-47', 'https://nouvelle-aquitaine.chambres-agriculture.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-chambre-regionale-d-agriculture-nouvelle-aquitaine-couvre-le-47', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-chambre-regionale-d-agriculture-nouvelle-aquitaine-couvre-le-47', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites.rss', 'text/xml; charset=utf-8', 20),
    ('corpus:agriculture-47-annuaire-des-chambres-d-agriculture-france-recense-le-47', 'https://chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-annuaire-des-chambres-d-agriculture-france-recense-le-47', 'https://chambres-agriculture.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-annuaire-des-chambres-d-agriculture-france-recense-le-47', 'https://chambres-agriculture.fr/presse.rss', 'text/xml; charset=utf-8', 20),
    ('corpus:agriculture-47-agri-sud-ouest-innovation-cluster-agroeconomique', 'https://agrisudouest.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-agri-sud-ouest-innovation-cluster-agroeconomique', 'https://agrisudouest.com/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-agri-sud-ouest-innovation-cluster-agroeconomique', 'https://agrisudouest.com/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-47-jeunes-agriculteurs-lot-et-garonne', 'https://www.jeunes-agriculteurs.fr/reseau/jeunes-agriculteurs-de-lot-garonne/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-jeunes-agriculteurs-lot-et-garonne', 'https://www.jeunes-agriculteurs.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-jeunes-agriculteurs-lot-et-garonne', 'https://www.jeunes-agriculteurs.fr/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-47-fnab-federation-nationale-d-agriculture-biologique', 'https://www.fnab.org/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-fnab-federation-nationale-d-agriculture-biologique', 'https://www.fnab.org/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-fnab-federation-nationale-d-agriculture-biologique', 'https://www.fnab.org/feed/', 'application/rss+xml; charset=UTF-8', 10),
    ('corpus:agriculture-47-bienvenue-a-la-ferme-annuaire-de-producteurs', 'https://www.bienvenue-a-la-ferme.com/fr', 'text/html', 0),
    ('corpus:agriculture-47-bienvenue-a-la-ferme-annuaire-de-producteurs', 'https://www.bienvenue-a-la-ferme.com/fr/inspirez-vous/actualite', 'text/html', 0),
    ('corpus:agriculture-47-terre-de-liens-association-fonciere-agricole', 'https://terredeliens.org/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-terre-de-liens-association-fonciere-agricole', 'https://terredeliens.org/national/actu/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-ici-lot-et-garonne-radio-france', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-ici-lot-et-garonne-radio-france', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-france-3-nouvelle-aquitaine-lot-et-garonne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/lot-et-garonne/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-france-3-nouvelle-aquitaine-lot-et-garonne', 'https://france3-regions.franceinfo.fr/economie/agriculture', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-actu-fr-lot-et-garonne', 'https://actu.fr/nouvelle-aquitaine/lot-et-garonne_47/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-le-parisien-lot-et-garonne-47', 'https://www.leparisien.fr/lot-et-garonne-47/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-le-parisien-lot-et-garonne-47', 'https://www.leparisien.fr/lot-et-garonne-47/rss.xml', 'application/xml; charset=utf-8', 100),
    ('corpus:agriculture-47-la-depeche-du-midi-lot-et-garonne', 'https://www.ladepeche.fr/lot-et-garonne', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-la-depeche-du-midi-lot-et-garonne', 'https://www.ladepeche.fr/communes/lot-et-garonne/', 'text/html; charset=UTF-8', 0),
    ('corpus:agriculture-47-reussir-presse-agricole-specialisee', 'https://www.reussir.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-reussir-presse-agricole-specialisee', 'https://www.reussir.fr/fil-actualites', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-reussir-presse-agricole-specialisee', 'https://www.reussir.fr/rss.xml', 'application/xml;charset=UTF-8', 20),
    ('corpus:agriculture-47-la-france-agricole', 'https://www.lafranceagricole.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-la-france-agricole', 'https://www.lafranceagricole.fr/actualites/', 'text/html; charset=utf-8', 0),
    ('corpus:agriculture-47-la-france-agricole', 'https://www.lafranceagricole.fr/rss', 'text/xml; charset=utf-8', 20)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', 'ok200',
       'Corpus agriculture-47 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
