-- Corpus synthétique figé du test de non-régression du tableau de bord.
--
-- Complète une base de test fraîche (1 source, 1 organisation semés par
-- apps/api/test/helpers/testdb.ts) jusqu'à 1808 sources et 10261 organisations.
-- L'insertion calcule le déficit : rejouer ce fichier ne duplique aucune ligne.
-- Quelques événements, un run et une organisation rattachée donnent des
-- compteurs non nuls à tous les indicateurs.
--
-- Aucune donnée personnelle, aucun secret, aucune portée géographique :
-- les noms sont synthétiques et l'URL d'exemple n'est pas résolue.

INSERT INTO source (id, name, family, url, enabled)
SELECT 'kpi-corpus-src-' || lpad(g.n::text, 4, '0'),
       'Source synthétique KPI ' || lpad(g.n::text, 4, '0'),
       'cti',
       'https://example.invalid/kpi-couverture/' || g.n,
       true
  FROM generate_series(1, GREATEST(1808 - (SELECT count(*) FROM source), 0)) AS g(n)
ON CONFLICT (id) DO NOTHING;

INSERT INTO org (name, slug, kind, status)
SELECT 'Organisation synthétique KPI ' || lpad(g.n::text, 5, '0'),
       'kpi-corpus-org-' || lpad(g.n::text, 5, '0'),
       'entreprise',
       'confirme'
  FROM generate_series(1, GREATEST(10261 - (SELECT count(*) FROM org), 0)) AS g(n)
ON CONFLICT (slug) DO NOTHING;

-- Run d'import explicite : les événements synthétiques ne prétendent pas
-- provenir d'une collecte réseau.
INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new, kind)
SELECT 'kpi-corpus-src-0001', now(), now(), 'ok', 12, 12, 'import'
 WHERE NOT EXISTS (
   SELECT 1 FROM collector_run WHERE source_id = 'kpi-corpus-src-0001'
 );

INSERT INTO event (dedup_key, family, assertion_type, title,
                   source_id, source_url, observed_at, collected_at,
                   org_id, evidence)
SELECT 'kpi-corpus-event-' || lpad(g.n::text, 3, '0'),
       'cti',
       'confirmed_incident',
       'Événement synthétique KPI ' || g.n,
       'kpi-corpus-src-0001',
       'https://example.invalid/kpi-couverture/e-' || g.n,
       now() - (g.n || ' hours')::interval,
       now(),
       (SELECT min(id) FROM org WHERE slug LIKE 'kpi-corpus-org-%'),
       jsonb_build_object(
         'run_id',
         (SELECT id::text FROM collector_run
           WHERE source_id = 'kpi-corpus-src-0001' ORDER BY id DESC LIMIT 1)
       )
  FROM generate_series(1, 12) AS g(n)
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO alert (rule_id, title, severity, status)
SELECT 'kpi-corpus-alerte-' || g.n,
       'Alerte synthétique KPI ' || g.n,
       3,
       'open'
  FROM generate_series(1, 3) AS g(n)
ON CONFLICT DO NOTHING;
