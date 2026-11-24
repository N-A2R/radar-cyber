-- TOMBSTONE — version appliquée en production, SQL jamais versionné.
-- L'effet (identité légale vérifiée, stock LOT) est porté par
-- db/migrate-215-org-siren-verifie.sql, déjà appliquée en production.
-- Numéro 218 repris ensuite par d'autres migrations : ne jamais rejouer.
-- Aucun objet n'est créé ici : elle ne fait que réconcilier l'historique.
SELECT 'migrate-218-identite-legale-stock-lot.sql'::text AS tombstone;
