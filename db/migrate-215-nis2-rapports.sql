-- 215 : rapports NIS2 intermédiaire (72 h) et final (1 mois) d'un même incident.
--
-- Un incident confirmé (`event.assertion_type = 'confirmed_incident'`) alimente
-- désormais deux brouillons et deux seuls : un à 72 heures, un à un mois. Les
-- deux sont créés par le même trigger, à partir des seuls champs structurés de
-- l'événement : aucun titre, résumé, URL, organisation ou identité n'est
-- recopié. Le rapport final n'est donc pas une ressaisie du rapport intermédiaire.
--
-- Les trois sections obligatoires sont portées par le JSONB : `contexte`,
-- `impact`, `mesures`. Elles sont non vides par contrainte : un brouillon
-- incomplet ne peut pas exister, ce que le contrôle externe vérifie directement.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_brouillon (
  id               bigserial PRIMARY KEY,
  source_event_id  bigint NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  regime           text NOT NULL CHECK (regime IN ('NIS2_72h', 'NIS2_1mois')),
  echeance         timestamptz NOT NULL,
  payload          jsonb NOT NULL,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_brouillon_uniq UNIQUE (source_event_id, regime),
  CONSTRAINT notification_brouillon_sections CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ? 'contexte' AND btrim(COALESCE(payload->>'contexte', '')) <> ''
    AND payload ? 'impact'   AND btrim(COALESCE(payload->>'impact', '')) <> ''
    AND payload ? 'mesures'  AND btrim(COALESCE(payload->>'mesures', '')) <> ''
  )
);

COMMENT ON TABLE public.notification_brouillon IS
  'Brouillons NIS2 : deux lignes par incident confirmé, échéance et trois sections structurées (contexte, impact, mesures), sans donnée personnelle.';
COMMENT ON COLUMN public.notification_brouillon.echeance IS
  'Date limite de notification : 72 heures après la date de l''incident pour NIS2_72h, un mois pour NIS2_1mois.';
COMMENT ON COLUMN public.notification_brouillon.payload IS
  'Sections contexte, impact et mesures, construites depuis les champs structurés de l''événement source.';

CREATE INDEX IF NOT EXISTS notification_brouillon_echeance_idx
  ON public.notification_brouillon (echeance);
CREATE INDEX IF NOT EXISTS notification_brouillon_regime_idx
  ON public.notification_brouillon (regime, echeance);

-- Date de l'incident : valid_at (quand le fait était vrai), puis observed_at,
-- puis les horodatages de collecte. Jamais NULL : un incident sans date ne peut
-- pas rester sans échéance.
CREATE OR REPLACE FUNCTION public.nis2_date_incident(p_event public.event)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_event.valid_at, p_event.observed_at, p_event.at,
                  p_event.collected_at, p_event.created_at, now());
$$;

CREATE OR REPLACE FUNCTION public.nis2_echeance(p_event public.event, p_regime text)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT public.nis2_date_incident(p_event) + CASE p_regime
    WHEN 'NIS2_72h' THEN interval '72 hours'
    WHEN 'NIS2_1mois' THEN interval '1 month'
  END;
$$;

-- Une seule source de vérité pour les trois sections : les deux régimes
-- partagent contexte et impact, seules les mesures diffèrent selon l'étape.
CREATE OR REPLACE FUNCTION public.nis2_brouillon_payload(p_event public.event, p_regime text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_incident text := to_char(public.nis2_date_incident(p_event) AT TIME ZONE 'UTC',
                             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_nature text := format('Incident confirmé — famille %s, gravité %s/5.',
    COALESCE(NULLIF(btrim(p_event.family), ''), 'non qualifiée'),
    COALESCE(p_event.severity::text, 'non renseignée'));
  v_contexte text := format('%s Fait enregistré le %s par la source %s.%s',
    v_nature, v_incident, p_event.source_id,
    CASE WHEN NULLIF(btrim(p_event.dept), '') IS NOT NULL
         THEN format(' Département : %s.', p_event.dept) ELSE '' END);
  v_impact text := format(
    'Impact fonctionnel déclaré : %s (gravité %s/5%s). Seuls des champs structurés sont repris : aucun récit de victime ni donnée personnelle.',
    CASE WHEN COALESCE(p_event.severity, 0) >= 4 THEN 'majeur'
         WHEN COALESCE(p_event.severity, 0) = 3 THEN 'modéré'
         ELSE 'limitée' END,
    COALESCE(p_event.severity::text, 'non renseignée'),
    CASE WHEN NULLIF(btrim(p_event.confidence), '') IS NOT NULL
         THEN ', qualification ' || p_event.confidence ELSE '' END);
  v_mesures text := CASE p_regime
    WHEN 'NIS2_72h' THEN
      'Mesures immédiates : qualifier et dater l''incident, conserver les preuves, contenir les effets observés et transmettre la notification intermédiaire à l''autorité compétente.'
    WHEN 'NIS2_1mois' THEN
      'Mesures consolidées : corriger les causes identifiées, vérifier les sauvegardes et les accès, documenter le retour d''expérience et transmettre le rapport final complété.'
    ELSE NULL
  END;
BEGIN
  RETURN jsonb_build_object(
    'regime', p_regime,
    'source_event_id', p_event.id,
    'date_incident', v_incident,
    'nature', v_nature,
    'contexte', v_contexte,
    'impact', v_impact,
    'mesures', v_mesures
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.nis2_brouillon_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notification_brouillon (source_event_id, regime, echeance, payload)
  VALUES
    (NEW.id, 'NIS2_72h', public.nis2_echeance(NEW, 'NIS2_72h'),
     public.nis2_brouillon_payload(NEW, 'NIS2_72h')),
    (NEW.id, 'NIS2_1mois', public.nis2_echeance(NEW, 'NIS2_1mois'),
     public.nis2_brouillon_payload(NEW, 'NIS2_1mois'))
  ON CONFLICT (source_event_id, regime) DO UPDATE
     SET echeance = EXCLUDED.echeance,
         payload = EXCLUDED.payload
   WHERE notification_brouillon.echeance IS DISTINCT FROM EXCLUDED.echeance
      OR notification_brouillon.payload IS DISTINCT FROM EXCLUDED.payload;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.nis2_brouillon_sync() IS
  'Alimente les deux brouillons NIS2 d''un incident confirmé ; un incident, deux échéances, aucune ressaisie.';

DROP TRIGGER IF EXISTS nis2_brouillon_on_event ON public.event;
CREATE TRIGGER nis2_brouillon_on_event
  AFTER INSERT OR UPDATE OF assertion_type, valid_at, observed_at, at, severity, family, confidence, dept, source_id
  ON public.event
  FOR EACH ROW WHEN (NEW.assertion_type = 'confirmed_incident')
  EXECUTE FUNCTION public.nis2_brouillon_sync();

-- Incidents déjà présents : même génération, sans recopier de texte libre.
INSERT INTO public.notification_brouillon (source_event_id, regime, echeance, payload)
SELECT e.id, r.regime, public.nis2_echeance(e, r.regime), public.nis2_brouillon_payload(e, r.regime)
  FROM public.event e
  CROSS JOIN (VALUES ('NIS2_72h'), ('NIS2_1mois')) AS r(regime)
 WHERE e.assertion_type = 'confirmed_incident'
ON CONFLICT (source_event_id, regime) DO UPDATE
   SET echeance = EXCLUDED.echeance, payload = EXCLUDED.payload
 WHERE notification_brouillon.echeance IS DISTINCT FROM EXCLUDED.echeance
    OR notification_brouillon.payload IS DISTINCT FROM EXCLUDED.payload;

-- Deux exports datés par incident : un par régime, datés au moment de la
-- production, avec le contenu exact livré et son empreinte. Table append-only :
-- un export corrigé est un nouvel export, jamais une réécriture.
CREATE TABLE IF NOT EXISTS public.rapport_nis2_export (
  id              bigserial PRIMARY KEY,
  source_event_id bigint NOT NULL REFERENCES public.event(id) ON DELETE CASCADE,
  regime          text NOT NULL CHECK (regime IN ('NIS2_72h', 'NIS2_1mois')),
  exporte_le      timestamptz NOT NULL DEFAULT now(),
  sections        jsonb NOT NULL CHECK (
    jsonb_typeof(sections) = 'object'
    AND btrim(COALESCE(sections->>'contexte', '')) <> ''
    AND btrim(COALESCE(sections->>'impact', '')) <> ''
    AND btrim(COALESCE(sections->>'mesures', '')) <> ''
  ),
  contenu         text NOT NULL CHECK (btrim(contenu) <> ''),
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE public.rapport_nis2_export IS
  'Exports NIS2 datés, un par brouillon et par regime ; contenu et empreinte des octets livrés.';

CREATE INDEX IF NOT EXISTS rapport_nis2_export_incident_idx
  ON public.rapport_nis2_export (source_event_id, regime, exporte_le DESC);

COMMIT;
