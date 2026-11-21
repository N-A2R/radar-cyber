-- 045 — Compteur d'échecs consécutifs des sources.
--
-- Additif uniquement : aucune ligne n'est supprimée, aucun historique n'est
-- réécrit. Le compteur accompagne le statut introduit par la migration 042 ;
-- il permet de déclarer une source morte après cinq échecs consécutifs du
-- collecteur, sans effacer ni la source ni ses événements.
--
-- Idempotente : ré-exécutable sans erreur.

ALTER TABLE source
	ADD COLUMN IF NOT EXISTS echecs_consecutifs integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN source.echecs_consecutifs IS
	'Échecs consécutifs du collecteur ; remis à zéro par un run réussi ou une réactivation.';

COMMENT ON COLUMN source.statut IS
	'État déclaré de la source : active | morte (décision admin ou 5 échecs consécutifs).';
