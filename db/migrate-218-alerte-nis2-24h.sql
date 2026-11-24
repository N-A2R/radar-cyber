-- 218 : alerte précoce NIS2 à 24 heures depuis un événement.
--
-- La migration 215 produit les rapports à 72 h et à 1 mois. Un incident grave
-- doit aussi pouvoir être notifié dans les 24 heures suivant sa prise de
-- connaissance. Le même incident alimente donc un troisième brouillon,
-- `NIS2_24h`, sans ressaisie : l'horodatage de prise de connaissance est
-- `event.at` (moment où le radar a appris le fait), l'échéance est
-- exactement `awareness_at + 24 hours`, et l'impact est décrit depuis les
-- seuls champs structurés de l'événement.
--
-- Aucun titre, résumé, URL d'article, nom de victime ni identité n'est repris.
-- Le classement NIS2 de l'entité (migration 217, PR séparée) n'est pas
-- recopié : quand l'événement porte un `org_id`, seule la référence numérique
-- de l'organisation est conservée, avec mention que l'assujettissement est à
-- confirmer par l'entité. Aucune source nationale n'est présentée comme locale.

BEGIN;

ALTER TABLE public.notification_brouillon
  ADD COLUMN IF NOT EXISTS awareness_at timestamptz;

ALTER TABLE public.notification_brouillon
  DROP CONSTRAINT IF EXISTS notification_brouillon_regime_check;
ALTER TABLE public.notification_brouillon
  ADD CONSTRAINT notification_brouillon_regime_check
  CHECK (regime IN ('NIS2_72h', 'NIS2_1mois', 'NIS2_24h'));

-- Échoue fermé : un brouillon d'alerte précoce incomplet ne peut pas exister.
-- Les autres régimes gardent leur contrat d'origine (sections obligatoires).
ALTER TABLE public.notification_brouillon
  DROP CONSTRAINT IF EXISTS notification_brouillon_alerte_24h;
ALTER TABLE public.notification_brouillon
  ADD CONSTRAINT notification_brouillon_alerte_24h CHECK (
    regime <> 'NIS2_24h'
    OR (
      source_event_id IS NOT NULL
      AND awareness_at IS NOT NULL
      AND echeance = awareness_at + interval '24 hours'
      AND payload ? 'awareness_at'
      AND btrim(COALESCE(payload->>'awareness_at', '')) <> ''
      AND payload ? 'impact'
      AND btrim(COALESCE(payload->>'impact', '')) <> ''
    )
  );

COMMENT ON COLUMN public.notification_brouillon.awareness_at IS
  'Horodatage de prise de connaissance de l''événement (event.at) ; obligatoire pour NIS2_24h, échéance = awareness_at + 24 heures.';

CREATE INDEX IF NOT EXISTS notification_brouillon_alerte_24h_idx
  ON public.notification_brouillon (regime, awareness_at);

-- `event.at` est renseigné quand le radar apprend le fait. Les replis ne
-- servent qu'aux événements historiques dont l'horodatage manquerait.
CREATE OR REPLACE FUNCTION public.nis2_prise_connaissance(p_event public.event)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_event.at, p_event.observed_at, p_event.valid_at,
                  p_event.collected_at, p_event.created_at, now());
$$;

CREATE OR REPLACE FUNCTION public.nis2_alerte_24h_payload(p_event public.event)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_awareness timestamptz := public.nis2_prise_connaissance(p_event);
  v_echeance  timestamptz := public.nis2_prise_connaissance(p_event) + interval '24 hours';
  v_pris      text := to_char(v_awareness AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_limite    text := to_char(v_echeance AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_gravite   text := COALESCE(p_event.severity::text, 'non renseignée');
  v_famille   text := COALESCE(NULLIF(btrim(p_event.family), ''), 'non qualifiée');
  v_entite    text;
  v_kind      text;
BEGIN
  IF p_event.org_id IS NULL THEN
    v_entite := 'Aucune organisation rattachée à l''événement : assujettissement à qualifier par l''entité.';
  ELSE
    SELECT o.kind INTO v_kind FROM public.org o WHERE o.id = p_event.org_id;
    v_entite := format(
      'Organisation du référentiel #%s%s : assujettissement NIS2 à confirmer par l''entité.',
      p_event.org_id,
      CASE WHEN NULLIF(btrim(COALESCE(v_kind, '')), '') IS NOT NULL
           THEN format(' (type déclaré : %s)', v_kind) ELSE '' END
    );
  END IF;

  RETURN jsonb_build_object(
    'regime', 'NIS2_24h',
    'source_event_id', p_event.id,
    'awareness_at', v_pris,
    'date_prise_connaissance', v_pris,
    'echeance', v_limite,
    'contexte', format(
      'Incident de gravité %s/5, famille %s, pris en connaissance le %s. Source déclarée : %s. %s',
      v_gravite, v_famille, v_pris, p_event.source_id, v_entite
    ),
    'impact', format(
      'Impact fonctionnel présomptif : majeur (gravité %s/5%s). Aucun récit de victime ni donnée personnelle n''est repris.',
      v_gravite,
      CASE WHEN NULLIF(btrim(COALESCE(p_event.confidence, '')), '') IS NOT NULL
           THEN ', qualification ' || p_event.confidence ELSE '' END
    ),
    'mesures', 'Alerte précoce à transmettre à l''autorité compétente (ANSSI) dans les 24 heures suivant la prise de connaissance : qualifier l''incident, contenir les effets observés et conserver les preuves.',
    'autorite', 'ANSSI — autorité compétente ; transposition nationale à confirmer par l''entité.',
    'gravite', COALESCE(p_event.severity, 0),
    'famille', v_famille,
    'entite_id', p_event.org_id
  );
END;
$$;

-- Une seule écriture : le trigger et le rattrapage appellent la même fonction.
CREATE OR REPLACE FUNCTION public.nis2_alerte_24h_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.severity, 0) >= 4
     AND NEW.assertion_type IN ('confirmed_incident', 'third_party_claim') THEN
    INSERT INTO public.notification_brouillon
      (source_event_id, regime, awareness_at, echeance, payload)
    VALUES
      (NEW.id, 'NIS2_24h', public.nis2_prise_connaissance(NEW),
       public.nis2_prise_connaissance(NEW) + interval '24 hours',
       public.nis2_alerte_24h_payload(NEW))
    ON CONFLICT (source_event_id, regime) DO UPDATE
       SET awareness_at = EXCLUDED.awareness_at,
           echeance = EXCLUDED.echeance,
           payload = EXCLUDED.payload
     WHERE notification_brouillon.awareness_at IS DISTINCT FROM EXCLUDED.awareness_at
        OR notification_brouillon.echeance IS DISTINCT FROM EXCLUDED.echeance
        OR notification_brouillon.payload IS DISTINCT FROM EXCLUDED.payload;
  ELSE
    DELETE FROM public.notification_brouillon
     WHERE source_event_id = NEW.id AND regime = 'NIS2_24h';
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.nis2_alerte_24h_sync() IS
  'Alerte NIS2 à 24 h : un brouillon daté par incident de gravité >= 4, horodatage de prise de connaissance et impact, sans donnée personnelle.';

DROP TRIGGER IF EXISTS nis2_alerte_24h_on_event ON public.event;
CREATE TRIGGER nis2_alerte_24h_on_event
  AFTER INSERT OR UPDATE OF assertion_type, severity, at, observed_at, valid_at,
                            collected_at, family, confidence, source_id, org_id
  ON public.event
  FOR EACH ROW
  EXECUTE FUNCTION public.nis2_alerte_24h_sync();

-- Rattrapage explicite (événements antérieurs à la migration ou correction
-- en lot) : même génération, aucune ressaisie.
CREATE OR REPLACE FUNCTION public.nis2_alerte_24h_genere()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_modifies integer;
BEGIN
  WITH ecrit AS (
    INSERT INTO public.notification_brouillon
      (source_event_id, regime, awareness_at, echeance, payload)
    SELECT e.id, 'NIS2_24h', public.nis2_prise_connaissance(e),
           public.nis2_prise_connaissance(e) + interval '24 hours',
           public.nis2_alerte_24h_payload(e)
      FROM public.event e
     WHERE COALESCE(e.severity, 0) >= 4
       AND e.assertion_type IN ('confirmed_incident', 'third_party_claim')
    ON CONFLICT (source_event_id, regime) DO UPDATE
       SET awareness_at = EXCLUDED.awareness_at,
           echeance = EXCLUDED.echeance,
           payload = EXCLUDED.payload
     WHERE notification_brouillon.awareness_at IS DISTINCT FROM EXCLUDED.awareness_at
        OR notification_brouillon.echeance IS DISTINCT FROM EXCLUDED.echeance
        OR notification_brouillon.payload IS DISTINCT FROM EXCLUDED.payload
    RETURNING 1
  )
  SELECT count(*) INTO v_modifies FROM ecrit;
  RETURN v_modifies;
END;
$$;

COMMENT ON FUNCTION public.nis2_alerte_24h_genere() IS
  'Produit ou rafraîchit les brouillons NIS2_24h en une passe ; renvoie le nombre de lignes écrites.';

-- Incidents déjà présents : le trigger ne rejoue pas sur une table existante.
SELECT public.nis2_alerte_24h_genere();

COMMIT;
