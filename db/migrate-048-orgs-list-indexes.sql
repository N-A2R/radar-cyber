-- 048 — Index de tri pour la liste paginée des organisations (GET /api/orgs)
--
-- Mesure sur la base 5433 (1 673 151 organisations), avant correction :
--
--   EXPLAIN ANALYZE SELECT o.id, ... FROM org o
--     LEFT JOIN event e ON e.org_id = o.id
--    WHERE o.valid_to IS NULL GROUP BY o.id ORDER BY o.name
--     -> GroupAggregate + tri externe sur disque (208 Mo), Execution Time 6 317 ms
--   GET /api/orgs -> 18 848 ms, 1 673 151 lignes, 396 Mo de JSON.
--
-- La route renvoie désormais une page bornée (limit par défaut 500, max 2000,
-- offset) et ne compte les événements que pour cette page. Le tri par nom
-- n'avait aucun index : même une page de 500 lignes imposait de trier 1,67 M
-- lignes. Les deux index ci-dessous donnent l'ordre (name, id) directement,
-- y compris pour la variante bitemporelle `asOf` qui lit `org_history`.
--
-- `event_org_idx` (org_id, observed_at DESC) existe déjà : le comptage des
-- événements de chaque ligne de la page reste un index scan borné.
--
-- IF NOT EXISTS : fichier rejouable sans effet, aucune donnée modifiée.
CREATE INDEX IF NOT EXISTS org_name_id_idx ON org (name, id);

CREATE INDEX IF NOT EXISTS org_history_name_id_idx ON org_history (name, id);
