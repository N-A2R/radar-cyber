-- 247 — SEC-14 (correction live) : TRUNCATE n'est pas une rétention déguisée.
--
-- Les migrations 049 et 239 protègent UPDATE et DELETE sur `access_log`, mais
-- pas TRUNCATE : `TRUNCATE access_log` vidait le journal en une instruction,
-- sans jeton de rétention et sans passer par `purger_access_log()`. On ajoute
-- un trigger BEFORE TRUNCATE qui refuse toute tentative (y compris CASCADE et
-- RESTART IDENTITY), puis on retire TRUNCATE aux rôles applicatifs.
--
-- Un privilège implicite de PROPRIÉTAIRE ne se révoque pas : si `radar` ou
-- `radar_app` possède la table, `REVOKE TRUNCATE` est sans effet. Le cas
-- échéant, la propriété est transférée au rôle NOLOGIN `radar_retention`, déjà
-- gardien des jetons de purge ; les droits applicatifs réellement nécessaires
-- (INSERT, SELECT, UPDATE pour l'anonymisation RGPD) sont alors accordés
-- explicitement, SANS TRUNCATE ni DELETE. La purge bornée reste inchangée :
-- `purger_access_log()` supprime par DELETE avec un jeton transactionnel.
--
-- LIMITE DOCUMENTÉE : sur la base live, `radar` est propriétaire/superutilisateur.
-- Un superutilisateur contourne les triggers et les privilèges ; aucune protection
-- SQL ne peut le contraindre. Cette migration garantit qu'un rôle applicatif
-- ordinaire ne peut pas tronquer le journal, mais elle ne remplace pas SEC-11
-- (retrait de SUPERUSER au rôle applicatif). Elle n'est applicable que par un
-- rôle administrateur (CREATEROLE ou superutilisateur), comme la migration 239.
--
-- Rejouable : trigger, fonction, rôles, propriété et droits idempotents.

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

CREATE OR REPLACE FUNCTION public.access_log_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Aucune exception : ni jeton de rétention, ni anonymisation, ni CASCADE.
  -- Le seul chemin de suppression reste purger_access_log() (DELETE borné).
  RAISE EXCEPTION 'journal des accès : TRUNCATE interdit (les accès ne se réécrivent pas)'
    USING HINT = 'Seule la rétention bornée (purger_access_log) peut supprimer des lignes anciennes.';
END;
$$;

ALTER FUNCTION public.access_log_no_truncate() OWNER TO radar_retention;

DROP TRIGGER IF EXISTS access_log_no_truncate ON public.access_log;
CREATE TRIGGER access_log_no_truncate
  BEFORE TRUNCATE ON public.access_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.access_log_no_truncate();

-- Transfert de propriété UNIQUEMENT si un rôle applicatif connu possède la
-- table : c'est le seul cas où REVOKE ne peut pas retirer TRUNCATE (droit
-- implicite du propriétaire). Un propriétaire administratif reste inchangé.
DO $$
DECLARE
  proprietaire text;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO proprietaire
    FROM pg_class c
   WHERE c.oid = 'public.access_log'::regclass;

  IF proprietaire IN ('radar', 'radar_app') THEN
    EXECUTE 'ALTER TABLE public.access_log OWNER TO radar_retention';
  END IF;
END
$$;

-- Droits applicatifs minimaux après changement de propriétaire : l'API écrit
-- (INSERT), relit (SELECT) et anonymise (UPDATE) ; elle n'a jamais besoin de
-- TRUNCATE ni de DELETE direct sur le journal.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'radar') THEN
    EXECUTE 'REVOKE TRUNCATE, DELETE ON TABLE public.access_log FROM radar';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.access_log TO radar';
    IF to_regclass('public.access_log_id_seq') IS NOT NULL THEN
      EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.access_log_id_seq TO radar';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'radar_app') THEN
    EXECUTE 'REVOKE TRUNCATE, DELETE ON TABLE public.access_log FROM radar_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.access_log TO radar_app';
    IF to_regclass('public.access_log_id_seq') IS NOT NULL THEN
      EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.access_log_id_seq TO radar_app';
    END IF;
  END IF;
END
$$;

REVOKE TRUNCATE ON TABLE public.access_log FROM PUBLIC;

-- Balayage des rôles non prévus dans la liste ci-dessus : toute ACL restante
-- qui autorise TRUNCATE est retirée. Le propriétaire garde son droit implicite
-- (non inscrit dans l'ACL) mais le trigger BEFORE TRUNCATE s'applique à lui
-- aussi, sauf superutilisateur — voir la limite documentée plus haut.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT grantee
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'access_log'
       AND privilege_type = 'TRUNCATE'
       AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE public.access_log FROM %I', r.grantee);
  END LOOP;
END
$$;

COMMENT ON FUNCTION public.access_log_no_truncate() IS
  'Refuse TRUNCATE sur access_log : aucun jeton ni CASCADE ne contourne le journal des accès. Seule la purge bornée DELETE est autorisée.';
COMMENT ON TABLE public.access_log IS
  'Journal des accès API. Append-only : UPDATE anonymisé et DELETE par purger_access_log() seulement ; TRUNCATE interdit par trigger et privilèges.';

COMMIT;
