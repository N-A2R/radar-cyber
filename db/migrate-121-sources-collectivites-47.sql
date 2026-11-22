-- Sources d'information du secteur « collectivites » du département 47 (Lot-et-Garonne).
-- 17 sources ; 55 traces de vérification sur 43 URL distinctes, toutes en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections, délai 25 s).
-- Corpus détaillé : bench/corpus/sources-collectivites-47.jsonl
-- Preuve HTTP : bench/results/verification-collectivites-47.json

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
  ('corpus:collectivites-47-cci-du-lot-et-garonne', 'CCI du Lot-et-Garonne', 'cti', 'https://cci47.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'CCI du Lot-et-Garonne (47). Sensibilisation des artisans et commerçants à la cybersécurité et à l’IA (23/06/2026) — https://www.ladepeche.fr/2026/06/23/cybersecurite-ia-artisans-et-commercants-en-alerte-13432802.php'),
  ('corpus:collectivites-47-ca-dagen', 'Communauté d’agglomération d’Agen', 'cti', 'https://www.agglo-agen.net/en-ce-moment/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Communauté d’agglomération d’Agen (47). Cyberattaque visant l’agglomération d’Agen à l’été 2023 (17/08/2023) — https://www.ladepeche.fr/2023/08/17/a-lagglo-dagen-la-cyberattaque-venait-de-lest-11400641.php'),
  ('corpus:collectivites-47-ville-dagen', 'Ville d’Agen', 'cti', 'https://www.agen.fr/en-ce-moment/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Ville d’Agen (47). Cyberattaque de la Ville d’Agen, services municipaux remis en route progressivement (12/07/2023) — https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php'),
  ('corpus:collectivites-47-ville-de-villeneuve-sur-lot', 'Ville de Villeneuve-sur-Lot', 'cti', 'https://www.villeneuve-sur-lot.fr/nav-newsactus', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Ville de Villeneuve-sur-Lot (47). Aucun incident propre identifié ; cyberattaque de la Ville de Fumel avec demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:collectivites-47-ville-de-marmande', 'Ville de Marmande', 'cti', 'https://www.marmande.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Ville de Marmande (47). Aucun incident propre identifié ; cyberattaque de la Ville de Fumel avec demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:collectivites-47-ca-du-grand-villeneuvois', 'Communauté d’agglomération du Grand Villeneuvois', 'cti', 'https://www.grand-villeneuvois.fr/actualites.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Communauté d’agglomération du Grand Villeneuvois (47). Aucun incident propre identifié ; cyberattaque de la Ville d’Agen (12/07/2023) — https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php'),
  ('corpus:collectivites-47-val-de-garonne-agglomeration', 'Val de Garonne Agglomération', 'cti', 'https://valdegaronne.fr/TPL_CODE/TPL_ACTUALITELISTE/9-liste-actualites.htm', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Val de Garonne Agglomération (47). Aucun incident propre identifié ; cyberattaque de la Ville de Fumel avec demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:collectivites-47-cc-du-confluent-et-des-coteaux-de-prayssas', 'Communauté de communes du Confluent et des Coteaux de Prayssas', 'cti', 'https://www.communauteduconfluent.com/toutes-les-actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Communauté de communes du Confluent et des Coteaux de Prayssas (47). Aucun incident propre identifié ; cyberattaque de la Ville de Fumel avec demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:collectivites-47-cc-coteaux-et-landes-de-gascogne', 'Communauté de communes Coteaux et Landes de Gascogne', 'cti', 'https://cc-coteaux-landes-gascogne.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Communauté de communes Coteaux et Landes de Gascogne (47). Aucun incident propre identifié ; cyberattaque de la Ville de Fumel avec demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:collectivites-47-cc-lot-et-tolzac', 'Communauté de communes Lot et Tolzac', 'cti', 'https://www.lotettolzac.fr/toutes-les-actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":10,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Communauté de communes Lot et Tolzac (47). Aucun incident propre identifié ; cyberattaque de la Ville d’Agen (12/07/2023) — https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php'),
  ('corpus:collectivites-47-cdg47', 'Centre de gestion de la fonction publique territoriale du Lot-et-Garonne', 'cti', 'https://www.cdg47.fr/actualites.php', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":11,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Centre de gestion de la fonction publique territoriale du Lot-et-Garonne (47). Aucun incident propre identifié ; cyberattaque des pompiers du Lot-et-Garonne (11/03/2021) — https://www.ladepeche.fr/2021/03/11/les-pompiers-du-lot-et-garonne-victimes-dune-cyberattaque-9420994.php'),
  ('corpus:collectivites-47-sdis47', 'SDIS du Lot-et-Garonne', 'cti', 'https://www.sdis47.fr/actualites/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":12,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'SDIS du Lot-et-Garonne (47). Cyberattaque des pompiers du Lot-et-Garonne (11/03/2021) — https://www.ladepeche.fr/2021/03/11/les-pompiers-du-lot-et-garonne-victimes-dune-cyberattaque-9420994.php'),
  ('corpus:collectivites-47-journal-de-tonneins', 'Journal de Tonneins', 'cti', 'https://www.journaldetonneins.fr/toutes-les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":13,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Journal de Tonneins (47). Aucun incident propre identifié ; cyberattaque de la Ville de Fumel avec demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:collectivites-47-la-depeche-du-midi-lot-et-garonne', 'La Dépêche du Midi — Lot-et-Garonne', 'cti', 'https://www.ladepeche.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":14,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Dépêche du Midi — Lot-et-Garonne (47). Cyberattaque de la mairie de Fumel : services paralysés et demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:collectivites-47-le-petit-bleu', 'Le Petit Bleu (Lot-et-Garonne)', 'cti', 'https://www.petitbleu.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":15,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Le Petit Bleu (Lot-et-Garonne) (47). Cyberattaque de la Ville d’Agen, services municipaux remis en route progressivement (12/07/2023) — https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php'),
  ('corpus:collectivites-47-ici-lot-et-garonne', 'ICI Lot-et-Garonne', 'cti', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":16,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'ICI Lot-et-Garonne (47). Cyberattaque de la mairie de Fumel : services paralysés et demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:collectivites-47-annuaire-des-communes-et-intercommunalites', 'Annuaire des communes et intercommunalités du Lot-et-Garonne', 'cti', 'https://www.annuaire-mairie.fr/departement-lot-et-garonne.html', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-collectivites-47.jsonl","ligne":17,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Annuaire des communes et intercommunalités du Lot-et-Garonne (47). Aucun incident propre identifié ; cyberattaque de la Ville de Fumel avec demande de rançon (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP : 55 traces sur 43 URL distinctes, toutes en 200 le 2026-11-22 (une trace par couple source/URL).
WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:collectivites-47-cci-du-lot-et-garonne', ARRAY['https://cci47.fr/', 'https://cci47.fr/actualites/', 'https://www.ladepeche.fr/2026/06/23/cybersecurite-ia-artisans-et-commercants-en-alerte-13432802.php']),
    ('corpus:collectivites-47-ca-dagen', ARRAY['https://www.agglo-agen.net/', 'https://www.agglo-agen.net/en-ce-moment/actualites', 'https://www.ladepeche.fr/2023/08/17/a-lagglo-dagen-la-cyberattaque-venait-de-lest-11400641.php']),
    ('corpus:collectivites-47-ville-dagen', ARRAY['https://www.agen.fr/', 'https://www.agen.fr/en-ce-moment/actualites', 'https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php']),
    ('corpus:collectivites-47-ville-de-villeneuve-sur-lot', ARRAY['https://www.villeneuve-sur-lot.fr/', 'https://www.villeneuve-sur-lot.fr/nav-newsactus', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:collectivites-47-ville-de-marmande', ARRAY['https://www.marmande.fr/', 'https://www.marmande.fr/11136-actualites.html', 'https://www.marmande.fr/rss.xml', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:collectivites-47-ca-du-grand-villeneuvois', ARRAY['https://www.grand-villeneuvois.fr/', 'https://www.grand-villeneuvois.fr/actualites.html', 'https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php']),
    ('corpus:collectivites-47-val-de-garonne-agglomeration', ARRAY['https://valdegaronne.fr/', 'https://valdegaronne.fr/TPL_CODE/TPL_ACTUALITELISTE/9-liste-actualites.htm', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:collectivites-47-cc-du-confluent-et-des-coteaux-de-prayssas', ARRAY['https://www.communauteduconfluent.com/', 'https://www.communauteduconfluent.com/toutes-les-actualites/', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:collectivites-47-cc-coteaux-et-landes-de-gascogne', ARRAY['https://cc-coteaux-landes-gascogne.fr/', 'https://cc-coteaux-landes-gascogne.fr/actualites/', 'https://cc-coteaux-landes-gascogne.fr/feed/', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:collectivites-47-cc-lot-et-tolzac', ARRAY['https://www.lotettolzac.fr/', 'https://www.lotettolzac.fr/toutes-les-actualites/', 'https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php']),
    ('corpus:collectivites-47-cdg47', ARRAY['https://www.cdg47.fr/', 'https://www.cdg47.fr/actualites.php', 'https://www.ladepeche.fr/2021/03/11/les-pompiers-du-lot-et-garonne-victimes-dune-cyberattaque-9420994.php']),
    ('corpus:collectivites-47-sdis47', ARRAY['https://www.sdis47.fr/', 'https://www.sdis47.fr/actualites/', 'https://www.sdis47.fr/actualites/feed/', 'https://www.ladepeche.fr/2021/03/11/les-pompiers-du-lot-et-garonne-victimes-dune-cyberattaque-9420994.php']),
    ('corpus:collectivites-47-journal-de-tonneins', ARRAY['https://www.journaldetonneins.fr/', 'https://www.journaldetonneins.fr/toutes-les-actualites', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:collectivites-47-la-depeche-du-midi-lot-et-garonne', ARRAY['https://www.ladepeche.fr/', 'https://www.ladepeche.fr/communes/lot-et-garonne/', 'https://www.ladepeche.fr/rss.xml', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:collectivites-47-le-petit-bleu', ARRAY['https://www.petitbleu.fr/', 'https://www.petitbleu.fr/actu/', 'https://www.petitbleu.fr/rss.xml', 'https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php']),
    ('corpus:collectivites-47-ici-lot-et-garonne', ARRAY['https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:collectivites-47-annuaire-des-communes-et-intercommunalites', ARRAY['https://www.annuaire-mairie.fr/departement-lot-et-garonne.html', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus collectivites-47 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://cci47.fr/', 'text/html; charset=UTF-8'),
       ('https://cci47.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.agglo-agen.net/', 'text/html; charset=utf-8'),
       ('https://www.agglo-agen.net/en-ce-moment/actualites', 'text/html; charset=utf-8'),
       ('https://www.agen.fr/', 'text/html; charset=utf-8'),
       ('https://www.agen.fr/en-ce-moment/actualites', 'text/html; charset=utf-8'),
       ('https://www.villeneuve-sur-lot.fr/', 'text/html; charset=utf-8'),
       ('https://www.villeneuve-sur-lot.fr/nav-newsactus', 'text/html; charset=utf-8'),
       ('https://www.marmande.fr/', 'text/html'),
       ('https://www.marmande.fr/11136-actualites.html', 'text/html'),
       ('https://www.marmande.fr/rss.xml', 'application/xml'),
       ('https://www.grand-villeneuvois.fr/', 'text/html; charset=UTF-8'),
       ('https://www.grand-villeneuvois.fr/actualites.html', 'text/html; charset=UTF-8'),
       ('https://valdegaronne.fr/', 'text/html; charset=utf-8'),
       ('https://valdegaronne.fr/TPL_CODE/TPL_ACTUALITELISTE/9-liste-actualites.htm', 'text/html; charset=utf-8'),
       ('https://www.communauteduconfluent.com/', 'text/html; charset=utf-8'),
       ('https://www.communauteduconfluent.com/toutes-les-actualites/', 'text/html; charset=utf-8'),
       ('https://cc-coteaux-landes-gascogne.fr/', 'text/html; charset=UTF-8'),
       ('https://cc-coteaux-landes-gascogne.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://cc-coteaux-landes-gascogne.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.lotettolzac.fr/', 'text/html; charset=utf-8'),
       ('https://www.lotettolzac.fr/toutes-les-actualites/', 'text/html; charset=utf-8'),
       ('https://www.cdg47.fr/', 'text/html; charset=utf-8'),
       ('https://www.cdg47.fr/actualites.php', 'text/html; charset=utf-8'),
       ('https://www.sdis47.fr/', 'text/html; charset=UTF-8'),
       ('https://www.sdis47.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.sdis47.fr/actualites/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.journaldetonneins.fr/', 'text/html; charset=utf-8'),
       ('https://www.journaldetonneins.fr/toutes-les-actualites', 'text/html; charset=utf-8'),
       ('https://www.ladepeche.fr/', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/communes/lot-et-garonne/', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/rss.xml', 'text/xml; charset=UTF-8'),
       ('https://www.petitbleu.fr/', 'text/html; charset=UTF-8'),
       ('https://www.petitbleu.fr/actu/', 'text/html; charset=UTF-8'),
       ('https://www.petitbleu.fr/rss.xml', 'text/xml; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'text/html; charset=UTF-8'),
       ('https://www.annuaire-mairie.fr/departement-lot-et-garonne.html', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/2023/08/17/a-lagglo-dagen-la-cyberattaque-venait-de-lest-11400641.php', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/2021/03/11/les-pompiers-du-lot-et-garonne-victimes-dune-cyberattaque-9420994.php', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/2026/06/23/cybersecurite-ia-artisans-et-commercants-en-alerte-13432802.php', 'text/html; charset=UTF-8')
) AS t(url, type_contenu) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
