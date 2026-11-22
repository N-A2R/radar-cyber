-- Sources d'information du secteur « juridique » du département 24 (Dordogne).
-- 16 sources, 39 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-juridique-24.jsonl
-- Preuve HTTP : bench/results/verification-juridique-24.json

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
  ('corpus:juridique-24-greffe-tc-perigueux', 'Greffe du Tribunal de commerce de Périgueux', 'cti', 'https://www.greffe-tc-perigueux.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Greffe du tribunal de commerce de Périgueux (24), page actualités. Exemple cyber : Safed attaquée.'),
  ('corpus:juridique-24-notaires-dordogne', 'Notaires de France — annuaire des notaires de la Dordogne', 'juridique', 'https://www.notaires.fr/rss/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Annuaire officiel des notaires du 24 et actualités du notariat. Exemple cyber : faux courriel de mairie.'),
  ('corpus:juridique-24-notaires-perigueux', 'Notaires de France — annuaire des notaires de Périgueux', 'juridique', 'https://www.notaires.fr/rss/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Annuaire des notaires de Périgueux et actualités du notariat. Exemple cyber : Safed attaquée.'),
  ('corpus:juridique-24-barreau-perigueux', 'Barreau de Périgueux — annuaire Avocat.fr', 'juridique', 'https://www.avocat.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Annuaire du barreau de Périgueux et actualités de la profession. Exemple cyber : arnaque Péribus.'),
  ('corpus:juridique-24-cci-dordogne', 'CCI Dordogne — chambre de commerce et d''industrie', 'cci', 'https://dordogne.cci.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Chambre consulaire du 24, actualités et formalités d''entreprise. Exemple cyber : usurpation d''identité d''une entreprise.'),
  ('corpus:juridique-24-cma-dordogne', 'CMA Nouvelle-Aquitaine — antenne Dordogne', 'cci', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Chambre des métiers et de l''artisanat, antenne Dordogne. Exemple cyber : magasins visés en Dordogne.'),
  ('corpus:juridique-24-annonces-legales', 'Annonces-légales.fr — actualités juridiques', 'juridique', 'https://www.annonces-legales.fr/actualite/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Annonces légales et actualités juridiques consultables en Dordogne. Exemple cyber : pirate informatique et collectivité du 24.'),
  ('corpus:juridique-24-ici-perigord', 'ICI Périgord — actualités Dordogne (24)', 'radio', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Radio locale de service public, actualités de la Dordogne. Exemple cyber : faux courriel de mairie.'),
  ('corpus:juridique-24-france3-dordogne', 'France 3 Nouvelle-Aquitaine — Dordogne', 'tv', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Télévision locale, édition Dordogne et Périgueux. Exemple cyber : Safed attaquée.'),
  ('corpus:juridique-24-franceinfo-dordogne', 'franceinfo — édition Dordogne', 'presse', 'https://www.franceinfo.fr/societe/justice.rss', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Édition Dordogne de franceinfo et flux justice. Exemple cyber : Novabio (30/10/2026).'),
  ('corpus:juridique-24-actu-fr-perigueux', 'actu.fr — Périgueux / Dordogne', 'presse', 'https://actu.fr/nouvelle-aquitaine/perigueux_24322/faits-divers/', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Média local de Périgueux, rubrique faits divers. Exemple cyber : arnaque Péribus.'),
  ('corpus:juridique-24-dordogne-libre', 'Dordogne Libre — hebdomadaire local', 'presse', 'https://www.dordognelibre.fr/rss.xml', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Hebdomadaire de Dordogne, actualités et rubrique locale. Exemple cyber : Liberté FM piratée.'),
  ('corpus:juridique-24-courrier-francais', 'Le Courrier Français — édition Dordogne', 'presse', 'https://www.courrier-francais.com/actualites-dordogne.html', 'source d information locale, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Hebdomadaire, page actualités Dordogne. Exemple cyber : FDC24 indisponible.'),
  ('corpus:juridique-24-village-justice', 'Village de la Justice — annuaire des barreaux', 'juridique', 'https://www.village-justice.com/articles/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Annuaire des barreaux et actualités juridiques. Exemple cyber : Safed attaquée.'),
  ('corpus:juridique-24-dalloz-actualite', 'Dalloz Actualité — presse juridique', 'juridique', 'https://www.dalloz-actualite.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Presse juridique de référence, utile aux praticiens du 24. Exemple cyber : usurpation d''entreprise.'),
  ('corpus:juridique-24-democrate-independant', 'Le Démocrate Indépendant — Bergerac', 'presse', 'https://www.ledemocratedebergerac.fr/feed/', 'source d information locale, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-24.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '24', 'Hebdomadaire de Bergerac, actualités locales. Exemple cyber : magasins visés en Dordogne.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 39 URLs (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-24-greffe-tc-perigueux', 'https://www.greffe-tc-perigueux.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-greffe-tc-perigueux', 'https://www.greffe-tc-perigueux.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-notaires-dordogne', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/dordogne', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-notaires-dordogne', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-notaires-dordogne', 'https://www.notaires.fr/rss/actualites', 'application/rss+xml; charset=utf-8', 195),
    ('corpus:juridique-24-notaires-perigueux', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/dordogne/perigueux', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-notaires-perigueux', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-notaires-perigueux', 'https://www.notaires.fr/rss/actualites', 'application/rss+xml; charset=utf-8', 195),
    ('corpus:juridique-24-barreau-perigueux', 'https://consultation.avocat.fr/avocats/barreau-perigueux.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-24-barreau-perigueux', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 5),
    ('corpus:juridique-24-barreau-perigueux', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8', 17),
    ('corpus:juridique-24-cci-dordogne', 'https://dordogne.cci.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-cci-dordogne', 'https://dordogne.cci.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-cci-dordogne', 'https://dordogne.cci.fr/feed/', 'application/rss+xml; charset=UTF-8', 11),
    ('corpus:juridique-24-cma-dordogne', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-cma-dordogne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-annonces-legales', 'https://www.annonces-legales.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-annonces-legales', 'https://www.annonces-legales.fr/actualite/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-annonces-legales', 'https://www.annonces-legales.fr/actualite/feed/', 'application/rss+xml; charset=UTF-8', 13),
    ('corpus:juridique-24-ici-perigord', 'https://www.ici.fr/nouvelle-aquitaine/dordogne-24', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-ici-perigord', 'https://www.ici.fr/nouvelle-aquitaine/dordogne-24/actu', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-ici-perigord', 'https://www.ici.fr/rss/perigord/rubrique/infos.xml', 'application/xml', 3),
    ('corpus:juridique-24-france3-dordogne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-france3-dordogne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/perigueux/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-france3-dordogne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/dordogne/rss', 'text/xml; charset=UTF-8', 24),
    ('corpus:juridique-24-franceinfo-dordogne', 'https://www.franceinfo.fr/france/nouvelle-aquitaine/dordogne/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-franceinfo-dordogne', 'https://www.franceinfo.fr/societe/justice.rss', 'text/xml; charset=UTF-8', 23),
    ('corpus:juridique-24-actu-fr-perigueux', 'https://actu.fr/nouvelle-aquitaine/perigueux_24322/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-actu-fr-perigueux', 'https://actu.fr/nouvelle-aquitaine/perigueux_24322/faits-divers/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-dordogne-libre', 'https://www.dordognelibre.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-dordogne-libre', 'https://www.dordognelibre.fr/dordogne/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-dordogne-libre', 'https://www.dordognelibre.fr/rss.xml', 'application/xml', 11),
    ('corpus:juridique-24-courrier-francais', 'https://www.courrier-francais.com/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-courrier-francais', 'https://www.courrier-francais.com/actualites-dordogne.html', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-24-village-justice', 'https://www.village-justice.com/articles/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-24-dalloz-actualite', 'https://www.dalloz-actualite.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-24-dalloz-actualite', 'https://www.dalloz-actualite.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-24-democrate-independant', 'https://www.ledemocratedebergerac.fr/', 'text/html', 0),
    ('corpus:juridique-24-democrate-independant', 'https://www.ledemocratedebergerac.fr/feed/', 'application/rss+xml; charset=UTF-8', 10)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-24 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
