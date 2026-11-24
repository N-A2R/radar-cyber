-- TOMBSTONE — version appliquée en production, SQL jamais versionné.
-- Successeur : db/migrate-201-registre-retention-raw.sql (renommage 200 → 201).
-- Aucun objet n'est créé ici : elle ne fait que réconcilier l'historique.
SELECT 'migrate-200-registre-retention-raw.sql'::text AS tombstone;
