-- Sources d'information du secteur santé dans le département 79 (Deux-Sèvres).
-- 12 sources, 48 contrôles HTTP (42 couples source/URL uniques, 31 URL distinctes), tous en HTTP 200 le 2026-11-22 (curl -L, GET, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-sante-79.jsonl
-- Contrôle détaillé : bench/results/verification-sources-sante-79.json

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
  ('corpus:sante79-01-centre-hospitalier-de-niort', 'Centre hospitalier de Niort', 'cti', 'https://www.ch-niort.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 1'),
  ('corpus:sante79-02-ars-nouvelle-aquitaine-deux-sevres', 'ARS Nouvelle-Aquitaine — périmètre Deux-Sèvres (79)', 'cti', 'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 2'),
  ('corpus:sante79-03-cpam-des-deux-sevres', 'CPAM des Deux-Sèvres — Assurance Maladie', 'cti', 'https://www.ameli.fr/deux-sevres/assure/liste-actualites-locales', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 3'),
  ('corpus:sante79-04-ordre-des-medecins-des-deux-sevres', 'Conseil départemental de l''Ordre des médecins des Deux-Sèvres', 'cti', 'https://conseil79.ordre.medecin.fr/rss', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 4'),
  ('corpus:sante79-05-fhf-nouvelle-aquitaine', 'FHF Nouvelle-Aquitaine — Fédération Hospitalière de France', 'cti', 'https://fhf-na.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 5'),
  ('corpus:sante79-06-france-assos-sante-nouvelle-aquitaine', 'France Assos Santé Nouvelle-Aquitaine', 'cti', 'https://nouvelle-aquitaine.france-assos-sante.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 6'),
  ('corpus:sante79-07-urps-medecins-liberaux-nouvelle-aquitaine', 'URPS Médecins Libéraux Nouvelle-Aquitaine', 'cti', 'https://www.urpsml-na.org/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 7'),
  ('corpus:sante79-08-actu-fr-deux-sevres', 'actu.fr — Deux-Sèvres (79)', 'presse', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 8'),
  ('corpus:sante79-09-ici-poitou-deux-sevres', 'ICI Poitou — Deux-Sèvres (79)', 'presse', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 9'),
  ('corpus:sante79-10-nouvelle-republique-deux-sevres-sante', 'La Nouvelle République — Deux-Sèvres, rubrique Santé', 'presse', 'https://www.lanouvellerepublique.fr/deux-sevres/sante', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 10'),
  ('corpus:sante79-11-centre-hospitalier-nord-deux-sevres', 'Centre hospitalier Nord Deux-Sèvres (Parthenay, Thouars, Faye-l''Abbesse)', 'cti', 'https://www.chnds.fr/Actualites/1/14', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 11'),
  ('corpus:sante79-12-sante-publique-france-nouvelle-aquitaine', 'Santé publique France — Nouvelle-Aquitaine', 'cti', 'https://www.santepubliquefrance.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-sante-79.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '79', 'Source santé — Deux-Sèvres (79) ; corpus ligne 12')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  license = EXCLUDED.license,
  enabled = EXCLUDED.enabled,
  kind = EXCLUDED.kind,
  format = EXCLUDED.format,
  interval_sec = EXCLUDED.interval_sec,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : contrôles site, actualités, flux et article cyber, tous en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus santé-79 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:sante79-02-ars-nouvelle-aquitaine-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-02-ars-nouvelle-aquitaine-deux-sevres', 'https://www.nouvelle-aquitaine.ars.sante.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante79-02-ars-nouvelle-aquitaine-deux-sevres', 'https://www.nouvelle-aquitaine.ars.sante.fr/liste-actualites?archive=0', 'text/html; charset=UTF-8'),
  ('corpus:sante79-02-ars-nouvelle-aquitaine-deux-sevres', 'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite', 'application/rss+xml; charset=utf-8'),
  ('corpus:sante79-03-cpam-des-deux-sevres', 'https://www.ameli.fr/deux-sevres/assure', 'text/html; charset=utf-8'),
  ('corpus:sante79-03-cpam-des-deux-sevres', 'https://www.ameli.fr/deux-sevres/assure/liste-actualites-locales', 'text/html; charset=utf-8'),
  ('corpus:sante79-03-cpam-des-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-11-centre-hospitalier-nord-deux-sevres', 'https://www.chnds.fr/', 'text/html; charset=utf-8'),
  ('corpus:sante79-11-centre-hospitalier-nord-deux-sevres', 'https://www.chnds.fr/Actualites/1/14', 'text/html; charset=utf-8'),
  ('corpus:sante79-11-centre-hospitalier-nord-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-01-centre-hospitalier-de-niort', 'https://www.ch-niort.fr/', 'text/html; charset=utf-8'),
  ('corpus:sante79-01-centre-hospitalier-de-niort', 'https://www.ch-niort.fr/actualites/', 'text/html; charset=utf-8'),
  ('corpus:sante79-01-centre-hospitalier-de-niort', 'https://www.ch-niort.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:sante79-01-centre-hospitalier-de-niort', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-04-ordre-des-medecins-des-deux-sevres', 'https://conseil79.ordre.medecin.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante79-04-ordre-des-medecins-des-deux-sevres', 'https://conseil79.ordre.medecin.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:sante79-04-ordre-des-medecins-des-deux-sevres', 'https://conseil79.ordre.medecin.fr/rss', 'text/html; charset=UTF-8'),
  ('corpus:sante79-04-ordre-des-medecins-des-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-05-fhf-nouvelle-aquitaine', 'https://fhf-na.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante79-05-fhf-nouvelle-aquitaine', 'https://fhf-na.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:sante79-05-fhf-nouvelle-aquitaine', 'https://fhf-na.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:sante79-05-fhf-nouvelle-aquitaine', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-06-france-assos-sante-nouvelle-aquitaine', 'https://nouvelle-aquitaine.france-assos-sante.org/', 'text/html; charset=UTF-8'),
  ('corpus:sante79-06-france-assos-sante-nouvelle-aquitaine', 'https://nouvelle-aquitaine.france-assos-sante.org/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:sante79-06-france-assos-sante-nouvelle-aquitaine', 'https://nouvelle-aquitaine.france-assos-sante.org/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:sante79-06-france-assos-sante-nouvelle-aquitaine', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-09-ici-poitou-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79', 'text/html; charset=UTF-8'),
  ('corpus:sante79-09-ici-poitou-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-09-ici-poitou-deux-sevres', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml'),
  ('corpus:sante79-10-nouvelle-republique-deux-sevres-sante', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-10-nouvelle-republique-deux-sevres-sante', 'https://www.lanouvellerepublique.fr/deux-sevres', 'text/html; charset=utf-8'),
  ('corpus:sante79-10-nouvelle-republique-deux-sevres-sante', 'https://www.lanouvellerepublique.fr/deux-sevres/sante', 'text/html; charset=utf-8'),
  ('corpus:sante79-12-sante-publique-france-nouvelle-aquitaine', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-12-sante-publique-france-nouvelle-aquitaine', 'https://www.santepubliquefrance.fr/les-actualites', 'text/html; charset=UTF-8'),
  ('corpus:sante79-12-sante-publique-france-nouvelle-aquitaine', 'https://www.santepubliquefrance.fr/regions-et-territoires/nouvelle-aquitaine', 'text/html; charset=UTF-8'),
  ('corpus:sante79-12-sante-publique-france-nouvelle-aquitaine', 'https://www.santepubliquefrance.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:sante79-07-urps-medecins-liberaux-nouvelle-aquitaine', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8'),
  ('corpus:sante79-07-urps-medecins-liberaux-nouvelle-aquitaine', 'https://www.urpsml-na.org/', 'text/html; charset=UTF-8'),
  ('corpus:sante79-07-urps-medecins-liberaux-nouvelle-aquitaine', 'https://www.urpsml-na.org/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:sante79-08-actu-fr-deux-sevres', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79/', 'text/html; charset=UTF-8'),
  ('corpus:sante79-08-actu-fr-deux-sevres', 'https://actu.fr/nouvelle-aquitaine/deux-sevres_79/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:sante79-08-actu-fr-deux-sevres', 'https://www.ici.fr/nouvelle-aquitaine/deux-sevres-79/champdeniers/deux-sevres-un-ehpad-de-champdeniers-victime-d-une-cyberattaque-avec-demande-de-rancon-4095797', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (
  SELECT 1 FROM source_verification sv
  WHERE sv.source_id = v.source_id AND sv.url = v.url
);
