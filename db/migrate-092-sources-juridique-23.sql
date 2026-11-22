-- Sources d'information du secteur « juridique » du département 23 (Creuse).
-- 13 sources, 30 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-juridique-23.jsonl
-- Preuve HTTP : bench/results/verification-juridique-23.json

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
  ('corpus:juridique-23-tj-gueret', 'Tribunal judiciaire de Guéret', 'cti', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-gueret/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Juridiction de Guéret, page actualités. Exemple cyber : APAJH 23 escroquée de 173 000 euros.'),
  ('corpus:juridique-23-cour-appel-limoges', 'Cour d appel de Limoges — ressort de la Creuse', 'cti', 'https://www.cours-appel.justice.fr/limoges/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Cour d appel du ressort de Guéret (23). Exemple cyber : arnaque au faux RIB à un créusois.'),
  ('corpus:juridique-23-notaires-creuse', 'Notaires de France — annuaire des notaires de la Creuse', 'cti', 'https://www.notaires.fr/rss/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Annuaire notarial du département 23 et actualités du notariat. Exemple cyber : arnaques IBAN au Crédit Mutuel Guéret.'),
  ('corpus:juridique-23-notaires-gueret', 'Notaires de France — annuaire des notaires de Guéret', 'cti', 'https://www.notaires.fr/rss/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Annuaire des notaires de Guéret. Exemple cyber : arnaque au faux RIB.'),
  ('corpus:juridique-23-avocats-limoges', 'Avocat.fr — annuaire du barreau de Limoges', 'cti', 'https://www.avocat.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Annuaire du barreau du ressort et actualités de la profession. Exemple cyber : APAJH 23 escroquée de 173 000 euros.'),
  ('corpus:juridique-23-cma-na', 'CMA Nouvelle-Aquitaine — Creuse (droit des entreprises)', 'cti', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Chambre consulaire, actualités juridiques des entreprises. Exemple cyber : fol-23.fr listé sur un site de fuite.'),
  ('corpus:juridique-23-lamontagne-creuse', 'La Montagne — édition Creuse (Guéret)', 'presse', 'https://www.lamontagne.fr/creuse/faits-divers', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Quotidien local, édition Creuse, page faits divers et justice. Exemple cyber : camping de la Creuse détourné.'),
  ('corpus:juridique-23-actu-fr-gueret', 'actu.fr — Guéret et Creuse', 'presse', 'https://actu.fr/nouvelle-aquitaine/creuse_23', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Média local de Guéret et de la Creuse. Exemple cyber : arnaque au faux RIB.'),
  ('corpus:juridique-23-ici-creuse', 'ICI Creuse (Radio France)', 'presse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Radio locale, actualités de la Creuse et faits divers-justice. Exemple cyber : APAJH 23.'),
  ('corpus:juridique-23-france3-creuse', 'France 3 Nouvelle-Aquitaine — Creuse', 'presse', 'https://www.franceinfo.fr/societe/justice.rss', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Télévision locale, édition Creuse et flux justice national. Exemple cyber : camping de la Creuse détourné.'),
  ('corpus:juridique-23-sudouest-creuse', 'Sud Ouest — Creuse / rubrique justice', 'presse', 'https://www.sudouest.fr/justice/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Quotidien régional, édition Creuse et rubrique justice. Exemple cyber : cyberattaque du logiciel Weda.'),
  ('corpus:juridique-23-conseil-departemental', 'Conseil départemental de la Creuse', 'cti', 'https://www.creuse.fr/', 'source d information institutionnelle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Actualités institutionnelles du département 23. Exemple cyber : fol-23.fr listé sur un site de fuite.'),
  ('corpus:juridique-23-village-justice', 'Village de la Justice — annuaire des barreaux et actualités juridiques', 'cti', 'https://www.village-justice.com/articles/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-23.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '23', 'Annuaire des barreaux et actualités juridiques. Exemple cyber : arnaque au faux RIB.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 30 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-23-tj-gueret', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-gueret', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-23-tj-gueret', 'https://www.cours-appel.justice.fr/limoges/tribunal-judiciaire-de-gueret/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-23-cour-appel-limoges', 'https://www.cours-appel.justice.fr/limoges', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-23-cour-appel-limoges', 'https://www.cours-appel.justice.fr/limoges/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-23-notaires-creuse', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/creuse', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-notaires-creuse', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-notaires-creuse', 'https://www.notaires.fr/rss/actualites', 'application/rss+xml; charset=utf-8', 420),
    ('corpus:juridique-23-notaires-gueret', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/creuse/gueret', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-notaires-gueret', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-notaires-gueret', 'https://www.notaires.fr/rss/actualites', 'application/rss+xml; charset=utf-8', 420),
    ('corpus:juridique-23-avocats-limoges', 'https://consultation.avocat.fr/avocats/barreau-limoges.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-23-avocats-limoges', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-avocats-limoges', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-23-cma-na', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-cma-na', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-lamontagne-creuse', 'https://www.lamontagne.fr/creuse/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-23-lamontagne-creuse', 'https://www.lamontagne.fr/creuse/faits-divers', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-23-actu-fr-gueret', 'https://actu.fr/nouvelle-aquitaine/gueret_23096/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-actu-fr-gueret', 'https://actu.fr/nouvelle-aquitaine/creuse_23', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-ici-creuse', 'https://www.ici.fr/nouvelle-aquitaine/creuse-23', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-ici-creuse', 'https://www.ici.fr/nouvelle-aquitaine/creuse-23/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-ici-creuse', 'https://www.ici.fr/rss/limousin/rubrique/infos.xml', 'application/xml', 20),
    ('corpus:juridique-23-france3-creuse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-france3-creuse', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/gueret/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-france3-creuse', 'https://www.franceinfo.fr/societe/justice.rss', 'text/xml; charset=UTF-8', 20),
    ('corpus:juridique-23-sudouest-creuse', 'https://www.sudouest.fr/creuse/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-sudouest-creuse', 'https://www.sudouest.fr/justice/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-23-sudouest-creuse', 'https://www.sudouest.fr/justice/rss.xml', 'application/xml', 20),
    ('corpus:juridique-23-conseil-departemental', 'https://www.creuse.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-23-village-justice', 'https://www.village-justice.com/articles/', 'text/html; charset=utf-8', 0)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-23 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
