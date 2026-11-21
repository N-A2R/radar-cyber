-- 045 — Index manquants de la file de revue (GET /api/review/queue)
--
-- Mesure sur la base 5433 (200 revendications en attente, 10 appels) : 7 SQL
-- par appel, dont deux sur `quarantine_raw` qui faisaient encore un seq scan :
--
--   SELECT status, promoted, count(*) FROM quarantine_raw
--    WHERE kind='claim' GROUP BY status, promoted
--     -> Seq Scan, 1164 buffers, ~38 ms (EXPLAIN ANALYZE).
--   SELECT ... FROM quarantine_raw
--    WHERE promoted=false AND kind='claim' AND org_hint IS NOT NULL
--      AND btrim(org_hint) <> '' AND status='pending'
--    ORDER BY received_at DESC, id DESC LIMIT 2001
--     -> Index Scan sur (status, kind) puis tri, ~28 ms.
--
-- Les deux index ci-dessous correspondent exactement à ces prédicats :
--   - comptage par statut : index-only scan sur (kind, status, promoted) ;
--   - file : index partiel couvrant le filtre complet et l'ordre de sortie,
--     ce qui supprime le tri. `btrim(org_hint) <> ''` est reproduit dans le
--     prédicat partiel pour que l'index ne contienne que les lignes éligibles.
--
-- Les deux sont IF NOT EXISTS : le fichier est rejouable sans effet. Aucune
-- donnée n'est modifiée. Le gain mesuré ne porte QUE sur ces deux requêtes :
-- le coût dominant de la route reste le chargement des 1,67 M organisations
-- et 1,68 M alias à chaque appel (voir docs/perf-file.md).
CREATE INDEX IF NOT EXISTS quarantine_raw_kind_status_promoted_idx
  ON quarantine_raw (kind, status, promoted);

CREATE INDEX IF NOT EXISTS quarantine_raw_review_queue_idx
  ON quarantine_raw (received_at DESC, id DESC)
 WHERE kind = 'claim'
   AND status = 'pending'
   AND promoted = false
   AND org_hint IS NOT NULL
   AND btrim(org_hint) <> '';
