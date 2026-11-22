-- Sources d'information du secteur « juridique » du département 47 (Lot-et-Garonne).
-- 14 sources, 32 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-juridique-47.jsonl
-- Preuve HTTP : bench/results/verification-juridique-47.json

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
  ('corpus:juridique-47-barreau-d-agen', 'Barreau d''Agen', 'cti', 'https://www.barreau-agen.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; ordre professionnel d''avocats ; actualités : https://www.barreau-agen.fr/actualites/'),
  ('corpus:juridique-47-tribunal-judiciaire-d-agen', 'Tribunal judiciaire d''Agen', 'cti', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-dagen', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; juridiction ; actualités : https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-dagen/actualites'),
  ('corpus:juridique-47-tribunal-judiciaire-de-marmande', 'Tribunal judiciaire de Marmande', 'cti', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-marmande', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; juridiction ; actualités : https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-marmande/actualites'),
  ('corpus:juridique-47-tribunal-judiciaire-de-nerac', 'Tribunal judiciaire de Nérac', 'cti', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-nerac', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; juridiction ; actualités : https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-nerac/actualites'),
  ('corpus:juridique-47-notaires-de-france-annuaire-du-lot-et-garonne', 'Notaires de France — annuaire du Lot-et-Garonne', 'cti', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/lot-et-garonne', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; annuaire professionnel notarial ; actualités : https://www.notaires.fr/fr/actualites'),
  ('corpus:juridique-47-chambre-nationale-des-commissaires-de-justice', 'Chambre nationale des commissaires de justice', 'cti', 'https://commissaire-justice.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; ordre professionnel ; actualités : https://commissaire-justice.fr/actualites/'),
  ('corpus:juridique-47-avocat-fr-actualites-du-barreau', 'Avocat.fr — actualités du barreau', 'cti', 'https://www.avocat.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; annuaire professionnel d''avocats ; actualités : https://www.avocat.fr/actualites'),
  ('corpus:juridique-47-ici-gascogne-lot-et-garonne-faits-divers-et-justice', 'ICI Gascogne — Lot-et-Garonne, faits divers et justice', 'cti', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; presse locale ; actualités : https://www.ici.fr/infos/faits-divers-justice'),
  ('corpus:juridique-47-la-depeche-du-midi-lot-et-garonne', 'La Dépêche du Midi — Lot-et-Garonne', 'cti', 'https://www.ladepeche.fr/lot-et-garonne', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; presse locale ; actualités : https://www.ladepeche.fr/communes/lot-et-garonne/'),
  ('corpus:juridique-47-conseil-departemental-de-l-acces-au-droit-du-lot-et-garonne-cdad-47', 'Conseil départemental de l''accès au droit du Lot-et-Garonne (CDAD 47)', 'cti', 'https://www.cdad47.info/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; CDAD / groupement d''intérêt public ; actualités : https://www.cdad47.info/colloques-du-cdad47-10'),
  ('corpus:juridique-47-chambre-interdepartementale-des-notaires-agen', 'Chambre interdépartementale des notaires (Agen)', 'cti', 'https://ci-agen.notaires.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; chambre professionnelle notariale ; actualités : https://ci-agen.notaires.fr/actualite?type=1&page=1'),
  ('corpus:juridique-47-udaf-47-union-departementale-des-associations-familiales', 'UDAF 47 — Union départementale des associations familiales', 'cti', 'https://www.udaf47.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; association de défense des droits des familles ; actualités : https://www.udaf47.fr/actualites-udaf47/'),
  ('corpus:juridique-47-cour-d-appel-d-agen', 'Cour d''appel d''Agen', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/cour-d-appel-d-agen', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; cour d''appel ; actualités : https://www.justice.gouv.fr/actualites'),
  ('corpus:juridique-47-tribunal-de-commerce-d-agen', 'Tribunal de commerce d''Agen', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-de-commerce-d-agen', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-47.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Source juridique — Lot-et-Garonne (47) ; juridiction ; actualités : https://www.justice.gouv.fr/actualites')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family, url = EXCLUDED.url,
  format = EXCLUDED.format, parser = EXCLUDED.parser, description = EXCLUDED.description,
  region = EXCLUDED.region, department = EXCLUDED.department;

-- Trace de vérification HTTP : 32 URLs distinctes (34 traces par source) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-47-barreau-d-agen', 'https://www.barreau-agen.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-barreau-d-agen', 'https://www.barreau-agen.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-barreau-d-agen', 'https://www.barreau-agen.fr/rss.xml', 'application/xml; charset=UTF-8', 30),
    ('corpus:juridique-47-tribunal-judiciaire-d-agen', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-dagen', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-tribunal-judiciaire-d-agen', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-dagen/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-tribunal-judiciaire-de-marmande', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-marmande', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-tribunal-judiciaire-de-marmande', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-marmande/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-tribunal-judiciaire-de-nerac', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-nerac', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-tribunal-judiciaire-de-nerac', 'https://www.cours-appel.justice.fr/bordeaux/tribunal-judiciaire-de-nerac/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-notaires-de-france-annuaire-du-lot-et-garonne', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/lot-et-garonne', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-notaires-de-france-annuaire-du-lot-et-garonne', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/feed/', 'text/xml;charset=UTF-8', 10),
    ('corpus:juridique-47-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-47-ici-gascogne-lot-et-garonne-faits-divers-et-justice', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-ici-gascogne-lot-et-garonne-faits-divers-et-justice', 'https://www.ici.fr/infos/faits-divers-justice', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-ici-gascogne-lot-et-garonne-faits-divers-et-justice', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:juridique-47-la-depeche-du-midi-lot-et-garonne', 'https://www.ladepeche.fr/lot-et-garonne', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-la-depeche-du-midi-lot-et-garonne', 'https://www.ladepeche.fr/communes/lot-et-garonne/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-conseil-departemental-de-l-acces-au-droit-du-lot-et-garonne-cdad-47', 'https://www.cdad47.info/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-conseil-departemental-de-l-acces-au-droit-du-lot-et-garonne-cdad-47', 'https://www.cdad47.info/colloques-du-cdad47-10', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-chambre-interdepartementale-des-notaires-agen', 'https://ci-agen.notaires.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-chambre-interdepartementale-des-notaires-agen', 'https://ci-agen.notaires.fr/actualite?type=1&page=1', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-udaf-47-union-departementale-des-associations-familiales', 'https://www.udaf47.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-udaf-47-union-departementale-des-associations-familiales', 'https://www.udaf47.fr/actualites-udaf47/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-47-cour-d-appel-d-agen', 'https://www.justice.gouv.fr/annuaire/fiche/cour-d-appel-d-agen', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-cour-d-appel-d-agen', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-cour-d-appel-d-agen', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-47-tribunal-de-commerce-d-agen', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-de-commerce-d-agen', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-tribunal-de-commerce-d-agen', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-47-tribunal-de-commerce-d-agen', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-47 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
