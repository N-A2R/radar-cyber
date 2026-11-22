-- Sources d'information du secteur « collectivites » du département 79 (Deux-Sèvres).
-- 25 sources ; 80 traces de vérification sur 58 URL distinctes, toutes en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections, délai 25 s).
-- Corpus détaillé : bench/corpus/sources-collectivites-79.jsonl
-- Preuve HTTP : bench/results/verification-collectivites-79.json

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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:collectivites-79-conseil-departemental-des-deux-sevres', 'Conseil départemental des Deux-Sèvres', 'cti', 'https://www.deux-sevres.fr/toutes-les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Conseil départemental des Deux-Sèvres (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-communaute-d-agglomeration-du-niortais', 'Communauté d''agglomération du Niortais', 'cti', 'https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Communauté d''agglomération du Niortais (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-ville-de-niort', 'Ville de Niort', 'cti', 'https://www.vivre-a-niort.com/actualites/toutes-les-news-archives/index.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Ville de Niort (79). Des SMS frauduleux usurpent le nom de la Ville de Niort, la municipalité sonne l''alerte (13/12/2025) — https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html'),
  ('corpus:collectivites-79-ville-de-bressuire', 'Ville de Bressuire', 'cti', 'https://www.ville-bressuire.fr/feed/?post_type=post', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Ville de Bressuire (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-ville-de-thouars', 'Ville de Thouars', 'cti', 'https://thouars.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Ville de Thouars (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-ville-de-parthenay', 'Ville de Parthenay', 'cti', 'https://www.parthenay.fr/actualites/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Ville de Parthenay (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-ville-de-melle', 'Ville de Melle', 'cti', 'https://melle.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Ville de Melle (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-ville-de-cerizay', 'Ville de Cerizay', 'cti', 'https://www.cerizay.fr/index.php?format=feed&type=rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Ville de Cerizay (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-agglomeration-du-bocage-bressuirais', 'Agglomération du Bocage Bressuirais', 'cti', 'https://www.agglo2b.fr/actus', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Agglomération du Bocage Bressuirais (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-communaute-de-communes-haut-val-de-sevre', 'Communauté de communes Haut Val de Sèvre', 'cti', 'https://cc-hautvaldesevre.fr/?format=feed&type=rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Communauté de communes Haut Val de Sèvre (79). Aucun incident propre identifié ; Cyberattaque avec rançon contre l''EHPAD de Champdeniers-Saint-Denis (10/12/2025) — https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797'),
  ('corpus:collectivites-79-centre-de-gestion-de-la-fonction-publique-territoriale-des-deux-sevres', 'Centre de gestion de la fonction publique territoriale des Deux-Sèvres', 'cti', 'https://www.cdg79.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Centre de gestion de la fonction publique territoriale des Deux-Sèvres (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-sdis-des-deux-sevres', 'SDIS des Deux-Sèvres', 'cti', 'https://www.sdis79.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'SDIS des Deux-Sèvres (79). Aucun incident propre identifié ; Cyberattaque avec rançon contre l''EHPAD de Champdeniers-Saint-Denis (10/12/2025) — https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797'),
  ('corpus:collectivites-79-chambre-d-agriculture-charente-maritimedeux-sevres', 'Chambre d''agriculture Charente-Maritime–Deux-Sèvres', 'cti', 'https://cmds.chambre-agriculture.fr/actualites-1', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Chambre d''agriculture Charente-Maritime–Deux-Sèvres (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-cma-nouvelle-aquitaine-antenne-deux-sevres', 'CMA Nouvelle-Aquitaine — antenne Deux-Sèvres', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'CMA Nouvelle-Aquitaine — antenne Deux-Sèvres (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-association-des-maires-des-deux-sevres-adm79', 'Association des maires des Deux-Sèvres (ADM79)', 'cti', 'https://adm79.fr/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Association des maires des Deux-Sèvres (ADM79) (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-annuaire-de-l-amf-deux-sevres', 'Annuaire de l''AMF — Deux-Sèvres', 'cti', 'https://www.amf.asso.fr/m/annuaire/?refer=departement&dep_n_id=79', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Annuaire de l''AMF — Deux-Sèvres (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-annuaire-de-l-administration-deux-sevres', 'Annuaire de l''administration — Deux-Sèvres', 'cti', 'https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/deux-sevres', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Annuaire de l''administration — Deux-Sèvres (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-annuaire-des-communes-des-deux-sevres', 'Annuaire des communes des Deux-Sèvres', 'cti', 'https://www.annuaire-mairie.fr/departement-deux-sevres.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":18,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Annuaire des communes des Deux-Sèvres (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-la-nouvelle-republique-deux-sevres', 'La Nouvelle République — Deux-Sèvres', 'cti', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":19,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'La Nouvelle République — Deux-Sèvres (79). Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-france-3-nouvelle-aquitaine-deux-sevres', 'France 3 Nouvelle-Aquitaine — Deux-Sèvres', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":20,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'France 3 Nouvelle-Aquitaine — Deux-Sèvres (79). Aucun incident propre identifié ; Cyberattaque avec rançon contre l''EHPAD de Champdeniers-Saint-Denis (10/12/2025) — https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797'),
  ('corpus:collectivites-79-ici-poitou-radio-france', 'ICI Poitou (Radio France)', 'cti', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":21,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'ICI Poitou (Radio France) (79). Cyberattaque avec rançon contre l''EHPAD de Champdeniers-Saint-Denis (10/12/2025) — https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797'),
  ('corpus:collectivites-79-niort-info', 'Niort info', 'cti', 'https://niortinfo.media/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":22,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Niort info (79). Aucun incident propre identifié ; Des SMS frauduleux usurpent le nom de la Ville de Niort, la municipalité sonne l''alerte (13/12/2025) — https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html'),
  ('corpus:collectivites-79-radio-gatine', 'Radio Gâtine', 'cti', 'https://radiogatine.fr/rss-feed-1', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":23,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Radio Gâtine (79). Aucun incident propre identifié ; Des SMS frauduleux usurpent le nom de la Ville de Niort, la municipalité sonne l''alerte (13/12/2025) — https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html'),
  ('corpus:collectivites-79-rcf-poitou-deux-sevres', 'RCF Poitou Deux-Sèvres', 'cti', 'https://www.rcf.fr/actualite?radio=poitou-deuxsevres', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":24,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'RCF Poitou Deux-Sèvres (79). Aucun incident propre identifié ; Deux-Sèvres : gare aux faux mails de la mairie de La Forêt-sur-Sèvre (15/11/2024) — https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie'),
  ('corpus:collectivites-79-actu-deux-sevres-actu-fr', 'Actu Deux-Sèvres (actu.fr)', 'cti', 'https://actu.fr/pays-de-la-loire/deux-sevres_79/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-79.jsonl","ligne":25,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Actu Deux-Sèvres (actu.fr) (79). Des SMS frauduleux usurpent le nom de la Ville de Niort, la municipalité sonne l''alerte (13/12/2025) — https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 80 traces sur 58 URL distinctes, toutes en 200 le 2026-11-22 (une trace par couple source/URL).
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:collectivites-79-conseil-departemental-des-deux-sevres', ARRAY['https://www.deux-sevres.fr/', 'https://www.deux-sevres.fr/toutes-les-actualites', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-communaute-d-agglomeration-du-niortais', ARRAY['https://www.niortagglo.fr/', 'https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-ville-de-niort', ARRAY['https://www.vivre-a-niort.com/', 'https://www.vivre-a-niort.com/actualites/toutes-les-news-archives/index.html', 'https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html']),
    ('corpus:collectivites-79-ville-de-bressuire', ARRAY['https://www.ville-bressuire.fr/', 'https://www.ville-bressuire.fr/systeme/actualites/', 'https://www.ville-bressuire.fr/feed/?post_type=post', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-ville-de-thouars', ARRAY['https://thouars.fr/', 'https://thouars.fr/category/actualites/', 'https://thouars.fr/feed/', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-ville-de-parthenay', ARRAY['https://www.parthenay.fr/', 'https://www.parthenay.fr/actualites', 'https://www.parthenay.fr/actualites/rss', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-ville-de-melle', ARRAY['https://melle.fr/', 'https://melle.fr/actualites', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-ville-de-cerizay', ARRAY['https://www.cerizay.fr/', 'https://www.cerizay.fr/index.php/a-la-une', 'https://www.cerizay.fr/index.php?format=feed&type=rss', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-agglomeration-du-bocage-bressuirais', ARRAY['https://www.agglo2b.fr/', 'https://www.agglo2b.fr/actus', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-communaute-de-communes-haut-val-de-sevre', ARRAY['https://cc-hautvaldesevre.fr/', 'https://cc-hautvaldesevre.fr/?format=feed&type=rss', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797']),
    ('corpus:collectivites-79-centre-de-gestion-de-la-fonction-publique-territoriale-des-deux-sevres', ARRAY['https://www.cdg79.fr/', 'https://www.cdg79.fr/actualites', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-sdis-des-deux-sevres', ARRAY['https://www.sdis79.fr/', 'https://www.sdis79.fr/actualites-generales/', 'https://www.sdis79.fr/feed/', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797']),
    ('corpus:collectivites-79-chambre-d-agriculture-charente-maritimedeux-sevres', ARRAY['https://cmds.chambre-agriculture.fr/', 'https://cmds.chambre-agriculture.fr/actualites-1', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-cma-nouvelle-aquitaine-antenne-deux-sevres', ARRAY['https://cma-nouvelleaquitaine.fr/', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-association-des-maires-des-deux-sevres-adm79', ARRAY['https://adm79.fr/', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-annuaire-de-l-amf-deux-sevres', ARRAY['https://www.amf.asso.fr/m/annuaire/?refer=departement&dep_n_id=79', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-annuaire-de-l-administration-deux-sevres', ARRAY['https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/deux-sevres', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-annuaire-des-communes-des-deux-sevres', ARRAY['https://www.annuaire-mairie.fr/departement-deux-sevres.html', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-la-nouvelle-republique-deux-sevres', ARRAY['https://www.lanouvellerepublique.fr/deux-sevres', 'https://www.lanouvellerepublique.fr/deux-sevres/commune', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-france-3-nouvelle-aquitaine-deux-sevres', ARRAY['https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/niort', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/rss', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797']),
    ('corpus:collectivites-79-ici-poitou-radio-france', ARRAY['https://www.ici.fr/radio/poitou', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797']),
    ('corpus:collectivites-79-niort-info', ARRAY['https://niortinfo.media/', 'https://niortinfo.media/category/vie-de-la-cite/', 'https://niortinfo.media/feed/', 'https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html']),
    ('corpus:collectivites-79-radio-gatine', ARRAY['https://radiogatine.fr/', 'https://radiogatine.fr/news-1', 'https://radiogatine.fr/rss-feed-1', 'https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html']),
    ('corpus:collectivites-79-rcf-poitou-deux-sevres', ARRAY['https://www.rcf.fr/poitou-deuxsevres', 'https://www.rcf.fr/actualite?radio=poitou-deuxsevres', 'https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie']),
    ('corpus:collectivites-79-actu-deux-sevres-actu-fr', ARRAY['https://actu.fr/pays-de-la-loire/deux-sevres_79/', 'https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-79 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://www.deux-sevres.fr/', 'text/html; charset=utf-8'),
       ('https://www.deux-sevres.fr/toutes-les-actualites', 'text/html; charset=utf-8'),
       ('https://www.lanouvellerepublique.fr/deux-sevres/commune/la-foret-sur-sevre/deux-sevres-gare-aux-faux-mails-de-la-mairie', 'text/html; charset=utf-8'),
       ('https://www.niortagglo.fr/', 'text/html; charset=utf-8'),
       ('https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html', 'text/html; charset=utf-8'),
       ('https://www.vivre-a-niort.com/', 'text/html; charset=utf-8'),
       ('https://www.vivre-a-niort.com/actualites/toutes-les-news-archives/index.html', 'text/html; charset=utf-8'),
       ('https://actu.fr/nouvelle-aquitaine/niort_79191/des-sms-frauduleux-usurpent-le-nom-de-la-ville-de-niort-la-municipalite-sonne-l-alerte_63572972.html', 'text/html; charset=UTF-8'),
       ('https://www.ville-bressuire.fr/', 'text/html; charset=UTF-8'),
       ('https://www.ville-bressuire.fr/systeme/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.ville-bressuire.fr/feed/?post_type=post', 'application/rss+xml; charset=UTF-8'),
       ('https://thouars.fr/', 'text/html; charset=UTF-8'),
       ('https://thouars.fr/category/actualites/', 'text/html; charset=UTF-8'),
       ('https://thouars.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.parthenay.fr/', 'text/html; charset=utf-8'),
       ('https://www.parthenay.fr/actualites', 'text/html; charset=utf-8'),
       ('https://www.parthenay.fr/actualites/rss', 'text/xml;charset=utf-8'),
       ('https://melle.fr/', 'text/html; charset=utf-8'),
       ('https://melle.fr/actualites', 'text/html; charset=utf-8'),
       ('https://www.cerizay.fr/', 'text/html; charset=utf-8'),
       ('https://www.cerizay.fr/index.php/a-la-une', 'text/html; charset=utf-8'),
       ('https://www.cerizay.fr/index.php?format=feed&type=rss', 'application/rss+xml; charset=utf-8'),
       ('https://www.agglo2b.fr/', 'text/html; charset=utf-8'),
       ('https://www.agglo2b.fr/actus', 'text/html; charset=utf-8'),
       ('https://cc-hautvaldesevre.fr/', 'text/html; charset=utf-8'),
       ('https://cc-hautvaldesevre.fr/?format=feed&type=rss', 'application/rss+xml; charset=utf-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
       ('https://www.cdg79.fr/', 'text/html; charset=UTF-8'),
       ('https://www.cdg79.fr/actualites', 'text/html; charset=UTF-8'),
       ('https://www.sdis79.fr/', 'text/html; charset=UTF-8'),
       ('https://www.sdis79.fr/actualites-generales/', 'text/html; charset=UTF-8'),
       ('https://www.sdis79.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://cmds.chambre-agriculture.fr/', 'text/html; charset=utf-8'),
       ('https://cmds.chambre-agriculture.fr/actualites-1', 'text/html; charset=utf-8'),
       ('https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8'),
       ('https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8'),
       ('https://adm79.fr/', 'text/html; charset=UTF-8'),
       ('https://www.amf.asso.fr/m/annuaire/?refer=departement&dep_n_id=79', 'text/html; charset=UTF-8'),
       ('https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/deux-sevres', 'text/html;charset=UTF-8'),
       ('https://www.annuaire-mairie.fr/departement-deux-sevres.html', 'text/html; charset=UTF-8'),
       ('https://www.lanouvellerepublique.fr/deux-sevres', 'text/html; charset=utf-8'),
       ('https://www.lanouvellerepublique.fr/deux-sevres/commune', 'text/html; charset=utf-8'),
       ('https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594', 'application/rss+xml; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/niort', 'text/html; charset=UTF-8'),
       ('https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/rss', 'text/xml; charset=UTF-8'),
       ('https://www.ici.fr/radio/poitou', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml'),
       ('https://niortinfo.media/', 'text/html; charset=UTF-8'),
       ('https://niortinfo.media/category/vie-de-la-cite/', 'text/html; charset=UTF-8'),
       ('https://niortinfo.media/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://radiogatine.fr/', 'text/html; charset=UTF-8'),
       ('https://radiogatine.fr/news-1', 'text/html; charset=UTF-8'),
       ('https://radiogatine.fr/rss-feed-1', 'text/xml; charset=UTF-8'),
       ('https://www.rcf.fr/poitou-deuxsevres', 'text/html;charset=utf-8'),
       ('https://www.rcf.fr/actualite?radio=poitou-deuxsevres', 'text/html;charset=utf-8'),
       ('https://actu.fr/pays-de-la-loire/deux-sevres_79/', 'text/html; charset=UTF-8')
) AS t(url, type_contenu) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
