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

\echo '== 8. Evenements a source orphelin (invariant : 0 ligne) =='
SELECT count(*) AS orphelins
FROM event e
LEFT JOIN source s ON s.id = e.source_id
WHERE s.id IS NULL;

\echo '== 9. Unicite dedup_key (invariant : compte_total = comptes_distincts) =='
SELECT count(*) AS total,
       count(DISTINCT dedup_key) AS distincts,
       count(*) = count(DISTINCT dedup_key) AS ok
FROM event;

\echo '== 10. Part d evenements sans observed_at (alerte si > 60 %) =='
SELECT round(100.0 * count(*) FILTER (WHERE observed_at IS NULL) / count(*), 1) AS pct_null,
       count(*) FILTER (WHERE observed_at IS NULL) AS nulls,
       count(*) AS total,
       CASE WHEN 100.0 * count(*) FILTER (WHERE observed_at IS NULL) / count(*) > 60
            THEN 'ALERTE (> 60 %)' ELSE 'ok' END AS statut
FROM event;

\echo '== 11. Sources enabled sans collector_run depuis 7 j =='
SELECT s.id, s.name, s.family, s.kind,
       s.last_ok_at,
       coalesce(max(cr.started_at)::text, 'jamais') AS dernier_run
FROM source s
LEFT JOIN collector_run cr ON cr.source_id = s.id
WHERE s.enabled
GROUP BY s.id, s.name, s.family, s.kind, s.last_ok_at
HAVING coalesce(max(cr.started_at), 'epoch'::timestamptz) < now() - interval '7 days'
ORDER BY dernier_run, s.id;

\echo '== 12. Events avec org_id mais sans lat/lon propres (héritables depuis org si dispo) =='
SELECT e.id, e.dedup_key, e.geo_type,
       CASE WHEN o.lat IS NOT NULL AND o.lon IS NOT NULL THEN 'herite_org' ELSE 'AUCUNE_COORD' END AS coords,
       o.name AS org_name
FROM event e
JOIN org o ON o.id = e.org_id
WHERE e.geo_type = 'unknown' OR e.lat IS NULL OR e.lon IS NULL
ORDER BY coords, e.id DESC
LIMIT 50;

\echo '== 12b. Compte des events avec org_id et sans lat/lon héritable (org sans coords) =='
SELECT count(*) AS sans_coord_heritable
FROM event e
JOIN org o ON o.id = e.org_id
WHERE (e.geo_type = 'unknown' OR e.lat IS NULL OR e.lon IS NULL)
  AND (o.lat IS NULL OR o.lon IS NULL);

\echo '== 13. Indicators sans source_id (invariant : 0 ligne) =='
SELECT count(*) AS sans_source
FROM indicator
WHERE source_id IS NULL;
