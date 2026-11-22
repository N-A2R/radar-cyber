-- Fixture de la frise d'exposition (`fuite_timeline`).
--
-- Trois fuites publiques *simulées* : noms, domaines `*.example` et URL
-- `example.invalid` sont fictifs, et chaque référence porte `mode: fixture`.
-- Aucune organisation réelle n'est présentée comme victime et aucune donnée
-- personnelle n'est écrite (ni courriel, ni mot de passe, ni victime).
--
-- 24 organisations régionales reçoivent deux des trois fuites, séparées de
-- plus d'un an : chaque couple `(org_id, source)` a donc `first_seen` distinct
-- de `last_seen` et un seul ressaut (`episodes = 2`, `resurgences = 1`).
-- Deux témoins complètent le jeu :
--   * `ftl-org-unique` : une seule exposition, `first_seen = last_seen` ;
--   * `ftl-org-hors-na` : département 75, exclu de la frise régionale.
--
-- Le fichier est idempotent : il efface d'abord ses propres lignes.

DELETE FROM fuite_reference WHERE source = 'fuite-publique-fixture';
DELETE FROM org WHERE slug LIKE 'ftl-org-%';

INSERT INTO fuite_reference (id, source, name, domain, breach_date, accounts, source_url, evidence)
VALUES
  ('fuite-timeline:pub-2019', 'fuite-publique-fixture',
   'Fuite publique simulée — janvier 2019', 'plateforme-partagee.example',
   '2019-01-16', 12500, 'https://example.invalid/fuite-timeline/2019',
   '{"mode":"fixture","rang":1}'::jsonb),
  ('fuite-timeline:pub-2021', 'fuite-publique-fixture',
   'Fuite publique simulée — juin 2021', 'plateforme-partagee.example',
   '2021-06-22', 4800, 'https://example.invalid/fuite-timeline/2021',
   '{"mode":"fixture","rang":2}'::jsonb),
  ('fuite-timeline:pub-2023', 'fuite-publique-fixture',
   'Fuite publique simulée — novembre 2023', 'plateforme-partagee.example',
   '2023-11-08', 920, 'https://example.invalid/fuite-timeline/2023',
   '{"mode":"fixture","rang":3}'::jsonb);

INSERT INTO org (name, slug, kind, city, dept, domain)
SELECT 'Organisation frise ' || i || ' (fixture)',
       'ftl-org-' || i,
       'entreprise',
       'Bordeaux',
       CASE WHEN i % 2 = 0 THEN '33' ELSE '64' END,
       'ftl-' || i || '.example'
FROM generate_series(1, 24) AS i;

INSERT INTO org (name, slug, kind, city, dept, domain)
VALUES ('Organisation hors région (fixture)', 'ftl-org-hors-na', 'entreprise', 'Paris', '75', 'ftl-hors-na.example'),
       ('Organisation exposition unique (fixture)', 'ftl-org-unique', 'entreprise', 'Pau', '64', 'ftl-unique.example');

-- Chaque organisation régionale reçoit deux des trois fuites, choisies par
-- son rang modulo 3 : (1, 3), (2, 3) ou (1, 2). Les écarts dépassent 365 jours.
INSERT INTO fuite_org (fuite_id, org_id, domain, matched_by, evidence)
SELECT r.id,
       o.id,
       o.domain,
       'domaine',
       jsonb_build_object('mode', 'fixture', 'rang', r.rang)
FROM org o
JOIN (VALUES
        ('fuite-timeline:pub-2019', 1),
        ('fuite-timeline:pub-2021', 2),
        ('fuite-timeline:pub-2023', 3)
     ) AS r(id, rang) ON true
WHERE (
        o.slug ~ '^ftl-org-[0-9]+$'
        AND (
          (substring(o.slug from 9)::int % 3 = 1 AND r.rang IN (1, 3))
          OR (substring(o.slug from 9)::int % 3 = 2 AND r.rang IN (2, 3))
          OR (substring(o.slug from 9)::int % 3 = 0 AND r.rang IN (1, 2))
        )
      )
   OR (o.slug = 'ftl-org-hors-na' AND r.rang IN (1, 3))
   OR (o.slug = 'ftl-org-unique' AND r.rang = 1);
