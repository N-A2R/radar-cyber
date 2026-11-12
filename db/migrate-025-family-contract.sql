-- 025 — Aligner le CHECK de `event.family` sur le contrat partagé.
--
-- Contexte : `packages/shared/src/index.ts` (FAMILIES) est passé de 10 à 13
-- valeurs sur arbitrage utilisateur. Trois valeurs circulaient déjà en base
-- sans que le contrat les connaisse :
--   * `leaks`, `paste`  : 8 sources actives les déclarent
--                         (db/sources-paste-leaks.sql) ;
--   * `presse_cyber`    : posée par scripts/reclassify-press.mts, acceptée par
--                         migrate-019, absente du shared.
-- Le shared les connaît désormais. Cette migration met la contrainte SQL au
-- même niveau, pour qu'une base sous CHECK ne refuse pas ce que le code écrit.
--
-- migrate-019 reste inchangée : elle est déjà appliquée et enregistrée dans
-- `schema_migrations`, la réécrire ne la rejouerait pas. Elle s'arrêtait à 11
-- valeurs et signalait elle-même la dette côté shared ; celle-ci est acquittée.
--
-- Idempotent, et volontairement non créateur : si `family` n'a aucun CHECK
-- (cas du schéma courant), on n'en ajoute pas. Ajouter une contrainte là où il
-- n'y en avait pas serait un changement de politique, pas un alignement — et
-- ferait échouer le chargement sur une instance historique peuplée de valeurs
-- anciennes. Le contrat applicatif (`admitEvent`) garde la main à l'entrée.
--
-- CONTRÔLE APRÈS (résultat attendu : aucune ligne, ou un CHECK à 13 valeurs) :
--   SELECT c.conname, pg_get_constraintdef(c.oid)
--     FROM pg_constraint c
--    WHERE c.conrelid = 'event'::regclass AND c.contype = 'c'
--      AND pg_get_constraintdef(c.oid) ILIKE '%family%';

DO $$
DECLARE
  con     record;
  wanted  text := $check$CHECK (family IN ('ransomware','vuln','phishing','malware','cert','cert_fr','typosquat','reputation','cti','presse','leaks','paste','presse_cyber'))$check$;
  changed boolean := false;
BEGIN
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'event'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%family%'
  LOOP
    IF con.def ILIKE '%leaks%' AND con.def ILIKE '%paste%' AND con.def ILIKE '%presse_cyber%' THEN
      RAISE NOTICE 'migrate-025 : % est déjà aligné sur les 13 familles', con.conname;
      CONTINUE;
    END IF;

    -- On ne remplace une contrainte que si aucune ligne ne la violerait :
    -- mieux vaut laisser l'ancien CHECK et le signaler que faire échouer la
    -- migration sur une instance réelle.
    IF EXISTS (
      SELECT 1 FROM event
       WHERE family NOT IN ('ransomware','vuln','phishing','malware','cert','cert_fr','typosquat','reputation','cti','presse','leaks','paste','presse_cyber')
    ) THEN
      RAISE NOTICE 'migrate-025 : des events portent une famille hors contrat — CHECK % laissé en place, à auditer', con.conname;
      CONTINUE;
    END IF;

    RAISE NOTICE 'migrate-025 : remplace % par la liste des 13 familles', con.conname;
    EXECUTE format('ALTER TABLE event DROP CONSTRAINT %I', con.conname);
    EXECUTE format('ALTER TABLE event ADD CONSTRAINT %I %s', con.conname, wanted);
    changed := true;
  END LOOP;

  IF NOT changed THEN
    RAISE NOTICE 'migrate-025 : aucun CHECK à élargir — le contrat applicatif fait foi';
  END IF;
END $$;
