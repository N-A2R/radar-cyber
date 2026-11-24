-- TOMBSTONE — version appliquée en production, SQL jamais versionné.
-- Successeur : db/migrate-052-ctlogs-inventaire.sql (renommage 051 → 052
-- sans migration de l'historique). Le SQL perdu n'est pas reconstitué : on
-- n'invente pas une requête qui aurait pu détruire des données.
-- Aucun objet n'est créé ici : elle ne fait que réconcilier l'historique.
SELECT 'migrate-051-ctlogs-inventaire.sql'::text AS tombstone;
