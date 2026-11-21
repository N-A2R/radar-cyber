-- 047 : les alertes des agents de rupture changent de type pour sortir de la diffusion.
--
-- Leur scope dédié `rupture-revue` les réserve à la revue : la diffusion
-- (`notify/alert-delivery.ts`) exclut désormais ce type d'alerte. On convertit
-- les lignes déjà écrites par la migration 040, puis on remplace l'index
-- partiel de déduplication pour qu'il couvre le nouveau scope.
-- Rejouable : la conversion est sans effet la seconde fois, l'ancien index
-- et le nouveau sont protégés par IF EXISTS / IF NOT EXISTS.

BEGIN;

UPDATE alert SET scope = 'rupture-revue' WHERE scope = 'rupture';

DROP INDEX IF EXISTS ux_alert_rupture_org;

CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_rupture_revue_org
	ON alert (rule_id, org_id)
	WHERE scope = 'rupture-revue' AND org_id IS NOT NULL;

COMMIT;
