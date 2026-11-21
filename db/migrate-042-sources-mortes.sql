-- 042 — Statut explicite des sources : 'morte' et dernière erreur.
--
-- Additif uniquement : aucune ligne n'est supprimée, aucune valeur existante
-- n'est réécrite. Les sources gardent leur `enabled`, leur `last_error` et
-- leur historique ; elles reçoivent un statut neutre ('active'), que la route
-- admin POST /api/sources/:id/morte fait passer à 'morte' sur décision explicite.
--
-- Idempotente : ré-exécutable sans erreur.

ALTER TABLE source
	ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'active',
	ADD COLUMN IF NOT EXISTS derniere_erreur text;

-- Le domaine est fermé : une source n'est ni « un peu morte », ni n'importe quoi.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'source_statut_valide'
	) THEN
		ALTER TABLE source
			ADD CONSTRAINT source_statut_valide CHECK (statut IN ('active', 'morte'));
	END IF;
END $$;

COMMENT ON COLUMN source.statut IS
	'État déclaré de la source : active (défaut) | morte (décision admin, définitive).';
COMMENT ON COLUMN source.derniere_erreur IS
	'Motif de la dernière erreur constatée, en particulier la raison du passage au statut morte.';
