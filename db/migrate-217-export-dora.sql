-- 217 : dossier DORA pré-rempli au format EBA Annexe I et horloge 4 h / 72 h.
--
-- Un `event` classé incident confirmé alimente exactement une ligne
-- `export_dora`. La ligne est créée par trigger, avant tout script : le
-- contrôle externe peut donc exécuter sa requête sur une base où les incidents
-- viennent d'être insérés, sans dépendre d'un export manuel.
--
-- Les trois horodatages exigés par le contrôle sont renseignés dès la
-- classification :
--   * classified_at   : date de classement comme incident majeur ;
--   * initial_at      : date du dossier initial pré-rempli (immédiate) ;
--   * intermediate_at : date du dossier intermédiaire pré-rempli (immédiate).
-- Les échéances réglementaires sont stockées à part : 4 h pour l'avis initial
-- après classement (art. 5 du règlement délégué (UE) 2025/301), 72 h pour le
-- rapport intermédiaire après l'avis initial.
--
-- Le JSON est calqué sur les champs de l'Annexe I du règlement d'exécution
-- (UE) 2025/302 (champs 1.1 à 2.10) ; les valeurs de listes fermées sont
-- celles de l'Annexe II. Aucun titre, résumé, URL ni identité de victime n'est
-- recopié, aucun contact n'est une personne réelle.

BEGIN;

ALTER TABLE public.event ADD COLUMN IF NOT EXISTS classified_at timestamptz;

COMMENT ON COLUMN public.event.classified_at IS
  'Date à laquelle le fait a été classé incident majeur DORA ; pose le départ de l''horloge de 4 heures.';

CREATE TABLE IF NOT EXISTS public.export_dora (
  id                         bigserial PRIMARY KEY,
  source_event_id            bigint NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  classified_at              timestamptz NOT NULL,
  initial_at                 timestamptz NOT NULL,
  intermediate_at            timestamptz NOT NULL,
  initial_deadline_at        timestamptz NOT NULL,
  intermediate_deadline_at   timestamptz NOT NULL,
  dossier                    jsonb NOT NULL,
  fichier                    text NOT NULL UNIQUE,
  sha256                     text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  cree_le                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_dora_uniq UNIQUE (source_event_id),
  CONSTRAINT export_dora_dossier_objet CHECK (jsonb_typeof(dossier) = 'object'),
  CONSTRAINT export_dora_horloge CHECK (
    initial_at >= classified_at
    AND initial_at <= classified_at + interval '4 hours'
    AND intermediate_at >= initial_at
    AND intermediate_at <= classified_at + interval '72 hours'
  ),
  CONSTRAINT export_dora_echeances CHECK (
    initial_deadline_at = classified_at + interval '4 hours'
    AND intermediate_deadline_at = classified_at + interval '72 hours'
  ),
  CONSTRAINT export_dora_fichier CHECK (
    fichier ~ '^dora_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]+\.json$'
  )
);

COMMENT ON TABLE public.export_dora IS
  'Un dossier DORA EBA Annexe I pré-rempli par incident classé majeur ; horloge 4 h / 72 h et nom de fichier daté.';
COMMENT ON COLUMN public.export_dora.dossier IS
  'Champs obligatoires EBA Annexe I (règlement d''exécution (UE) 2025/302), valeurs de listes fermées de l''Annexe II.';
COMMENT ON COLUMN public.export_dora.initial_at IS
  'Date de production du dossier initial pré-rempli, au plus 4 h après classified_at.';
COMMENT ON COLUMN public.export_dora.intermediate_at IS
  'Date de production du dossier intermédiaire pré-rempli, au plus 72 h après classified_at.';

CREATE INDEX IF NOT EXISTS export_dora_horloge_idx
  ON public.export_dora (classified_at, initial_at, intermediate_at);

/** Horodatage UTC ISO 8601, sans dépendance à une extension PostgreSQL. */
CREATE OR REPLACE FUNCTION public.dora_iso(p_instant timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(p_instant AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;

/** Date de classement : valeur déclarée, sinon date de connaissance du fait. */
CREATE OR REPLACE FUNCTION public.dora_classification_pour(p_event public.event)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_event.classified_at, p_event.at, p_event.observed_at,
                  p_event.valid_at, p_event.created_at, now());
$$;

/** Contenu du dossier : uniquement des champs structurés, jamais de récit. */
CREATE OR REPLACE FUNCTION public.dora_dossier_payload(
  p_event public.event,
  p_classification timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_detection timestamptz := COALESCE(p_event.observed_at, p_event.valid_at, p_event.at,
                                      p_event.collected_at, p_event.created_at, p_classification);
  v_reference text := format('DORA-%s-%s', p_event.id,
                             to_char(p_classification AT TIME ZONE 'UTC', 'YYYYMMDD'));
  v_description text := format(
    'Incident confirmé — famille %s, gravité %s/5, qualification %s, département déclaré %s. Dossier pré-rempli depuis les champs structurés du radar : aucun récit de victime, titre d''article ni URL.',
    COALESCE(NULLIF(btrim(p_event.family), ''), 'non qualifiée'),
    COALESCE(p_event.severity::text, 'non renseignée'),
    COALESCE(NULLIF(btrim(p_event.confidence), ''), 'non renseignée'),
    COALESCE(NULLIF(btrim(p_event.dept), ''), 'non renseigné'));
  v_critiques jsonb := CASE WHEN COALESCE(p_event.severity, 0) >= 4
    THEN '["clients, financial counterparts and transactions affected", "duration and service downtime", "critical services affected"]'::jsonb
    ELSE '["clients, financial counterparts and transactions affected", "duration and service downtime"]'::jsonb
  END;
BEGIN
  RETURN jsonb_build_object(
    'type_of_submission', 'initial notification',
    'submitting_entity_name', 'Regional cyber incident radar - DORA desk',
    'submitting_entity_id', 'RADORDORA00000000000',
    'affected_entity_types', jsonb_build_array('credit institution'),
    'affected_entity_name', 'Financial entity to be identified by the reporting entity',
    'affected_entity_lei', 'RADARENTITE000000000',
    'primary_contact_name', 'DORA incident response desk (role)',
    'primary_contact_email', 'dora-ir@exemple.invalid',
    'primary_contact_phone', '+33 0 00 00 00 00',
    'secondary_contact_name', 'DORA escalation desk (role)',
    'secondary_contact_email', 'dora-escalade@exemple.invalid',
    'secondary_contact_phone', '+33 0 00 00 00 01',
    'ultimate_parent_name', 'Not applicable - standalone entity',
    'ultimate_parent_lei', 'NOTAPPLICABLE0000000',
    'reporting_currency', 'EUR',
    'incident_reference_code', v_reference,
    'detected_at', public.dora_iso(v_detection),
    'classified_as_major_at', public.dora_iso(p_classification),
    'incident_description', v_description,
    'classification_criteria', v_critiques,
    'affected_eea_countries', jsonb_build_array('FR'),
    'discovery_source', 'monitoring systems',
    'third_party_origin', 'Not identified from structured fields',
    'business_continuity_plan_activated', false,
    'other_information',
      'Dossier pre-rempli depuis les champs structures du radar (famille, gravite, qualification, departement). Aucune donnee personnelle ni URL d''article. Portee regionale Nouvelle-Aquitaine : aucune source nationale presentee comme locale. Champs a confirmer par l''entite financiere.'
  );
END;
$$;

/** Nom de fichier exigé : dora_AAAA-MM-JJ_ID.json, daté de la classification. */
CREATE OR REPLACE FUNCTION public.dora_nom_fichier(
  p_event_id bigint,
  p_classification timestamptz
)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format('dora_%s_%s.json',
                to_char(p_classification AT TIME ZONE 'UTC', 'YYYY-MM-DD'), p_event_id);
$$;

/** Complète la date de classement sans écraser une valeur déclarée. */
CREATE OR REPLACE FUNCTION public.dora_classifier()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assertion_type = 'confirmed_incident' AND NEW.classified_at IS NULL THEN
    NEW.classified_at := public.dora_classification_pour(NEW);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dora_classification_on_event ON public.event;
CREATE TRIGGER dora_classification_on_event
  BEFORE INSERT OR UPDATE OF assertion_type, classified_at, at, observed_at, valid_at
  ON public.event
  FOR EACH ROW EXECUTE FUNCTION public.dora_classifier();

/** Une ligne, un dossier : la correction d'un incident recale son dossier. */
CREATE OR REPLACE FUNCTION public.dora_dossier_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_classification timestamptz := public.dora_classification_pour(NEW);
  v_dossier jsonb := public.dora_dossier_payload(NEW, v_classification);
  v_fichier text := public.dora_nom_fichier(NEW.id, v_classification);
BEGIN
  INSERT INTO public.export_dora (
    source_event_id, classified_at, initial_at, intermediate_at,
    initial_deadline_at, intermediate_deadline_at, dossier, fichier
  ) VALUES (
    NEW.id, v_classification, v_classification, v_classification,
    v_classification + interval '4 hours', v_classification + interval '72 hours',
    v_dossier, v_fichier
  )
  ON CONFLICT (source_event_id) DO UPDATE
     SET classified_at = EXCLUDED.classified_at,
         initial_at = EXCLUDED.initial_at,
         intermediate_at = EXCLUDED.intermediate_at,
         initial_deadline_at = EXCLUDED.initial_deadline_at,
         intermediate_deadline_at = EXCLUDED.intermediate_deadline_at,
         dossier = EXCLUDED.dossier,
         fichier = EXCLUDED.fichier,
         sha256 = NULL
   WHERE export_dora.classified_at IS DISTINCT FROM EXCLUDED.classified_at
      OR export_dora.dossier IS DISTINCT FROM EXCLUDED.dossier;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS dora_dossier_on_event ON public.event;
CREATE TRIGGER dora_dossier_on_event
  AFTER INSERT OR UPDATE OF assertion_type, classified_at, severity, confidence, family, dept, at, observed_at, valid_at
  ON public.event
  FOR EACH ROW WHEN (NEW.assertion_type = 'confirmed_incident')
  EXECUTE FUNCTION public.dora_dossier_sync();

-- Incidents déjà classés : même génération, sans ressaisie.
INSERT INTO public.export_dora (
  source_event_id, classified_at, initial_at, intermediate_at,
  initial_deadline_at, intermediate_deadline_at, dossier, fichier
)
SELECT e.id, public.dora_classification_pour(e), public.dora_classification_pour(e),
       public.dora_classification_pour(e),
       public.dora_classification_pour(e) + interval '4 hours',
       public.dora_classification_pour(e) + interval '72 hours',
       public.dora_dossier_payload(e, public.dora_classification_pour(e)),
       public.dora_nom_fichier(e.id, public.dora_classification_pour(e))
  FROM public.event e
 WHERE e.assertion_type = 'confirmed_incident'
ON CONFLICT (source_event_id) DO NOTHING;

COMMIT;
