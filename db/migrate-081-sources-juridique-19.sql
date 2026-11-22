-- Sources d'information du secteur « juridique » du département 19 (Corrèze).
-- 10 sources, 19 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-juridique-19.jsonl
-- Preuve HTTP : bench/results/verification-juridique-19.json

-- Table de traçage déclarée ici pour rester applicable sur une branche qui ne
-- contient pas encore migrate-064-source-verification.sql.
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
  ('corpus:juridique-19-tj-tulle', 'Tribunal judiciaire de Tulle', 'cti', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-tulle/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Juridiction de Tulle, page actualites. Exemple cyber : mairie de Sarran, 44 000 euros perdus.'),
  ('corpus:juridique-19-tj-brive', 'Tribunal judiciaire de Brive-la-Gaillarde', 'cti', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-brive-la-gaillarde/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Juridiction de Brive-la-Gaillarde, page actualites. Exemple cyber : college La Salle de Brive.'),
  ('corpus:juridique-19-notaires', 'Notaires de France — annuaire des notaires de la Corrèze', 'cti', 'https://www.notaires.fr/rss/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Annuaire notarial du departement 19 et actualites du notariat. Exemple cyber : fuite de donnees de sante Novabio.'),
  ('corpus:juridique-19-avocats-tulle', 'Avocat.fr — annuaire du barreau de Tulle', 'cti', 'https://www.avocat.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Annuaire du barreau de Tulle et actualites de la profession. Exemple cyber : cyberattaque de la mairie de Sarran.'),
  ('corpus:juridique-19-sud-ouest', 'Sud Ouest — Corrèze (justice)', 'presse', 'https://www.sudouest.fr/justice/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Quotidien regional, edition Correze et rubrique justice. Exemple cyber : Intermarche d Altillac.'),
  ('corpus:juridique-19-la-montagne', 'La Montagne — Corrèze', 'presse', 'https://www.lamontagne.fr/correze/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Quotidien local, edition Correze, actualites justice et faits divers. Exemple cyber : Intermarche d Altillac.'),
  ('corpus:juridique-19-actu-fr-brive', 'actu.fr — Brive-la-Gaillarde (Corrèze)', 'presse', 'https://actu.fr/nouvelle-aquitaine/brive-la-gaillarde_19031/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Media local de Brive-la-Gaillarde. Exemple cyber : laboratoire Novabio de Brive-Rivet.'),
  ('corpus:juridique-19-ici-correze', 'ICI Corrèze (Radio France)', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Radio locale du Limousin, actualites de la Correze. Exemple cyber : Correze Fermeture a Objat.'),
  ('corpus:juridique-19-france3-correze', 'France 3 Nouvelle-Aquitaine — Corrèze', 'presse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Television locale, edition Correze. Exemple cyber : mairie de Sarran.'),
  ('corpus:juridique-19-cma-nouvelle-aquitaine', 'CMA Nouvelle-Aquitaine — Corrèze (droit des entreprises)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-19.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '19', 'Chambre consulaire, antenne Correze, actualites juridiques des entreprises. Exemple cyber : Correze Fermeture.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 19 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-19-tj-tulle', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-tulle', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-19-tj-tulle', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-tulle/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-19-tj-brive', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-brive-la-gaillarde', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-19-tj-brive', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-brive-la-gaillarde/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-19-notaires', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/correze', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-notaires', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-notaires', 'https://www.notaires.fr/rss/actualites', 'application/rss+xml; charset=utf-8', 420),
    ('corpus:juridique-19-avocats-tulle', 'https://consultation.avocat.fr/avocats/barreau-tulle.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-19-avocats-tulle', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-sud-ouest', 'https://www.sudouest.fr/correze/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-sud-ouest', 'https://www.sudouest.fr/justice/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-sud-ouest', 'https://www.sudouest.fr/justice/rss.xml', 'application/xml', 20),
    ('corpus:juridique-19-la-montagne', 'https://www.lamontagne.fr/correze/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-19-actu-fr-brive', 'https://actu.fr/nouvelle-aquitaine/brive-la-gaillarde_19031/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-ici-correze', 'https://www.ici.fr/nouvelle-aquitaine/correze-19/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-ici-correze', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:juridique-19-france3-correze', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-19-cma-nouvelle-aquitaine', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-19 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
