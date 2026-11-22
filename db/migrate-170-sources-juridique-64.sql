-- Sources d'information du secteur « juridique » du département 64 (Pyrénées-Atlantiques).
-- 16 sources, 44 URLs contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-juridique-64.jsonl
-- Preuve HTTP : bench/results/verification-juridique-64.json

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
  ('corpus:juridique-64-ordre-des-avocats-de-pau', 'Ordre des avocats de Pau', 'cti', 'https://www.avocats-pau.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; ordre professionnel d''avocats ; actualités : https://www.avocats-pau.fr/'),
  ('corpus:juridique-64-chambre-interdepartementale-des-notaires-atlantique-et-pyrenees', 'Chambre interdépartementale des notaires Atlantique et Pyrénées (Pau)', 'cti', 'https://cr-pau.notaires.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; chambre professionnelle notariale ; actualités : https://cr-pau.notaires.fr/actualite'),
  ('corpus:juridique-64-tribunal-administratif-de-pau', 'Tribunal administratif de Pau', 'cti', 'https://pau.tribunal-administratif.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; juridiction administrative ; actualités : https://pau.tribunal-administratif.fr/actualites'),
  ('corpus:juridique-64-cour-d-appel-de-pau', 'Cour d''appel de Pau', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/cour-d-appel-de-pau', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; juridiction ; actualités : https://www.justice.gouv.fr/actualites'),
  ('corpus:juridique-64-tribunal-de-commerce-de-pau', 'Tribunal de commerce de Pau', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-de-commerce-de-pau', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; juridiction ; actualités : https://www.justice.gouv.fr/actualites'),
  ('corpus:juridique-64-tribunal-judiciaire-de-pau', 'Tribunal judiciaire de Pau', 'cti', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-judiciaire-de-pau', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; juridiction ; actualités : https://www.justice.gouv.fr/actualites'),
  ('corpus:juridique-64-cci-pau-bearn', 'CCI Pau Béarn', 'cti', 'https://pau.cci.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; chambre consulaire — commerce et industrie ; actualités : https://pau.cci.fr/blog/'),
  ('corpus:juridique-64-cma-nouvelle-aquitaine-pyrenees-atlantiques', 'CMA Nouvelle-Aquitaine — Pyrénées-Atlantiques', 'cti', 'https://cma-nouvelleaquitaine.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; chambre consulaire — métiers et artisanat ; actualités : https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites'),
  ('corpus:juridique-64-ici-bearn-bigorre', 'ici Béarn Bigorre — faits divers et justice', 'cti', 'https://www.ici.fr/radio/bearn', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; presse locale — radio publique ; actualités : https://www.ici.fr/infos/faits-divers-justice'),
  ('corpus:juridique-64-la-republique-des-pyrenees', 'La République des Pyrénées', 'cti', 'https://www.larepubliquedespyrenees.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; presse quotidienne locale ; actualités : https://www.larepubliquedespyrenees.fr/faits-divers/justice/'),
  ('corpus:juridique-64-udaf-64', 'UDAF 64 — Union départementale des associations familiales', 'cti', 'https://www.udaf64.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; union d''associations — droit de la famille ; actualités : https://www.udaf64.fr/actualites/'),
  ('corpus:juridique-64-notaires-de-france-annuaire-des-pyrenees-atlantiques', 'Notaires de France — annuaire des Pyrénées-Atlantiques', 'cti', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/pyrenees-atlantiques', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; annuaire professionnel notarial ; actualités : https://www.notaires.fr/fr/actualites'),
  ('corpus:juridique-64-chambre-nationale-des-commissaires-de-justice', 'Chambre nationale des commissaires de justice', 'cti', 'https://commissaire-justice.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; ordre professionnel ; actualités : https://commissaire-justice.fr/actualites/'),
  ('corpus:juridique-64-avocat-fr-actualites-du-barreau', 'Avocat.fr — actualités du barreau', 'cti', 'https://www.avocat.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; annuaire et actualités de la profession d''avocat ; actualités : https://www.avocat.fr/actualites'),
  ('corpus:juridique-64-ordre-des-avocats-de-bayonne', 'Ordre des avocats de Bayonne', 'cti', 'https://www.avocats-bayonne.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; ordre professionnel d''avocats ; actualités : https://www.avocats-bayonne.org/le-barreau/actualites.html'),
  ('corpus:juridique-64-greffe-du-tribunal-de-commerce-de-pau', 'Greffe du tribunal de commerce de Pau', 'cti', 'https://www.greffe-tc-pau.fr/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-64.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '64', 'Source juridique — Pyrénées-Atlantiques (64) ; greffe — juridiction consulaire ; actualités : https://www.greffe-tc-pau.fr/actualites')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family, url = EXCLUDED.url,
  format = EXCLUDED.format, parser = EXCLUDED.parser, description = EXCLUDED.description,
  region = EXCLUDED.region, department = EXCLUDED.department;

-- Trace de vérification HTTP : 44 URLs contrôlées en 200 le 2026-11-22.
WITH urls(source_id, url, content_type, items, ms) AS (
  VALUES
    ('corpus:juridique-64-ordre-des-avocats-de-pau', 'https://www.avocats-pau.fr/', 'text/html; charset=UTF-8', 0, 1226),
    ('corpus:juridique-64-ordre-des-avocats-de-pau', 'https://www.avocats-pau.fr/rss.xml', 'application/xml; charset=UTF-8', 0, 182),
    ('corpus:juridique-64-chambre-interdepartementale-des-notaires-atlantique-et-pyrenees', 'https://cr-pau.notaires.fr/', 'text/html; charset=utf-8', 0, 541),
    ('corpus:juridique-64-chambre-interdepartementale-des-notaires-atlantique-et-pyrenees', 'https://cr-pau.notaires.fr/actualite', 'text/html; charset=utf-8', 0, 368),
    ('corpus:juridique-64-tribunal-administratif-de-pau', 'https://pau.tribunal-administratif.fr/', 'text/html; charset=UTF-8', 0, 521),
    ('corpus:juridique-64-tribunal-administratif-de-pau', 'https://pau.tribunal-administratif.fr/actualites', 'text/html; charset=UTF-8', 0, 769),
    ('corpus:juridique-64-tribunal-administratif-de-pau', 'https://pau.tribunal-administratif.fr/flux-rss/dernieres-decisions', 'xml', 20, 130),
    ('corpus:juridique-64-cour-d-appel-de-pau', 'https://www.justice.gouv.fr/annuaire/fiche/cour-d-appel-de-pau', 'text/html; charset=utf-8', 0, 161),
    ('corpus:juridique-64-cour-d-appel-de-pau', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0, 215),
    ('corpus:juridique-64-cour-d-appel-de-pau', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10, 162),
    ('corpus:juridique-64-tribunal-de-commerce-de-pau', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-de-commerce-de-pau', 'text/html; charset=utf-8', 0, 409),
    ('corpus:juridique-64-tribunal-de-commerce-de-pau', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0, 736),
    ('corpus:juridique-64-tribunal-de-commerce-de-pau', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10, 181),
    ('corpus:juridique-64-tribunal-judiciaire-de-pau', 'https://www.justice.gouv.fr/annuaire/fiche/tribunal-judiciaire-de-pau', 'text/html; charset=utf-8', 0, 170),
    ('corpus:juridique-64-tribunal-judiciaire-de-pau', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8', 0, 381),
    ('corpus:juridique-64-tribunal-judiciaire-de-pau', 'https://www.justice.gouv.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10, 136),
    ('corpus:juridique-64-cci-pau-bearn', 'https://pau.cci.fr/', 'text/html; charset=UTF-8', 0, 2601),
    ('corpus:juridique-64-cci-pau-bearn', 'https://pau.cci.fr/blog/', 'text/html; charset=UTF-8', 0, 2627),
    ('corpus:juridique-64-cci-pau-bearn', 'https://pau.cci.fr/feed/', 'application/rss+xml; charset=UTF-8', 10, 1267),
    ('corpus:juridique-64-cma-nouvelle-aquitaine-pyrenees-atlantiques', 'https://cma-nouvelleaquitaine.fr/', 'text/html; charset=UTF-8', 0, 111),
    ('corpus:juridique-64-cma-nouvelle-aquitaine-pyrenees-atlantiques', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8', 0, 140),
    ('corpus:juridique-64-ici-bearn-bigorre', 'https://www.ici.fr/radio/bearn', 'text/html; charset=UTF-8', 0, 175),
    ('corpus:juridique-64-ici-bearn-bigorre', 'https://www.ici.fr/infos/faits-divers-justice', 'text/html; charset=UTF-8', 0, 223),
    ('corpus:juridique-64-ici-bearn-bigorre', 'https://www.ici.fr/rss/bearn/rubrique/infos.xml', 'application/xml', 20, 103),
    ('corpus:juridique-64-la-republique-des-pyrenees', 'https://www.larepubliquedespyrenees.fr/', 'text/html; charset=UTF-8', 0, 161),
    ('corpus:juridique-64-la-republique-des-pyrenees', 'https://www.larepubliquedespyrenees.fr/faits-divers/justice/', 'text/html; charset=UTF-8', 0, 160),
    ('corpus:juridique-64-la-republique-des-pyrenees', 'https://www.larepubliquedespyrenees.fr/rss.xml', 'application/xml', 20, 173),
    ('corpus:juridique-64-udaf-64', 'https://www.udaf64.fr/', 'text/html; charset=UTF-8', 0, 127),
    ('corpus:juridique-64-udaf-64', 'https://www.udaf64.fr/actualites/', 'text/html; charset=UTF-8', 0, 120),
    ('corpus:juridique-64-udaf-64', 'https://www.udaf64.fr/feed/', 'application/rss+xml; charset=UTF-8', 10, 97),
    ('corpus:juridique-64-notaires-de-france-annuaire-des-pyrenees-atlantiques', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/pyrenees-atlantiques', 'text/html; charset=UTF-8', 0, 190),
    ('corpus:juridique-64-notaires-de-france-annuaire-des-pyrenees-atlantiques', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0, 114),
    ('corpus:juridique-64-notaires-de-france-annuaire-des-pyrenees-atlantiques', 'https://www.notaires.fr/fr/rss/actualites', 'application/rss+xml; charset=utf-8', 420, 159),
    ('corpus:juridique-64-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/', 'text/html; charset=UTF-8', 0, 771),
    ('corpus:juridique-64-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/actualites/', 'text/html; charset=UTF-8', 0, 933),
    ('corpus:juridique-64-chambre-nationale-des-commissaires-de-justice', 'https://commissaire-justice.fr/feed/', 'text/xml;charset=UTF-8', 10, 727),
    ('corpus:juridique-64-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/', 'text/html; charset=UTF-8', 0, 152),
    ('corpus:juridique-64-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0, 144),
    ('corpus:juridique-64-avocat-fr-actualites-du-barreau', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10, 103),
    ('corpus:juridique-64-ordre-des-avocats-de-bayonne', 'https://www.avocats-bayonne.org/', 'text/html; charset=utf-8', 0, 367),
    ('corpus:juridique-64-ordre-des-avocats-de-bayonne', 'https://www.avocats-bayonne.org/le-barreau/actualites.html', 'text/html; charset=utf-8', 0, 163),
    ('corpus:juridique-64-ordre-des-avocats-de-bayonne', 'https://www.avocats-bayonne.org/le-barreau/actualites.feed?type=rss', 'application/rss+xml; charset=utf-8', 2, 150),
    ('corpus:juridique-64-greffe-du-tribunal-de-commerce-de-pau', 'https://www.greffe-tc-pau.fr/', 'text/html; charset=UTF-8', 0, 229),
    ('corpus:juridique-64-greffe-du-tribunal-de-commerce-de-pau', 'https://www.greffe-tc-pau.fr/actualites', 'text/html; charset=UTF-8', 0, 202)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, u.ms, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-64 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
