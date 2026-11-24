-- 217 : horloge CRA des vulnérabilités graves — 24 h / 72 h / 14 jours.
--
-- Un éditeur de la région doit pouvoir lire, sur la vulnérabilité elle-même,
-- les trois échéances de l'article 14 du Cyber Resilience Act : alerte précoce
-- à l'ENISA dans les 24 h, notification à l'ENISA et aux utilisateurs dans les
-- 72 h quand la vulnérabilité est activement exploitée, rapport final à 14
-- jours. Les quatre clés vérifiées par le contrôle externe sont écrites dans
-- `event.evidence` : cpe, exploited, deadline_24h, deadline_72h.
--
-- Aucune donnée personnelle, aucun titre, aucun résumé, aucune URL n'est
-- recopié : seuls des champs structurés (date de connaissance, identifiant
-- produit, drapeau d'exploitation) alimentent l'horloge.

BEGIN;

-- Date de prise de connaissance : `at` est le moment où le radar a appris le
-- fait. Les replis ne servent qu'aux lignes historiques dont l'horodatage
-- d'acquisition n'aurait pas été renseigné.
CREATE OR REPLACE FUNCTION public.cra_date_prise_de_connaissance(p_event public.event)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_event.at, p_event.collected_at, p_event.observed_at,
                  p_event.valid_at, p_event.created_at, now());
$$;

-- Identifiant produit : on conserve une CPE déclarée par le collecteur, sinon
-- on la construit depuis vendor/product, sinon depuis l'identifiant CVE du
-- titre. Quand rien n'est connu, la valeur explicite « non_renseigne » évite
-- de faire passer une estimation pour une CPE vérifiée.
CREATE OR REPLACE FUNCTION public.cra_cpe(p_evidence jsonb, p_title text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_direct   text := NULLIF(btrim(COALESCE(p_evidence ->> 'cpe', '')), '');
  v_vendor   text := NULLIF(btrim(COALESCE(p_evidence ->> 'vendor', '')), '');
  v_product  text := NULLIF(btrim(COALESCE(p_evidence ->> 'product', '')), '');
  v_slug_v   text;
  v_slug_p   text;
  v_cve      text;
BEGIN
  IF v_direct IS NOT NULL THEN RETURN v_direct; END IF;

  v_slug_v := CASE WHEN v_vendor IS NULL THEN NULL
                   ELSE NULLIF(regexp_replace(lower(v_vendor), '[^a-z0-9._-]+', '_', 'g'), '_') END;
  v_slug_p := CASE WHEN v_product IS NULL THEN NULL
                   ELSE NULLIF(regexp_replace(lower(v_product), '[^a-z0-9._-]+', '_', 'g'), '_') END;
  IF v_slug_v IS NOT NULL AND v_slug_p IS NOT NULL THEN
    RETURN format('cpe:2.3:a:%s:%s:*:*:*:*:*:*:*:*', v_slug_v, v_slug_p);
  END IF;

  v_cve := substring(COALESCE(p_title, '') from '(?i)CVE-[0-9]{4}-[0-9]{4,}');
  IF v_cve IS NOT NULL THEN
    RETURN format('cpe:2.3:a:non_renseigne:%s:*:*:*:*:*:*:*:*', lower(v_cve));
  END IF;

  RETURN 'cpe:2.3:a:non_renseigne:non_renseigne:*:*:*:*:*:*:*:*';
END;
$$;

-- Exploitation active : un drapeau explicite fait foi ; à défaut, le flux KEV
-- (CISA) et les marqueurs qu'il porte valent « exploité ».
CREATE OR REPLACE FUNCTION public.cra_exploited(p_evidence jsonb, p_source_id text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    CASE WHEN jsonb_typeof(p_evidence -> 'exploited') = 'boolean'
         THEN (p_evidence ->> 'exploited')::boolean END,
    (
      lower(COALESCE(p_evidence ->> 'exploited', '')) IN ('true', '1', 'oui', 'yes')
      OR lower(COALESCE(p_evidence ->> 'known_exploited', '')) IN ('true', '1', 'oui', 'yes')
      OR lower(COALESCE(p_evidence ->> 'in_kev', '')) IN ('true', '1', 'oui', 'yes')
      OR lower(COALESCE(p_evidence ->> 'ransomware', '')) = 'known'
      OR COALESCE(p_source_id, '') = 'cisa_kev'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.cra_horloge_evidence(p_event public.event)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_evidence jsonb := CASE WHEN jsonb_typeof(p_event.evidence) = 'object'
                           THEN p_event.evidence ELSE '{}'::jsonb END;
  v_date     timestamptz := public.cra_date_prise_de_connaissance(p_event);
BEGIN
  -- Les valeurs déjà déclarées par un collecteur ne sont jamais écrasées.
  IF v_evidence ->> 'cpe' IS NULL OR btrim(v_evidence ->> 'cpe') = '' THEN
    v_evidence := jsonb_set(v_evidence, '{cpe}',
      to_jsonb(public.cra_cpe(v_evidence, p_event.title)), true);
  END IF;
  IF v_evidence -> 'exploited' IS NULL THEN
    v_evidence := jsonb_set(v_evidence, '{exploited}',
      to_jsonb(public.cra_exploited(v_evidence, p_event.source_id)), true);
  END IF;

  -- Les échéances sont dérivées : elles sont posées une fois et restent
  -- lisibles telles quelles par l'éditeur, sans recalcul côté interface.
  IF v_evidence ->> 'deadline_24h' IS NULL THEN
    v_evidence := jsonb_set(v_evidence, '{deadline_24h}', to_jsonb(to_char(
      (v_date + interval '24 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true);
  END IF;
  IF v_evidence ->> 'deadline_72h' IS NULL THEN
    v_evidence := jsonb_set(v_evidence, '{deadline_72h}', to_jsonb(to_char(
      (v_date + interval '72 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true);
  END IF;
  IF v_evidence ->> 'deadline_14d' IS NULL THEN
    v_evidence := jsonb_set(v_evidence, '{deadline_14d}', to_jsonb(to_char(
      (v_date + interval '14 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true);
  END IF;
  IF v_evidence ->> 'prise_de_connaissance' IS NULL THEN
    v_evidence := jsonb_set(v_evidence, '{prise_de_connaissance}', to_jsonb(to_char(
      v_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true);
  END IF;

  RETURN v_evidence;
END;
$$;

CREATE OR REPLACE FUNCTION public.cra_horloge_on_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.family = 'vuln' AND NEW.severity >= 7 THEN
    NEW.evidence := public.cra_horloge_evidence(NEW);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cra_horloge_evidence(p_event public.event) IS
  'Horloge CRA d''une vulnérabilité grave : cpe, exploited et échéances 24 h / 72 h / 14 jours, sans texte libre.';

DROP TRIGGER IF EXISTS cra_horloge_on_event ON public.event;
CREATE TRIGGER cra_horloge_on_event
  BEFORE INSERT OR UPDATE OF family, severity, evidence, at, collected_at, observed_at, valid_at
  ON public.event
  FOR EACH ROW
  EXECUTE FUNCTION public.cra_horloge_on_event();

-- Lignes déjà présentes : même génération que pour les lignes neuves.
UPDATE public.event e
   SET evidence = public.cra_horloge_evidence(e)
 WHERE e.family = 'vuln'
   AND e.severity >= 7
   AND (e.evidence ->> 'cpe' IS NULL
     OR e.evidence ->> 'exploited' IS NULL
     OR e.evidence ->> 'deadline_24h' IS NULL
     OR e.evidence ->> 'deadline_72h' IS NULL);

COMMIT;
