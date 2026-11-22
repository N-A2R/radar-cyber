-- 064 : admission de custody à l'écriture, pour toute voie d'ingestion.
--
-- Le backfill de la migration précédente a réparé 112 événements NA, mais la
-- voie d'ingestion externe (`na-gap`) n'écrivait aucun fait d'admission : chaque
-- nouvel événement régional retombait dans le trou et attendait une réparation.
-- On pose le fait au moment de l'INSERT, dans la même transaction, quelle que
-- soit la voie : application, script, ou client externe. Le journal reste
-- append-only (migration 027) et aucune donnée de victime n'est journalisée.

BEGIN;

CREATE OR REPLACE FUNCTION custody_admission_at_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.regional IS DISTINCT FROM TRUE THEN
    RETURN NULL;
  END IF;

  -- Un fait d'admission complet existe déjà : on ne double pas l'admission.
  IF EXISTS (
    SELECT 1 FROM journal j
     WHERE j.subject = NEW.dedup_key
       AND j.kind IN ('event.admitted', 'custody.seen')
       AND btrim(j.actor) <> ''
       AND j.recorded_at IS NOT NULL
       AND j.payload <> '{}'::jsonb
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
  VALUES (
    'event.admitted',
    NEW.dedup_key,
    'custody: admission recorded at write time',
    jsonb_build_object(
      'sourceId', NEW.source_id,
      'sourceUrl', NEW.source_url,
      'observedAt', NEW.observed_at,
      'family', NEW.family,
      'assertionType', NEW.assertion_type,
      'admissionRule', 'custody-write-boundary@1'
    ),
    'custody:write-boundary@1',
    NEW.observed_at
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS event_custody_admission ON event;
CREATE TRIGGER event_custody_admission
  AFTER INSERT ON event
  FOR EACH ROW
  EXECUTE FUNCTION custody_admission_at_insert();

COMMENT ON FUNCTION custody_admission_at_insert() IS
  'Admission d''un événement Nouvelle-Aquitaine journalisée à l''INSERT, pour toute voie d''écriture.';

COMMIT;
