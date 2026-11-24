-- 217 : attribution hiérarchisée et contestable des revendications.
--
-- Le libellé de groupe des flux (`leak_claim.group_name`) reste un brut de
-- collecte : il n'est plus une attribution. La surface d'attribution est
-- `attribution` : un groupe reconnu, un code Admiralty (fiabilité A-F,
-- crédibilité 1-6), une preuve, un auteur pseudonyme (rôle système ou rôle
-- applicatif, jamais une personne) et une date.
--
-- Deux garde-fous :
--   1. sans preuve, une revendication reste « non attribué » avec le code F6
--      (inconnu) — le code est vérifié par un trigger, pas seulement par le
--      script de remplissage ;
--   2. toute écriture est copiée dans `attribution_audit` avant et après,
--      avec le motif de contestation transmis par la fonction dédiée.
--
-- Aucune donnée de victime, aucun courriel ni numéro de téléphone n'entre
-- dans ces tables : elles ne lisent que le groupe et l'URL de preuve.

CREATE TABLE IF NOT EXISTS public.attribution (
  claim_id       bigint PRIMARY KEY
                 REFERENCES public.leak_claim (id) ON DELETE CASCADE,
  groupe         text        NOT NULL CHECK (btrim(groupe) <> ''),
  code_admiralty text        NOT NULL CHECK (code_admiralty ~ '^[A-F][1-6]$'),
  evidence_url   text,
  auteur         text        NOT NULL CHECK (btrim(auteur) <> ''),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.attribution IS
  'Attribution des revendications : groupe reconnu, code Admiralty et preuve. Une revendication sans preuve reste non attribuée (F6).';
COMMENT ON COLUMN public.attribution.code_admiralty IS
  'Code Admiralty : A-F fiabilité de la source, 1-6 crédibilité de l information. F6 = inconnu.';
COMMENT ON COLUMN public.attribution.auteur IS
  'Rôle ayant posé ou contesté l attribution (systeme:... ou analyste/admin). Jamais une donnée personnelle.';

CREATE INDEX IF NOT EXISTS attribution_code_idx
  ON public.attribution (code_admiralty);

CREATE TABLE IF NOT EXISTS public.attribution_audit (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  claim_id     bigint      NOT NULL,
  operation    text        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  groupe_avant text,
  groupe_apres text,
  code_avant   text,
  code_apres   text,
  preuve_avant text,
  preuve_apres text,
  auteur       text        NOT NULL,
  motif        text,
  horodatage   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attribution_audit_claim_idx
  ON public.attribution_audit (claim_id, horodatage DESC);

COMMENT ON TABLE public.attribution_audit IS
  'Journal inaltérable des changements d attribution : ancien et nouvel état, auteur par rôle et motif de contestation.';

-- Garde-fou « sans preuve = non attribué ». On interroge la revendication, pas
-- seulement la valeur déclarée par l'appelant : une attribution ne peut pas
-- devenir valide en réécrivant son URL de preuve.
CREATE OR REPLACE FUNCTION public.attribution_exige_preuve()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  preuve_source text;
BEGIN
  SELECT c.evidence_url INTO preuve_source
    FROM public.leak_claim c
   WHERE c.id = NEW.claim_id;

  IF preuve_source IS NULL OR btrim(preuve_source) = '' THEN
    IF NEW.groupe <> 'non attribué'
       OR NEW.code_admiralty <> 'F6'
       OR NEW.evidence_url IS NOT NULL THEN
      RAISE EXCEPTION
        'revendication sans preuve : groupe « non attribué », code F6 et preuve NULL obligatoires'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.evidence_url IS NULL OR btrim(NEW.evidence_url) = '' THEN
    RAISE EXCEPTION 'une attribution doit citer la preuve de la revendication'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attribution_exige_preuve ON public.attribution;
CREATE TRIGGER attribution_exige_preuve
  BEFORE INSERT OR UPDATE ON public.attribution
  FOR EACH ROW EXECUTE FUNCTION public.attribution_exige_preuve();

-- Audit : INSERT, UPDATE et DELETE sont conservés. Le motif est posé dans la
-- transaction par `contester_attribution` (set_config local), jamais lu depuis
-- une donnée personnelle.
CREATE OR REPLACE FUNCTION public.attribution_auditer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.attribution_audit
    (claim_id, operation, groupe_avant, groupe_apres,
     code_avant, code_apres, preuve_avant, preuve_apres, auteur, motif)
  VALUES (
    COALESCE(NEW.claim_id, OLD.claim_id),
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.groupe END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.groupe END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.code_admiralty END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.code_admiralty END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.evidence_url END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.evidence_url END,
    COALESCE(NEW.auteur, OLD.auteur, 'systeme'),
    nullif(current_setting('attribution.motif', true), '')
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS attribution_auditer ON public.attribution;
CREATE TRIGGER attribution_auditer
  AFTER INSERT OR UPDATE OR DELETE ON public.attribution
  FOR EACH ROW EXECUTE FUNCTION public.attribution_auditer();

-- Contestabilité : une modification passe toujours par cette fonction, qui
-- valide le code, pose le motif et laisse les triggers vérifier la preuve et
-- écrire l'audit. `p_auteur` est un rôle, pas une identité nominative.
CREATE OR REPLACE FUNCTION public.contester_attribution(
  p_claim_id      bigint,
  p_groupe        text,
  p_code_admiralty text,
  p_auteur        text,
  p_motif         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_code_admiralty IS NULL OR upper(btrim(p_code_admiralty)) !~ '^[A-F][1-6]$' THEN
    RAISE EXCEPTION 'code Admiralty invalide : %', p_code_admiralty USING ERRCODE = '23514';
  END IF;
  IF p_groupe IS NULL OR btrim(p_groupe) = '' THEN
    RAISE EXCEPTION 'groupe vide' USING ERRCODE = '23514';
  END IF;
  IF p_auteur IS NULL OR btrim(p_auteur) = '' THEN
    RAISE EXCEPTION 'auteur vide' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('attribution.motif', coalesce(p_motif, ''), true);

  UPDATE public.attribution a
     SET groupe         = btrim(p_groupe),
         code_admiralty = upper(btrim(p_code_admiralty)),
         auteur         = btrim(p_auteur),
         updated_at     = now()
   WHERE a.claim_id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revendication % sans attribution', p_claim_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.contester_attribution(bigint, text, text, text, text) IS
  'Conteste une attribution : valide le code, journalise l avant/après et le motif. Aucun nom de personne.';

-- Surface de lecture qui remplace le champ groupe libre : valeur par défaut
-- « non attribué » pour toute revendication sans attribution enregistrée.
CREATE OR REPLACE VIEW public.revendication_attribuee AS
  SELECT c.id AS claim_id,
         COALESCE(a.groupe, 'non attribué') AS groupe,
         COALESCE(a.code_admiralty, 'F6') AS code_admiralty,
         a.evidence_url,
         COALESCE(a.auteur, 'systeme:non-attribue') AS auteur,
         a.updated_at
    FROM public.leak_claim c
    LEFT JOIN public.attribution a ON a.claim_id = c.id;

COMMENT ON VIEW public.revendication_attribuee IS
  'Attribution lisible des revendications, sans victime ni indice : non attribué/F6 par défaut.';
