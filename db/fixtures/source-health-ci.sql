-- Fixture jetable du contrôle nocturne de `scripts/source-health.mts`.
--
-- Quatre sources, une par catégorie, avec des horodatages relatifs à `now()` :
-- le rapport reste stable quel que soit le jour où le job scheduled tourne.
-- La base du workflow est neuve : aucune source réelle n'est touchée.
-- La dormance prime sur le silence : `ci-health-dormante` a des événements,
-- mais sa dernière collecte est ancienne et elle ne doit PAS être dite muette.

INSERT INTO source (id, name, family, url, enabled)
VALUES
  ('ci-health-muette',   'CI — muette',   'cert', 'https://example.invalid/muette', true),
  ('ci-health-faible',   'CI — faible',   'cert', 'https://example.invalid/faible', true),
  ('ci-health-saine',    'CI — saine',    'cert', 'https://example.invalid/saine', true),
  ('ci-health-dormante', 'CI — dormante', 'cert', 'https://example.invalid/dormante', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new)
VALUES
  ('ci-health-muette',   now(),                       now(),                       'ok', 0, 0),
  ('ci-health-faible',   now(),                       now(),                       'ok', 3, 3),
  ('ci-health-saine',    now() - interval '1 day',    now() - interval '1 day',    'ok', 7, 7),
  ('ci-health-saine',    now(),                       now(),                       'ok', 7, 7),
  ('ci-health-dormante', now() - interval '30 days',  now() - interval '30 days',  'ok', 4, 4);

INSERT INTO event (dedup_key, family, assertion_type, title, collected_at, observed_at, source_id)
SELECT 'ci-health-muette-old-' || g, 'cert', 'technical_indicator',
       'Événement hors fenêtre 30 j', now() - interval '45 days', now() - interval '45 days',
       'ci-health-muette'
FROM generate_series(1, 2) AS g
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO event (dedup_key, family, assertion_type, title, collected_at, observed_at, source_id)
SELECT 'ci-health-faible-' || g, 'cert', 'technical_indicator',
       'Événement récent', now() - interval '1 day', now() - interval '1 day',
       'ci-health-faible'
FROM generate_series(1, 3) AS g
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO event (dedup_key, family, assertion_type, title, collected_at, observed_at, source_id)
SELECT 'ci-health-saine-' || g, 'cert', 'technical_indicator',
       'Événement récent', now() - interval '1 day', now() - interval '1 day',
       'ci-health-saine'
FROM generate_series(1, 7) AS g
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO event (dedup_key, family, assertion_type, title, collected_at, observed_at, source_id)
SELECT 'ci-health-dormante-' || g, 'cert', 'technical_indicator',
       'Événement ancien', now() - interval '60 days', now() - interval '60 days',
       'ci-health-dormante'
FROM generate_series(1, 4) AS g
ON CONFLICT (dedup_key) DO NOTHING;
