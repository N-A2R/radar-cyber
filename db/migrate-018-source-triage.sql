-- 018 — Triage des sources muettes : colonnes de désactivation.
--
-- La migration ne prépare que le terrain. Aucune source n'est désactivée ici :
-- c'est `scripts/triage-sources.mts --apply` qui renseigne ces colonnes, et
-- uniquement pour les causes `http_error` et `unreachable`.
--
-- Idempotente : ré-exécutable sans erreur.

ALTER TABLE source
	ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
	ADD COLUMN IF NOT EXISTS disabled_reason text;

-- Index partiel : on interroge les sources actives bien plus souvent que le parc
-- complet (rendu /sources, planificateur de collecte).
CREATE INDEX IF NOT EXISTS source_active_family_idx
	ON source (family)
	WHERE enabled IS TRUE;
