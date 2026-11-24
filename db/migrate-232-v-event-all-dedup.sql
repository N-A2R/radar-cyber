-- 232 — `v_event_all` ne compte plus deux fois le même événement.
--
-- 1 204 dedup_key sont à la fois dans `event` et `event_archive` : la rétention
-- archivait tout avant de purger, puis conservait en brut les événements cités
-- par une alerte. L'ancien UNION ALL (migrate-028/049) renvoyait donc 32 548
-- lignes pour 31 344 clés. La priorité reste au brut, comme le `DISTINCT ON`
-- déjà appliqué par la route d'historique.
BEGIN;

DROP VIEW IF EXISTS v_event_all;

CREATE VIEW v_event_all AS
  SELECT id, dedup_key, family, assertion_type, org_id, source_id,
         observed_at, collected_at, valid_at, at,
         severity, confidence, admission_rule,
         'brut'::text AS origine
    FROM event
  UNION ALL
  SELECT a.id, a.dedup_key, a.family, a.assertion_type, a.org_id, a.source_id,
         a.observed_at, a.collected_at, a.valid_at, a.at,
         a.severity, a.confidence, a.admission_rule,
         'archive'::text AS origine
    FROM event_archive a
   WHERE NOT EXISTS (SELECT 1 FROM event e WHERE e.dedup_key = a.dedup_key);

COMMENT ON VIEW v_event_all IS
  'Fil unifié brut + archive, sans doublon : une clé présente dans event n''est pas relue depuis event_archive.';

COMMIT;
