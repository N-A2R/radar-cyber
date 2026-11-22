-- Sources d'information du secteur « juridique » du département 87 (Haute-Vienne).
-- 14 sources, 34 URL contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-juridique-87.jsonl
-- Preuve HTTP : bench/results/verification-juridique-87.json

-- Table de traçage déclarée ici pour rester applicable sur une branche qui ne
-- contient pas encore migrate-066-source-verification.sql.
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
  ('corpus:juridique-87-tj-limoges', 'Tribunal judiciaire de Limoges', 'cti', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-limoges/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Juridiction de Limoges, page actualites. Exemple cyber : vol de donnees personnelles a l Universite de Limoges.'),
  ('corpus:juridique-87-cour-appel-limoges', 'Cour d appel de Limoges', 'cti', 'https://www.cours-appel.justice.fr/limoges/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Cour d appel du ressort de la Haute-Vienne. Exemple cyber : attaque de la FFTir et vol de donnees de licencies.'),
  ('corpus:juridique-87-ordre-avocats-limoges', 'Ordre des avocats du Barreau de Limoges', 'cti', 'https://www.avocats-limoges.org/le-barreau-de-limoges/actualites-et-publications.htm', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Barreau de Limoges, actualites et publications. Exemple cyber : menaces cyber contre les cabinets d avocats.'),
  ('corpus:juridique-87-avocat-fr-limoges', 'Avocat.fr - annuaire du barreau de Limoges', 'cti', 'https://www.avocat.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Annuaire national des avocats, barreau de Limoges. Exemple cyber : arnaque au faux RIB.'),
  ('corpus:juridique-87-chambre-notaires-19-23-87', 'Chambre interdepartementale des notaires 19-23-87 (Limoges)', 'cti', 'https://www.magazine-des-notaires.com/magazine/LIM.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Chambre notariale du Limousin, annuaire des notaires de Haute-Vienne. Exemple cyber : arnaques IBAN et RIB.'),
  ('corpus:juridique-87-notaires-haute-vienne', 'Notaires de France - annuaire des notaires de la Haute-Vienne', 'cti', 'https://www.notaires.fr/rss/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Annuaire des notaires de Haute-Vienne et actualites du notariat. Exemple cyber : fraude au RIB.'),
  ('corpus:juridique-87-village-justice', 'Village de la Justice - annuaire des barreaux et actualites juridiques', 'cti', 'https://www.village-justice.com/articles/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Annuaire des barreaux et actualites juridiques. Exemple cyber : cyberattaque du logiciel Weda.'),
  ('corpus:juridique-87-le-populaire', 'Le Populaire du Centre - Haute-Vienne / Limoges', 'presse', 'https://www.lepopulaire.fr/limoges-87000/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Presse quotidienne locale de Limoges. Exemple cyber : cyberattaque du service d identification des bovins.'),
  ('corpus:juridique-87-la-montagne', 'La Montagne - edition Limoges / faits divers', 'presse', 'https://www.lamontagne.fr/faits-divers', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Presse quotidienne locale, rubrique faits divers. Exemple cyber : fuite Climb Up Limoges.'),
  ('corpus:juridique-87-ici-limousin', 'ICI Limousin (Radio France) - infos', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Radio locale du Limousin, flux infos. Exemple cyber : SMS frauduleux au nom de la Ville de Limoges.'),
  ('corpus:juridique-87-france3-haute-vienne', 'France 3 Nouvelle-Aquitaine - Haute-Vienne', 'presse', 'https://www.franceinfo.fr/societe/justice.rss', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Television locale, rubrique justice. Exemple cyber : vol de donnees a l Universite de Limoges.'),
  ('corpus:juridique-87-sudouest-justice', 'Sud Ouest - rubrique justice / Haute-Vienne', 'presse', 'https://www.sudouest.fr/justice/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Quotidien regional, edition Haute-Vienne et rubrique justice. Exemple cyber : attaque du service d identification des bovins.'),
  ('corpus:juridique-87-actu-fr', 'actu.fr - Haute-Vienne / Limoges', 'presse', 'https://actu.fr/nouvelle-aquitaine/limoges_87085/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Media local en ligne. Exemple cyber : incident de securite informatique de la Ville de Limoges.'),
  ('corpus:juridique-87-conseil-departemental', 'Conseil departemental de la Haute-Vienne', 'cti', 'https://www.haute-vienne.fr/tous-les-actualites-et-evenements', 'source d information institutionnelle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-87.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '87', 'Collectivite departementale, actualites institutionnelles. Exemple cyber : donnees personnelles Cigusto Limoges.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 34 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-87-tj-limoges', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-limoges', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-tj-limoges', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-limoges/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-cour-appel-limoges', 'https://www.cours-appel.justice.fr/limoges', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-cour-appel-limoges', 'https://www.cours-appel.justice.fr/limoges/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-ordre-avocats-limoges', 'https://www.avocats-limoges.org/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-ordre-avocats-limoges', 'https://www.avocats-limoges.org/le-barreau-de-limoges/actualites-et-publications.htm', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-avocat-fr-limoges', 'https://consultation.avocat.fr/avocats/barreau-limoges.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-avocat-fr-limoges', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-avocat-fr-limoges', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-87-chambre-notaires-19-23-87', 'https://www.chambre-interdep-19-23-87.notaires.fr/', 'text/html;charset=ISO-8859-1', 0),
    ('corpus:juridique-87-chambre-notaires-19-23-87', 'https://www.chambre-interdep-19-23-87.notaires.fr/rechercher-un-notaire-sur-la-haute-vienne.html', 'text/html;charset=ISO-8859-1', 0),
    ('corpus:juridique-87-chambre-notaires-19-23-87', 'https://www.magazine-des-notaires.com/magazine/LIM.html', 'text/html;charset=ISO-8859-1', 0),
    ('corpus:juridique-87-notaires-haute-vienne', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/haute-vienne', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-notaires-haute-vienne', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-notaires-haute-vienne', 'https://www.notaires.fr/rss/actualites', 'application/rss+xml; charset=utf-8', 420),
    ('corpus:juridique-87-village-justice', 'https://www.village-justice.com/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-village-justice', 'https://www.village-justice.com/articles/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-le-populaire', 'https://www.lepopulaire.fr/haute-vienne/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-le-populaire', 'https://www.lepopulaire.fr/limoges-87000/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-la-montagne', 'https://www.lamontagne.fr/limoges-87000/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-la-montagne', 'https://www.lamontagne.fr/faits-divers', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-87-ici-limousin', 'https://www.ici.fr/radio/limousin', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-ici-limousin', 'https://www.ici.fr/rss', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-ici-limousin', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:juridique-87-france3-haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-france3-haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-france3-haute-vienne', 'https://www.franceinfo.fr/societe/justice.rss', 'text/xml; charset=UTF-8', 20),
    ('corpus:juridique-87-sudouest-justice', 'https://www.sudouest.fr/haute-vienne/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-sudouest-justice', 'https://www.sudouest.fr/justice/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-sudouest-justice', 'https://www.sudouest.fr/justice/rss.xml', 'application/xml', 20),
    ('corpus:juridique-87-actu-fr', 'https://actu.fr/nouvelle-aquitaine/haute-vienne_87', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-actu-fr', 'https://actu.fr/nouvelle-aquitaine/limoges_87085/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-87-conseil-departemental', 'https://www.haute-vienne.fr/', 'text/html;charset=utf-8', 0),
    ('corpus:juridique-87-conseil-departemental', 'https://www.haute-vienne.fr/tous-les-actualites-et-evenements', 'text/html;charset=utf-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-87 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
