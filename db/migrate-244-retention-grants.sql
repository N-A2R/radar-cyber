-- 244 — SEC-14 (correction live) : privilèges explicites du rôle de rétention.
--
-- La migration 239 créait le rôle `radar_retention` et tentait de lui donner
-- les droits via le changement de propriétaire + un GRANT sur access_log.
-- Sur la base live, `relacl` ne contient que `radar_app` : le rôle de
-- rétention n'a donc ni DELETE sur le journal, ni INSERT/SELECT sur la table
-- de jetons. `purger_access_log()` échoue alors que le trigger est en place.
--
-- Cette migration ne modifie ni 239 ni son trigger : elle accorde
-- explicitement le minimum nécessaire. Rejouable (GRANT idempotent).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'radar_retention') THEN
    CREATE ROLE radar_retention NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
EXCEPTION
  -- Deux bases de test migrées en parallèle peuvent créer ce rôle global
  -- entre le IF et le CREATE ROLE : le doublon est le résultat attendu.
  WHEN duplicate_object OR unique_violation THEN NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO radar_retention;

-- DELETE : suppression effective par la fonction SECURITY DEFINER.
-- SELECT : le prédicat `WHERE recorded_at < ...` lit une colonne.
GRANT SELECT, DELETE ON public.access_log TO radar_retention;

-- SELECT : le trigger BEFORE DELETE vérifie l'existence du jeton.
-- INSERT : la fonction de rétention crée le jeton transactionnel.
-- DELETE : la fonction retire le jeton en fin de purge.
GRANT SELECT, INSERT, DELETE ON public.access_log_purge_token TO radar_retention;

COMMENT ON FUNCTION public.purger_access_log(integer) IS
  'Seul chemin de suppression du journal des accès (1 à 3650 jours). SECURITY DEFINER radar_retention ; privilèges accordés par migrate-244.';

COMMIT;
