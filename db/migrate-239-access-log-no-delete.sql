-- 239 — SEC-14 : le journal des accès devient réellement append-only.
--
-- Le trigger historique (049) interdisait UPDATE mais pas DELETE, alors que
-- son message d'erreur affirmait que seule la rétention pouvait supprimer.
-- On ajoute un DELETE guard avec une exception contrôlée : un jeton éphémère,
-- lié au backend et à la transaction, inséré par `purger_access_log()` seule.
--
-- Le jeton n'est pas un paramètre de session que l'appelant pourrait poser
-- lui-même (un `SET radar.xxx` est toujours permis) : il vit dans une table
-- dont le rôle applicatif n'est ni propriétaire ni beneficiary d'un GRANT.
-- Les deux fonctions sont SECURITY DEFINER exécutées sous `radar_retention`,
-- rôle NOLOGIN créé ci-dessous ; l'appelant garde seulement le droit d'appeler
-- la fonction de rétention, ce qui est le chemin autorisé et borné.
--
-- NOTA : la protection suppose SEC-11 (retrait de SUPERUSER au rôle applicatif).
-- Un superutilisateur peut toujours contourner n'importe quel trigger.
--
-- Rejouable : rôles, table, fonctions et triggers créés si absents.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'radar_retention') THEN
    CREATE ROLE radar_retention NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
EXCEPTION
  -- Deux bases de test migrées en parallèle peuvent créer ce rôle global
  -- entre le IF et le CREATE ROLE : le doublon est le résultat attendu.
  WHEN duplicate_object THEN NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO radar_retention;

CREATE TABLE IF NOT EXISTS public.access_log_purge_token (
  backend_pid integer     NOT NULL CHECK (backend_pid > 0),
  txid        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (backend_pid, txid)
);

-- Le propriétaire du jeton est le rôle de rétention, jamais le rôle applicatif
-- qui exécute les migrations et les requêtes métier. Les privilèges sont
-- retirés AVANT le changement de propriétaire, pour rester exécutable même si
-- le rôle applicatif n'est plus superutilisateur (SEC-11).
REVOKE ALL ON TABLE public.access_log_purge_token FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'radar') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.access_log_purge_token FROM radar';
  END IF;
END
$$;

-- Le rôle de rétention doit pouvoir lire le prédicat et supprimer les lignes.
-- SELECT est requis par PostgreSQL dès que le WHERE lit une colonne.
GRANT SELECT, DELETE ON public.access_log TO radar_retention;
ALTER TABLE public.access_log_purge_token OWNER TO radar_retention;

CREATE OR REPLACE FUNCTION public.access_log_immuable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Seule exception à l'immutabilité des faits : l'anonymisation RGPD d'un
  -- ancien compte. Comparaison LIGNE ENTIÈRE : seuls acteur, user_id et role
  -- peuvent changer ; toute autre colonne (route, ip_hash, statut, motif…)
  -- modifiée sous couvert d'anonymisation est rejetée.
  IF TG_OP = 'UPDATE'
     AND NEW.acteur = 'compte-supprime'
     AND NEW.user_id IS NULL
     AND NEW.role IS NULL
     AND (to_jsonb(NEW) - 'acteur' - 'user_id' - 'role')
         = (to_jsonb(OLD) - 'acteur' - 'user_id' - 'role') THEN
    RETURN NEW;
  END IF;

  -- Seule exception au DELETE : la rétention, identifiable par un jeton
  -- transactionnel que seul radar_retention peut écrire. Un DELETE direct
  -- n'a aucun jeton, même s'il est émis par un appelant disposant de EXECUTE
  -- sur la fonction de rétention : il n'a pas le droit d'en fabriquer un.
  IF TG_OP = 'DELETE'
     AND EXISTS (
       SELECT 1 FROM public.access_log_purge_token t
        WHERE t.backend_pid = pg_backend_pid()
          AND t.txid = pg_current_xact_id()::text
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'journal des accès : % interdit (les accès ne se réécrivent pas)', TG_OP
    USING HINT = 'Seule la rétention (purger_access_log) peut supprimer une ligne ancienne.';
END;
$$;

ALTER FUNCTION public.access_log_immuable() OWNER TO radar_retention;

DROP TRIGGER IF EXISTS access_log_no_delete ON public.access_log;
CREATE TRIGGER access_log_no_delete
  BEFORE DELETE ON public.access_log
  FOR EACH ROW EXECUTE FUNCTION public.access_log_immuable();

CREATE OR REPLACE FUNCTION public.purger_access_log(p_jours integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  supprimees integer;
  v_txid     text;
BEGIN
  -- La rétention reste bornée : aucun appel ne peut vider le journal entier.
  IF p_jours IS NULL OR p_jours < 1 OR p_jours > 3650 THEN
    RAISE EXCEPTION 'rétention du journal : p_jours doit être compris entre 1 et 3650';
  END IF;

  v_txid := pg_current_xact_id()::text;
  INSERT INTO public.access_log_purge_token (backend_pid, txid)
  VALUES (pg_backend_pid(), v_txid);

  DELETE FROM public.access_log
   WHERE recorded_at < now() - make_interval(days => p_jours);
  GET DIAGNOSTICS supprimees = ROW_COUNT;

  -- Le jeton est retiré dans TOUS les chemins normaux : un appel
  -- `purger_access_log(1)` suivi d'un DELETE direct dans la même transaction
  -- ne laisse aucun jeton exploitable. En cas d'erreur, la transaction entière
  -- est annulée et le jeton disparaît avec elle.
  DELETE FROM public.access_log_purge_token
   WHERE backend_pid = pg_backend_pid() AND txid = v_txid;

  RETURN supprimees;
END;
$$;

ALTER FUNCTION public.purger_access_log(integer) OWNER TO radar_retention;

COMMENT ON TABLE public.access_log_purge_token IS
  'Jetons transactionnels de la seule suppression autorisée dans access_log. Table possédée par radar_retention, jamais accessible en écriture au rôle applicatif.';
COMMENT ON FUNCTION public.purger_access_log(integer) IS
  'Seul chemin de suppression du journal des accès (1 à 3650 jours). SECURITY DEFINER radar_retention.';
COMMENT ON TABLE public.access_log IS
  'Journal des accès API. Append-only : UPDATE anonymisé et DELETE par purger_access_log() seulement. IP et user-agent hashés (RGPD : minimisation).';

COMMIT;
