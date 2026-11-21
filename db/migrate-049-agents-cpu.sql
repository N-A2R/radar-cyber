-- 049 : les trois agents CPU arrivent dans la file de revue.
--
-- Contrairement aux agents de rupture historiques (migration 040/047), une
-- bascule sectorielle et une source muette n'ont pas d'organisation : la clé
-- de déduplication ne peut donc pas être (règle, organisation). Elle est portée
-- par `evidence->>'cle'`, écrite par `analyse/agents-cpu.ts` pour les trois
-- agents. Une situation qui dure met à jour l'evidence au lieu d'empiler des
-- doublons ; le statut reste une décision humaine, jamais rouverte par un tick.

CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_agents_cpu_cle
	ON alert (rule_id, (evidence->>'cle'))
	WHERE scope = 'agents-cpu' AND evidence ? 'cle';

CREATE INDEX IF NOT EXISTS idx_alert_agents_cpu_revue
	ON alert (status, created_at DESC)
	WHERE scope = 'agents-cpu';
