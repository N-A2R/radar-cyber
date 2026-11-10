-- migrate-019 : la presse régionale cyber devient une famille à part.
--
-- Mesure du 2026-11-10 : 1 797 événements en famille `presse`. Ceux qui parlent
-- réellement de cyber ET citent la Nouvelle-Aquitaine (ou viennent d'une source
-- régionale) passent en `presse_cyber` pour être distingués dans le fil.
--
-- CONTRÔLE AVANT (résultat attendu : aucune ligne, `family` n'est pas contraint) :
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'event'::regclass
--      AND contype = 'c'
--      AND pg_get_constraintdef(oid) ILIKE '%family%';
--
-- CONTRÔLE APRÈS (résultat attendu : aucune ligne, ou un CHECK incluant
-- 'presse_cyber') :
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'event'::regclass
--      AND contype = 'c'
--      AND pg_get_constraintdef(oid) ILIKE '%family%';
--
--   SELECT family, count(*) FROM event GROUP BY 1 ORDER BY 2 DESC;
--
-- Idempotent : ne fait rien si `family` n'a pas de CHECK, et ne recrée pas un
-- CHECK déjà conforme.
--
-- Note hors périmètre : packages/shared/src (FAMILIES) ne connaît pas encore
-- `presse_cyber`. Les collecteurs n'écrivent jamais cette valeur (elle est
-- posée uniquement par scripts/reclassify-press.mts en SQL direct) ; à ajouter
-- côté shared lors d'une prochaine passe sur ce paquet.

DO $$
DECLARE
  con        record;
  wanted     text := $check$CHECK (family IN ('ransomware','vuln','phishing','malware','cert','cert_fr','typosquat','reputation','cti','presse','presse_cyber'))$check$;
  changed    boolean := false;
BEGIN
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'event'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%family%'
  LOOP
    IF con.def ILIKE '%presse_cyber%' THEN
      RAISE NOTICE 'migrate-019 : % accepte déjà presse_cyber, rien à faire', con.conname;
      CONTINUE;
    END IF;
    RAISE NOTICE 'migrate-019 : remplace % (%) par la liste étendue', con.conname, con.def;
    EXECUTE format('ALTER TABLE event DROP CONSTRAINT %I', con.conname);
    EXECUTE format('ALTER TABLE event ADD CONSTRAINT %I %s', con.conname, wanted);
    changed := true;
  END LOOP;

  IF NOT changed THEN
    RAISE NOTICE 'migrate-019 : aucun CHECK sur event.family — base déjà ouverte à presse_cyber';
  END IF;
END $$;
