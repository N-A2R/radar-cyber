-- TOMBSTONE — version appliquée en production, SQL jamais versionné.
-- Successeur : db/migrate-219-campaign-precursor-detector.sql (reprise du
-- détecteur sous le numéro 219). Aucun objet n'est créé ici : elle ne fait
-- que réconcilier l'historique de la base déployée.
SELECT 'migrate-216-campaign-precursor.sql'::text AS tombstone;
