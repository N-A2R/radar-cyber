-- 200 — Procédures collectives BODACC par SIREN.
--
-- BODACC est une source NATIONALE : elle n'est pas déclarée comme une source
-- régionale locale. Le filtre Nouvelle-Aquitaine (region_code=75) est appliqué
-- à la lecture des annonces, puis la preuve est conservée par SIREN dans
-- event.evidence. Les champs region/department de `source` restent vides exprès.
--
-- Une annonce retenue doit porter trois preuves non nulles : la date
-- d'observation (date de parution), le SIREN et l'URL de l'annonce d'origine.
-- La contrainte ci-dessous les rend obligatoires pour toute famille `bodacc`,
-- quelle que soit la voie d'écriture (collecteur, script, import manuel).
-- `coalesce(…, '')` est nécessaire : en SQL un CHECK qui évalue à NULL est
-- réputé satisfait, donc sans lui une preuve absente passerait.

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, relevance)
VALUES (
  'bodacc:pc-na',
  'BODACC — annonces commerciales (source nationale, procédures collectives en Nouvelle-Aquitaine)',
  'bodacc',
  'https://www.bodacc.fr/pages/annonces-commerciales-recherche/',
  'données publiques BODACC / DILA, diffusion libre',
  true,
  'api',
  'json',
  '{"bodacc":{"dataset":"annonces-commerciales","familleavis":"collective","region_code":75,"siren_key":"registre"}}'::jsonb,
  3600,
  'Source nationale d''annonces légales : seules les annonces de procédures collectives dont le SIREN est rattaché à un établissement de Nouvelle-Aquitaine (region_code=75) sont retenues. Chaque événement cite l''URL de l''annonce BODACC d''origine. Aucune donnée personnelle n''est stockée : ni nom de personne physique, ni adresse.',
  'strict'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  license = EXCLUDED.license,
  enabled = EXCLUDED.enabled,
  kind = EXCLUDED.kind,
  format = EXCLUDED.format,
  parser = EXCLUDED.parser,
  interval_sec = EXCLUDED.interval_sec,
  description = EXCLUDED.description,
  relevance = EXCLUDED.relevance;

-- Si une instance porte un CHECK sur event.family (migrate-019/025), on
-- l'élargit à `bodacc`. On ne crée pas de CHECK là où il n'y en a pas.
DO $$
DECLARE
  con record;
  wanted text := $check$CHECK (family IN ('ransomware','vuln','phishing','malware','cert','cert_fr','typosquat','reputation','cti','presse','leaks','paste','presse_cyber','bodacc'))$check$;
BEGIN
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'event'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%family%'
  LOOP
    CONTINUE WHEN con.def ILIKE '%bodacc%';
    IF EXISTS (
      SELECT 1 FROM event
       WHERE family NOT IN ('ransomware','vuln','phishing','malware','cert','cert_fr','typosquat','reputation','cti','presse','leaks','paste','presse_cyber','bodacc')
    ) THEN
      RAISE NOTICE 'migrate-200 : CHECK % laissé en place, famille hors contrat en base', con.conname;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE event DROP CONSTRAINT %I', con.conname);
    EXECUTE format('ALTER TABLE event ADD CONSTRAINT %I %s', con.conname, wanted);
    RAISE NOTICE 'migrate-200 : % élargi à la famille bodacc', con.conname;
  END LOOP;
END $$;

ALTER TABLE event DROP CONSTRAINT IF EXISTS event_bodacc_preuve_check;
ALTER TABLE event ADD CONSTRAINT event_bodacc_preuve_check CHECK (
  family <> 'bodacc'
  OR (
    observed_at IS NOT NULL
    AND coalesce(evidence->>'url_bodacc', '') ~ '^https://www\.bodacc\.fr/'
    AND coalesce(evidence->>'siren', '') ~ '^[0-9]{9}$'
  )
);

CREATE INDEX IF NOT EXISTS event_bodacc_siren_idx
  ON event ((evidence->>'siren'), observed_at DESC)
  WHERE family = 'bodacc';

CREATE INDEX IF NOT EXISTS event_bodacc_recent_idx
  ON event (observed_at DESC)
  WHERE family = 'bodacc';
