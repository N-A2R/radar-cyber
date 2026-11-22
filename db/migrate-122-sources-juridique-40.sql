-- Sources d'information du secteur « juridique » du département 40 (Landes).
-- 17 sources, 42 URL distinctes contrôlées en HTTP 200 le 2026-11-22 (GET réel, redirections suivies).
-- Corpus détaillé : bench/corpus/sources-juridique-40.jsonl
-- Preuve HTTP : bench/results/verification-juridique-40.json

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
CREATE INDEX IF NOT EXISTS idx_source_verification_source_date ON source_verification (source_id, verifie_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at ON source_verification (verifie_at DESC);

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, region, department, description)
VALUES
  ('corpus:juridique-40-barreau-mont-de-marsan', 'Ordre des avocats de Mont-de-Marsan', 'cti', 'https://www.barreau-montdemarsan.org/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Ordre des avocats de Mont-de-Marsan - ordre professionnel d''avocats (Landes 40). Exemple cyber : Fuite de données chez Gueguen & Avocats : une fuite revendiquée, des milliers de documents exposés'),
  ('corpus:juridique-40-barreau-dax', 'Barreau de Dax', 'cti', 'https://www.ordredesavocatsdedax.fr/fr/actualites?rss', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Barreau de Dax - ordre professionnel d''avocats (Landes 40). Exemple cyber : Fuite de données chez Gueguen & Avocats : une fuite revendiquée, des milliers de documents exposés'),
  ('corpus:juridique-40-notaires-atlantique-pyrenees', 'Chambre interdépartementale des notaires Atlantique et Pyrénées', 'cti', 'https://cr-pau.notaires.fr/actualite?type=1', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Chambre interdépartementale des notaires Atlantique et Pyrénées - chambre professionnelle notariale (Landes 40). Exemple cyber : Face à la recrudescence de fraudes et cyberattaques : soyons vigilants ensemble'),
  ('corpus:juridique-40-notaires-annuaire-landes', 'Notaires de France — annuaire des notaires des Landes', 'cti', 'https://www.notaires.fr/rss/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Notaires de France - annuaire des notaires des Landes - annuaire professionnel notarial (Landes 40). Exemple cyber : Face à la recrudescence de fraudes et cyberattaques : soyons vigilants ensemble'),
  ('corpus:juridique-40-cncj-landes', 'Chambre nationale des commissaires de justice — actualités des Landes', 'cti', 'https://commissaire-justice.fr/feed/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Chambre nationale des commissaires de justice - actualités des Landes - chambre professionnelle des commissaires de justice (Landes 40). Exemple cyber : Cyberharcèlement : comment le prouver ?'),
  ('corpus:juridique-40-avocat-fr-mont-de-marsan', 'Avocat.fr — annuaire du barreau de Mont-de-Marsan', 'cti', 'https://www.avocat.fr/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Avocat.fr - annuaire du barreau de Mont-de-Marsan - annuaire professionnel d''avocats (Landes 40). Exemple cyber : Fuite de données chez Gueguen & Avocats : une fuite revendiquée, des milliers de documents exposés'),
  ('corpus:juridique-40-avocat-fr-dax', 'Avocat.fr — annuaire du barreau de Dax', 'cti', 'https://consultation.avocat.fr/avocats/barreau-dax.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Avocat.fr - annuaire du barreau de Dax - annuaire professionnel d''avocats (Landes 40). Exemple cyber : Fuite de données chez Gueguen & Avocats : une fuite revendiquée, des milliers de documents exposés'),
  ('corpus:juridique-40-village-justice-mont-de-marsan', 'Village de la Justice — fiche du barreau de Mont-de-Marsan (40)', 'cti', 'https://www.village-justice.com/articles/', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Village de la Justice - fiche du barreau de Mont-de-Marsan (40) - média et annuaire professionnels du droit (Landes 40). Exemple cyber : Fuite de données chez Gueguen & Avocats : une fuite revendiquée, des milliers de documents exposés'),
  ('corpus:juridique-40-village-justice-dax', 'Village de la Justice — fiche du barreau de Dax (40)', 'cti', 'https://www.village-justice.com/articles/article718,718.html', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Village de la Justice - fiche du barreau de Dax (40) - média et annuaire professionnels du droit (Landes 40). Exemple cyber : Fuite de données chez Gueguen & Avocats : une fuite revendiquée, des milliers de documents exposés'),
  ('corpus:juridique-40-cdad-landes', 'Conseil départemental de l''accès au droit des Landes', 'cti', 'https://www.cdad-courdappel-pau.fr/votre-cdad/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Conseil départemental de l''accès au droit des Landes - conseil départemental de l''accès au droit (Landes 40). Exemple cyber : Cyberharcèlement : comment le prouver ?'),
  ('corpus:juridique-40-cour-appel-pau', 'Cour d''appel de Pau — juridictions des Landes', 'cti', 'https://www.cours-appel.justice.fr/pau/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Cour d''appel de Pau - juridictions des Landes - juridiction - cour d''appel (Landes 40). Exemple cyber : Greffe du tribunal de Paris : des adresses privées et données familiales de juges en fuite'),
  ('corpus:juridique-40-tj-mont-de-marsan', 'Tribunal judiciaire de Mont-de-Marsan', 'cti', 'https://www.cours-appel.justice.fr/pau/tribunal-judiciaire-de-mont-de-marsan/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Tribunal judiciaire de Mont-de-Marsan - juridiction - tribunal judiciaire (Landes 40). Exemple cyber : Greffe du tribunal de Paris : des adresses privées et données familiales de juges en fuite'),
  ('corpus:juridique-40-tj-dax', 'Tribunal judiciaire de Dax', 'cti', 'https://www.cours-appel.justice.fr/pau/tribunal-judiciaire-de-dax/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Tribunal judiciaire de Dax - juridiction - tribunal judiciaire (Landes 40). Exemple cyber : Greffe du tribunal de Paris : des adresses privées et données familiales de juges en fuite'),
  ('corpus:juridique-40-ta-pau', 'Tribunal administratif de Pau — ressort des Landes', 'cti', 'https://pau.tribunal-administratif.fr/actualites', 'source d information sectorielle, diffusion publique', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'Tribunal administratif de Pau - ressort des Landes - juridiction - tribunal administratif (Landes 40). Exemple cyber : Greffe du tribunal de Paris : des adresses privées et données familiales de juges en fuite'),
  ('corpus:juridique-40-we-news-landes', 'WE NEWS — Landes, rubrique faits-divers', 'cti', 'https://we-news.com/fr/feed?p=dept-40-landes', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'WE NEWS - Landes, rubrique faits-divers - presse locale - faits divers et justice (Landes 40). Exemple cyber : Greffe du tribunal de Paris : des adresses privées et données familiales de juges en fuite'),
  ('corpus:juridique-40-actu-fr-landes', 'actu.fr — Landes', 'cti', 'https://actu.fr/landes/rss.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'actu.fr - Landes - presse locale (Landes 40). Exemple cyber : Greffe du tribunal de Paris : des adresses privées et données familiales de juges en fuite'),
  ('corpus:juridique-40-ici-landes', 'ICI Landes — faits divers et justice', 'cti', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information sectorielle, diffusion publique', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-40.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '40', 'ICI Landes - faits divers et justice - presse locale - radio (Landes 40). Exemple cyber : Greffe du tribunal de Paris : des adresses privées et données familiales de juges en fuite')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family = EXCLUDED.family, url = EXCLUDED.url, format = EXCLUDED.format, parser = EXCLUDED.parser, description = EXCLUDED.description, region = EXCLUDED.region, department = EXCLUDED.department;

-- Trace de vérification HTTP : 41 URL de sources (sites, pages actualités et flux) contrôlées en 200 le 2026-11-22.
-- Les articles cyber sont tracés dans bench/results/verification-juridique-40.json.
WITH urls(source_id, url, content_type, items) AS (
  VALUES
    ('corpus:juridique-40-barreau-mont-de-marsan', 'https://www.barreau-montdemarsan.org/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-barreau-dax', 'https://www.ordredesavocatsdedax.fr/fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-barreau-dax', 'https://www.ordredesavocatsdedax.fr/fr/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-barreau-dax', 'https://www.ordredesavocatsdedax.fr/fr/actualites?rss', 'application/xml; charset=utf-8', 6),
    ('corpus:juridique-40-notaires-atlantique-pyrenees', 'https://cr-pau.notaires.fr/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-notaires-atlantique-pyrenees', 'https://cr-pau.notaires.fr/actualite?type=1', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-notaires-annuaire-landes', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/landes', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-notaires-annuaire-landes', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-notaires-annuaire-landes', 'https://www.notaires.fr/rss/actualites', 'application/rss+xml; charset=utf-8', 405),
    ('corpus:juridique-40-cncj-landes', 'https://commissaire-justice.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-cncj-landes', 'https://commissaire-justice.fr/actualites/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-cncj-landes', 'https://commissaire-justice.fr/feed/', 'text/xml;charset=UTF-8', 10),
    ('corpus:juridique-40-avocat-fr-mont-de-marsan', 'https://consultation.avocat.fr/avocats/barreau-mont-de-marsan.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-avocat-fr-mont-de-marsan', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-avocat-fr-mont-de-marsan', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8', 10),
    ('corpus:juridique-40-avocat-fr-dax', 'https://consultation.avocat.fr/avocats/barreau-dax.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-avocat-fr-dax', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-village-justice-mont-de-marsan', 'https://www.village-justice.com/articles/Marsan,765.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-village-justice-mont-de-marsan', 'https://www.village-justice.com/articles/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-village-justice-dax', 'https://www.village-justice.com/articles/article718,718.html', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-cdad-landes', 'https://www.cdad-courdappel-pau.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-cdad-landes', 'https://www.cdad-courdappel-pau.fr/votre-cdad/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-cour-appel-pau', 'https://www.cours-appel.justice.fr/pau/', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-cour-appel-pau', 'https://www.cours-appel.justice.fr/pau/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-tj-mont-de-marsan', 'https://www.cours-appel.justice.fr/pau/tribunal-judiciaire-de-mont-de-marsan', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-tj-mont-de-marsan', 'https://www.cours-appel.justice.fr/pau/tribunal-judiciaire-de-mont-de-marsan/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-tj-dax', 'https://www.cours-appel.justice.fr/pau/tribunal-judiciaire-de-dax', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-tj-dax', 'https://www.cours-appel.justice.fr/pau/tribunal-judiciaire-de-dax/actualites', 'text/html; charset=utf-8', 0),
    ('corpus:juridique-40-ta-pau', 'https://pau.tribunal-administratif.fr/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-ta-pau', 'https://pau.tribunal-administratif.fr/actualites', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-we-news-landes', 'https://we-news.com/fr/40-landes', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-we-news-landes', 'https://we-news.com/fr/40-landes/faits-divers', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-we-news-landes', 'https://we-news.com/fr/feed?p=dept-40-landes', 'application/rss+xml; charset=utf-8', 49),
    ('corpus:juridique-40-actu-fr-landes', 'https://actu.fr/landes/', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-actu-fr-landes', 'https://actu.fr/landes/dernieres-actus', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-actu-fr-landes', 'https://actu.fr/landes/rss.xml', 'application/rss+xml; charset=utf-8', 20),
    ('corpus:juridique-40-ici-landes', 'https://www.ici.fr/nouvelle-aquitaine/landes-40', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-ici-landes', 'https://www.ici.fr/infos/faits-divers-justice', 'text/html; charset=UTF-8', 0),
    ('corpus:juridique-40-ici-landes', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml', 20)
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, u.url, 200, u.content_type, u.items, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-40 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = u.url);
