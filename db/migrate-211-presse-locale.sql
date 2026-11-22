-- 211 — Famille `presse_locale` : veille de presse départementale.
--
-- Un titre de la vie locale ne contient aucun terme cyber : la porte de
-- pertinence le rétrograde en `presse` puis le refuse. Pour une source
-- `presse_locale`, la provenance départementale est le signal, et la famille
-- dédiée garde ce fait régional sans le confondre avec un incident
-- (assertion `ambient_signal`, jamais `confirmed_incident`).
--
-- La migration pose le strict nécessaire :
--   1. `event.dept` (code INSEE de la source) + index partiel, pour que la
--      provenance survive à la collecte et reste interrogeable ;
--   2. l'élargissement du CHECK de `event.family` à 14 valeurs, s'il existe.
--
-- Elle ne crée aucun CHECK là où il n'y en a pas (même politique que 025) et
-- n'insère ni source ni événement : le catalogue de sources et la collecte
-- restent la responsabilité des fichiers de données.

BEGIN;

ALTER TABLE event ADD COLUMN IF NOT EXISTS dept text;
COMMENT ON COLUMN event.dept IS
  'Code INSEE du département éditeur pour une veille presse_locale ; NULL sinon.';

CREATE INDEX IF NOT EXISTS event_presse_locale_dept_idx
  ON event (dept, observed_at DESC)
  WHERE family = 'presse_locale' AND dept IS NOT NULL;

DO $$
DECLARE
  con     record;
  wanted  text := $check$CHECK (family IN ('ransomware','vuln','phishing','malware','cert','cert_fr','typosquat','reputation','cti','presse','leaks','paste','presse_cyber','presse_locale'))$check$;
  changed boolean := false;
BEGIN
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'event'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%family%'
  LOOP
    IF con.def ILIKE '%presse_locale%' THEN
      RAISE NOTICE 'migrate-211 : % accepte déjà presse_locale', con.conname;
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM event
       WHERE family NOT IN ('ransomware','vuln','phishing','malware','cert','cert_fr','typosquat','reputation','cti','presse','leaks','paste','presse_cyber','presse_locale')
    ) THEN
      RAISE NOTICE 'migrate-211 : famille hors contrat présente — CHECK % laissé en place', con.conname;
      CONTINUE;
    END IF;
    RAISE NOTICE 'migrate-211 : remplace % par la liste des 14 familles', con.conname;
    EXECUTE format('ALTER TABLE event DROP CONSTRAINT %I', con.conname);
    EXECUTE format('ALTER TABLE event ADD CONSTRAINT %I %s', con.conname, wanted);
    changed := true;
  END LOOP;
  IF NOT changed THEN
    RAISE NOTICE 'migrate-211 : aucun CHECK à élargir — le contrat applicatif fait foi';
  END IF;
END $$;

COMMIT;
