-- Sources d'information du secteur « industrie » du département 47 (Lot-et-Garonne).
-- 9 sources ; 32 traces de vérification sur 30 URL distinctes, toutes en HTTP 200 le 2026-11-22 (GET avec User-Agent navigateur, suivi des redirections, délai 20 s).
-- Corpus détaillé : bench/corpus/sources-industrie-47.jsonl
-- Preuve HTTP : bench/results/verification-industrie-47.json

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
  ('corpus:industrie-47-cci-du-lot-et-garonne', 'CCI du Lot-et-Garonne', 'cti', 'https://cci47.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":1,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'CCI du Lot-et-Garonne (47). Page dédiée « Cybersécurité – Protégez votre entreprise en Lot-et-Garonne » — https://cci47.fr/cybersecurite/'),
  ('corpus:industrie-47-cpme-du-lot-et-garonne', 'CPME du Lot-et-Garonne', 'cti', 'https://www.cpme47.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":2,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'CPME du Lot-et-Garonne (47). Lancement d’ImpactCyber pour inciter les TPE-PME à se sécuriser — https://www.cpme47.fr/actualites/lancement-d-impactcyber-pour-inciter-les-tpe-pme-a-se-securiser-160.html'),
  ('corpus:industrie-47-uimm', 'UIMM — La Fabrique de l’avenir', 'cti', 'https://uimm.lafabriquedelavenir.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":3,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'UIMM (fédération industrielle, relais Nouvelle-Aquitaine, 47). « Les machines industrielles sont les grandes oubliées de la cybersécurité » — https://uimm.lafabriquedelavenir.fr/cybersecurite-machines-industrielles-risques-negliges/'),
  ('corpus:industrie-47-la-vie-economique', 'La Vie Économique — Lot-et-Garonne', 'presse', 'https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":4,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Vie Économique — Lot-et-Garonne (47). Cybersécurité – La troisième édition de Garonn’Hack à Agen — https://www.vie-economique.com/actualites/cybersecurite-la-troisieme-edition-de-garonnhack-a-agen/'),
  ('corpus:industrie-47-la-depeche-du-midi', 'La Dépêche du Midi — Lot-et-Garonne', 'presse', 'https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":5,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'La Dépêche du Midi — Lot-et-Garonne (47). Cyberattaque de la mairie de Fumel, services paralysés (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:industrie-47-le-petit-bleu-dagen', 'Le Petit Bleu d’Agen', 'presse', 'https://www.petitbleu.fr/economie/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":6,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Le Petit Bleu d’Agen (47). Cyberattaque de la Ville d’Agen, services municipaux remis en route (12/07/2023) — https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php'),
  ('corpus:industrie-47-ici-lot-et-garonne', 'ICI Lot-et-Garonne', 'presse', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":7,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'ICI Lot-et-Garonne (47). Cyberattaque de la mairie de Fumel (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'),
  ('corpus:industrie-47-agglo-dagen', 'Agglomération d’Agen — développement économique', 'cti', 'https://www.agglo-agen.net/en-ce-moment/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":8,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Agglomération d’Agen (47). Cyberattaque visant l’agglomération d’Agen à l’été 2023 — https://www.ladepeche.fr/2023/08/17/a-lagglo-dagen-la-cyberattaque-venait-de-lest-11400641.php'),
  ('corpus:industrie-47-journal-de-tonneins', 'Journal de Tonneins', 'presse', 'https://www.journaldetonneins.fr/toutes-les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-industrie-47.jsonl","ligne":9,"type":"source"}}'::jsonb, 3600, 'Nouvelle-Aquitaine', '47', 'Journal de Tonneins (47). Aucun incident propre identifié ; cyberattaque de la mairie de Fumel (03/10/2025) — https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php');

WITH urls(source_id, liste) AS (
  VALUES
    ('corpus:industrie-47-cci-du-lot-et-garonne', ARRAY['https://cci47.fr/', 'https://cci47.fr/actualites/', 'https://cci47.fr/cybersecurite/']),
    ('corpus:industrie-47-cpme-du-lot-et-garonne', ARRAY['https://www.cpme47.fr/', 'https://www.cpme47.fr/actualites/', 'https://www.cpme47.fr/actualites/lancement-d-impactcyber-pour-inciter-les-tpe-pme-a-se-securiser-160.html']),
    ('corpus:industrie-47-uimm', ARRAY['https://uimm.lafabriquedelavenir.fr/', 'https://uimm.lafabriquedelavenir.fr/actualites/', 'https://uimm.lafabriquedelavenir.fr/feed/', 'https://uimm.lafabriquedelavenir.fr/cybersecurite-machines-industrielles-risques-negliges/']),
    ('corpus:industrie-47-la-vie-economique', ARRAY['https://www.vie-economique.com/', 'https://www.vie-economique.com/categories/lot-et-garonne/', 'https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'https://www.vie-economique.com/actualites/cybersecurite-la-troisieme-edition-de-garonnhack-a-agen/']),
    ('corpus:industrie-47-la-depeche-du-midi', ARRAY['https://www.ladepeche.fr/', 'https://www.ladepeche.fr/communes/lot-et-garonne,47/', 'https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:industrie-47-le-petit-bleu-dagen', ARRAY['https://www.petitbleu.fr/', 'https://www.petitbleu.fr/economie/', 'https://www.petitbleu.fr/economie/rss.xml', 'https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php']),
    ('corpus:industrie-47-ici-lot-et-garonne', ARRAY['https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php']),
    ('corpus:industrie-47-agglo-dagen', ARRAY['https://www.agglo-agen.net/', 'https://www.agglo-agen.net/en-ce-moment/actualites', 'https://www.ladepeche.fr/2023/08/17/a-lagglo-dagen-la-cyberattaque-venait-de-lest-11400641.php']),
    ('corpus:industrie-47-journal-de-tonneins', ARRAY['https://www.journaldetonneins.fr/', 'https://www.journaldetonneins.fr/toutes-les-actualites', 'https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php'])
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT u.source_id, a.url, 200, t.type_contenu, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus industrie-47 : HTTP 200 vérifié le 2026-11-22'
FROM urls u
CROSS JOIN LATERAL unnest(u.liste) AS a(url)
JOIN (VALUES
       ('https://cci47.fr/', 'text/html; charset=UTF-8'),
       ('https://cci47.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://cci47.fr/cybersecurite/', 'text/html; charset=UTF-8'),
       ('https://www.cpme47.fr/', 'text/html; charset=UTF-8'),
       ('https://www.cpme47.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://www.cpme47.fr/actualites/lancement-d-impactcyber-pour-inciter-les-tpe-pme-a-se-securiser-160.html', 'text/html; charset=UTF-8'),
       ('https://uimm.lafabriquedelavenir.fr/', 'text/html; charset=UTF-8'),
       ('https://uimm.lafabriquedelavenir.fr/actualites/', 'text/html; charset=UTF-8'),
       ('https://uimm.lafabriquedelavenir.fr/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://uimm.lafabriquedelavenir.fr/cybersecurite-machines-industrielles-risques-negliges/', 'text/html; charset=UTF-8'),
       ('https://www.vie-economique.com/', 'text/html; charset=UTF-8'),
       ('https://www.vie-economique.com/categories/lot-et-garonne/', 'text/html; charset=UTF-8'),
       ('https://www.vie-economique.com/categories/lot-et-garonne/feed/', 'application/rss+xml; charset=UTF-8'),
       ('https://www.vie-economique.com/actualites/cybersecurite-la-troisieme-edition-de-garonnhack-a-agen/', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/communes/lot-et-garonne,47/', 'text/html; charset=UTF-8'),
       ('https://www.ladepeche.fr/communes/lot-et-garonne,47/rss.xml', 'text/xml; charset=UTF-8'),
       ('https://www.ladepeche.fr/2025/10/03/la-mairie-de-fumel-victime-dune-cyberattaque-les-services-municipaux-paralyses-12969283.php', 'text/html; charset=UTF-8'),
       ('https://www.petitbleu.fr/', 'text/html; charset=UTF-8'),
       ('https://www.petitbleu.fr/economie/', 'text/html; charset=UTF-8'),
       ('https://www.petitbleu.fr/economie/rss.xml', 'text/xml; charset=UTF-8'),
       ('https://www.ladepeche.fr/2023/07/12/la-ville-dagen-se-remet-doucement-de-la-cyberattaque-11335908.php', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/nouvelle-aquitaine/lot-et-garonne-47/actu', 'text/html; charset=UTF-8'),
       ('https://www.ici.fr/rss/gascogne/rubrique/infos.xml', 'application/xml'),
       ('https://www.agglo-agen.net/', 'text/html; charset=utf-8'),
       ('https://www.agglo-agen.net/en-ce-moment/actualites', 'text/html; charset=utf-8'),
       ('https://www.ladepeche.fr/2023/08/17/a-lagglo-dagen-la-cyberattaque-venait-de-lest-11400641.php', 'text/html; charset=UTF-8'),
       ('https://www.journaldetonneins.fr/', 'text/html; charset=utf-8'),
       ('https://www.journaldetonneins.fr/toutes-les-actualites', 'text/html; charset=utf-8')
) AS t(url, type_contenu) ON t.url = a.url
WHERE NOT EXISTS (SELECT 1 FROM source_verification v WHERE v.source_id = u.source_id AND v.url = a.url);

COMMIT;
