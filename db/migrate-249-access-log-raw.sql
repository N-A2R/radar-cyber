-- 249 — Déploiement privé (niveau 4) : IP et user-agent en clair dans le
-- journal des accès. Les colonnes historiques `ip_hash` et `user_agent_hash`
-- restent intactes : les lignes anciennes restent lisibles avec le libellé
-- « historique hashé ». Les nouvelles lignes écrivent les deux paires, sans
-- réécrire le passé. La rétention bornée reste à 90 jours (purger_access_log).
--
-- Rejouable : ALTER ... IF NOT EXISTS et commentaires idempotents.
BEGIN;

ALTER TABLE public.access_log ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.access_log ADD COLUMN IF NOT EXISTS user_agent text;

COMMENT ON COLUMN public.access_log.ip IS
  'Adresse IP en clair pour les accès postérieurs à la migration 249 ; NULL = historique hashé (ip_hash).';
COMMENT ON COLUMN public.access_log.user_agent IS
  'User-agent en clair pour les accès postérieurs à la migration 249 ; NULL = historique hashé (user_agent_hash).';
COMMENT ON TABLE public.access_log IS
  'Journal des accès API. Append-only applicatif ; rétention bornée à 90 jours. IP et user-agent en clair depuis la migration 249, empreintes poivrées conservées pour l''historique.';

COMMIT;
