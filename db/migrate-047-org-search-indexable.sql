-- TOMBSTONE — version appliquée en production, SQL jamais versionné.
-- Effet présent dans db/migrate-048-orgs-list-indexes.sql : index de tri
-- (name, id) de la liste paginée des organisations. Le numéro 047 a été
-- repris par d'autres migrations ; cette version ne doit jamais être rejouée.
-- Aucun objet n'est créé ici : elle ne fait que réconcilier l'historique.
SELECT 'migrate-047-org-search-indexable.sql'::text AS tombstone;
