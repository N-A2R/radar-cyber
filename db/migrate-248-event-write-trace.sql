-- 248 : trace d'écriture pour les événements hors Nouvelle-Aquitaine.
--
-- La migration 064 journalise l'admission à l'INSERT mais seulement quand
-- `regional IS TRUE`. Les écritures directes (migrations 200/215/216/224,
-- scripts, clients externes) insèrent donc des événements hors région sans
-- aucun fait dans le journal de vérité : `verify-journal` y voit un angle
-- mort, pas une décision d'admission.
--
-- On complète la frontière d'écriture sans modifier 064 ni 065 : les
-- événements régionaux gardent leur fait `event.admitted` et leur acteur.
-- Les autres reçoivent le fait déjà utilisé par le collecteur,
-- `event.rejected`, avec le motif explicite `outside-nouvelle-aquitaine` et
-- la même preuve (jamais le titre ni les données de victime). Le backfill ne
-- touche que les événements sans sujet dans le journal, et les deux écritures
-- sont dédupliquées sur (subject, kind) : rejouer le SQL n'ajoute aucun fait.

BEGIN;

CREATE OR REPLACE FUNCTION custody_outside_trace_at_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Le fait d'admission régional reste la responsabilité exclusive de 064.
  IF NEW.regional IS TRUE THEN
    RETURN NULL;
  END IF;

  -- Une trace de refus existe déjà pour ce sujet : on ne la double pas.
  IF EXISTS (
    SELECT 1 FROM journal j
     WHERE j.subject = NEW.dedup_key
       AND j.kind = 'event.rejected'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
  VALUES (
    'event.rejected',
    NEW.dedup_key,
    'custody: outside Nouvelle-Aquitaine recorded at write time',
    jsonb_build_object(
      'reason', 'outside-nouvelle-aquitaine',
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

DROP TRIGGER IF EXISTS event_custody_outside_trace ON event;
CREATE TRIGGER event_custody_outside_trace
  AFTER INSERT ON event
  FOR EACH ROW
  EXECUTE FUNCTION custody_outside_trace_at_insert();

-- Les événements déjà stockés sans trace sont réparés une fois. Les sujets
-- déjà journalisés (rattachement, admission, décision…) sont couverts : on ne
-- leur ajoute pas de fait redondant.
DO $$
DECLARE
  evenement record;
BEGIN
  FOR evenement IN
    SELECT ev.dedup_key, ev.regional, ev.source_id, ev.source_url,
           ev.observed_at, ev.family, ev.assertion_type
      FROM event ev
     WHERE NOT EXISTS (
       SELECT 1 FROM journal j WHERE j.subject = ev.dedup_key
     )
  LOOP
    IF evenement.regional IS TRUE THEN
      IF NOT EXISTS (
        SELECT 1 FROM journal j
         WHERE j.subject = evenement.dedup_key
           AND j.kind = 'event.admitted'
      ) THEN
        INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
        VALUES (
          'event.admitted',
          evenement.dedup_key,
          'custody: admission recorded at write time',
          jsonb_build_object(
            'sourceId', evenement.source_id,
            'sourceUrl', evenement.source_url,
            'observedAt', evenement.observed_at,
            'family', evenement.family,
            'assertionType', evenement.assertion_type,
            'admissionRule', 'custody-write-boundary@1'
          ),
          'custody:write-boundary@1',
          evenement.observed_at
        );
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM journal j
         WHERE j.subject = evenement.dedup_key
           AND j.kind = 'event.rejected'
      ) THEN
        INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
        VALUES (
          'event.rejected',
          evenement.dedup_key,
          'custody: outside Nouvelle-Aquitaine recorded at write time',
          jsonb_build_object(
            'reason', 'outside-nouvelle-aquitaine',
            'sourceId', evenement.source_id,
            'sourceUrl', evenement.source_url,
            'observedAt', evenement.observed_at,
            'family', evenement.family,
            'assertionType', evenement.assertion_type,
            'admissionRule', 'custody-write-boundary@1'
          ),
          'custody:write-boundary@1',
          evenement.observed_at
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION custody_outside_trace_at_insert() IS
  'Trace d''un événement hors Nouvelle-Aquitaine journalisée à l''INSERT, sans donnée de victime.';

COMMIT;
