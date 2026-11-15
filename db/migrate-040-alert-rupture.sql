-- 040 : les agents de rupture arrivent dans la revue.
--
-- Les trois détecteurs (`analyse/rupture.ts`) ne portent pas sur un événement
-- unique : une rafale couvre plusieurs faits, une organisation nouvelle a une
-- fenêtre entière. Leur alerte se dédoublonne donc sur (agent, organisation)
-- et non sur (règle, événement) comme les règles de détection : une situation
-- qui dure met à jour l'evidence au lieu d'empiler une ligne par passage.
-- Le statut (confirmée, ignorée) reste la décision de l'analyste : un
-- passage n'ouvre jamais deux fois la même ligne ni ne réveille une ligne
-- déjà traitée.

CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_rupture_org
	ON alert (rule_id, org_id)
	WHERE scope = 'rupture' AND org_id IS NOT NULL;
