-- Radar Cyber NA — contrôles d'intégrité (lecture seule)
-- Usage : psql postgres://radar:radar@localhost:5432/radar -f db/checks.sql

\echo '== 1. Organisations par departement =='
SELECT dept, count(*) AS orgs
FROM org
GROUP BY dept
ORDER BY dept;

\echo '== 2. Organisations sans coordonnees =='
SELECT id, name, city, dept
FROM org
WHERE lat IS NULL OR lon IS NULL
ORDER BY name;

\echo '== 3. Evenements a source_id orphelin (attendu : 0) =='
SELECT e.id, e.dedup_key, e.source_id
FROM event e
LEFT JOIN source s ON s.id = e.source_id
WHERE s.id IS NULL;

\echo '== 4. Doublons de dedup_key (attendu : 0) =='
SELECT dedup_key, count(*)
FROM event
GROUP BY dedup_key
HAVING count(*) > 1;

\echo '== 5. Repartition par assertion_type =='
SELECT assertion_type, count(*)
FROM event
GROUP BY assertion_type
ORDER BY 2 DESC;

\echo '== 6. Collecteurs en erreur sur 24 h =='
SELECT source_id, status, items_in, items_new, left(coalesce(error, ''), 200), finished_at
FROM collector_run
WHERE status = 'error'
  AND started_at > now() - interval '24 hours'
ORDER BY started_at DESC;

\echo '== 7. Organisations avec un domaine declare =='
SELECT count(*) FILTER (WHERE domain IS NOT NULL AND domain <> '') AS avec_domaine,
       count(*) AS total
FROM org;
