-- 200 : périmètre public TLP:CLEAR — liste blanche d'export et garde-fous.
--
-- Un événement n'entre dans `export_public_event` que si sa diffusion est
-- publique : colonne `event.tlp` (migration 014b) dans la famille CLEAR, et
-- déclaration `event.evidence->>'tlp'` exactement `CLEAR` (ou absente, défaut
-- public). La table est la liste blanche que les exports et l'API publique
-- consultent, sans avoir à redécouvrir le filtre TLP.
--
-- Le contrôle de sortie officiel est
--   SELECT count(*) FROM event e JOIN export_public_event x ON x.event_id=e.id
--    WHERE coalesce(e.evidence->>'tlp','CLEAR') <> 'CLEAR';
-- il doit valoir 0. On ne peut donc pas se contenter d'interpréter les alias :
-- la déclaration JSON est ramenée à la forme canonique (TLP:CLEAR, WHITE et
-- tlp:white deviennent CLEAR) pour que la comparaison exacte du contrôle soit
-- aussi la règle d'admission. Toute autre valeur — AMBER, GREEN, RED, ORANGE,
-- casse ou préfixe quelconque — reste restreinte.
--
-- `indicator.tlp` n'est pas concerné par cette table : le filtre des
-- indicateurs vit dans le prédicat applicatif `security/tlp.ts`, qui accepte
-- `WHITE` (alias historique de CLEAR, migration 002) et refuse le reste.

CREATE TABLE IF NOT EXISTS public.export_public_event (
  event_id    bigint PRIMARY KEY REFERENCES public.event(id) ON DELETE CASCADE,
  exported_at timestamptz NOT NULL DEFAULT now(),
  tlp         text NOT NULL DEFAULT 'CLEAR' CHECK (tlp = 'CLEAR')
);

-- Forme canonique d'une déclaration TLP : majuscules, préfixe retiré, et la
-- famille « libre » ramenée à CLEAR (WHITE est son alias historique).
CREATE OR REPLACE FUNCTION public.tlp_canonical(raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN upper(btrim(raw)) LIKE 'TLP:%' THEN substr(upper(btrim(raw)), 5)
    ELSE upper(btrim(raw))
  END
$$;

-- Un événement est publiable si les deux sources de vérité le disent :
-- colonne dans la famille CLEAR, et déclaration JSON exactement CLEAR.
CREATE OR REPLACE FUNCTION public.tlp_public_clear(ev jsonb, ev_tlp text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(ev->>'tlp', 'CLEAR') = 'CLEAR'
     AND coalesce(public.tlp_canonical(ev_tlp), 'CLEAR') IN ('CLEAR', 'WHITE')
$$;

-- Refus explicite : même un appelant qui écrit directement dans la table
-- d'export ne peut pas y glisser un événement restreint.
CREATE OR REPLACE FUNCTION public.export_public_event_tlp_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_evidence jsonb;
  v_tlp      text;
BEGIN
  SELECT e.evidence, e.tlp INTO v_evidence, v_tlp
    FROM public.event e WHERE e.id = NEW.event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'export public : événement % introuvable', NEW.event_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT public.tlp_public_clear(v_evidence, v_tlp) THEN
    RAISE EXCEPTION 'export public refusé : événement % n''est pas TLP:CLEAR', NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.tlp := 'CLEAR';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS export_public_event_tlp_gate ON public.export_public_event;
CREATE TRIGGER export_public_event_tlp_gate
  BEFORE INSERT OR UPDATE ON public.export_public_event
  FOR EACH ROW EXECUTE FUNCTION public.export_public_event_tlp_gate();

-- La déclaration JSON est canonisée à l'écriture, puis recopiée dans la
-- colonne quand celle-ci n'a pas déjà été durcie (par exemple RED à la
-- promotion de quarantaine). Une déclaration restreinte ne peut donc pas être
-- compensée par une colonne restée à sa valeur par défaut.
CREATE OR REPLACE FUNCTION public.event_public_tlp_normalize()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_declared text;
  v_canon    text;
BEGIN
  IF NEW.evidence ? 'tlp' THEN
    v_declared := NEW.evidence->>'tlp';
    v_canon := public.tlp_canonical(v_declared);
    IF v_canon = 'WHITE' THEN v_canon := 'CLEAR'; END IF;
    IF v_canon IS DISTINCT FROM v_declared THEN
      NEW.evidence := jsonb_set(NEW.evidence, '{tlp}', to_jsonb(v_canon), true);
    END IF;
    IF v_canon <> '' AND public.tlp_canonical(NEW.tlp) IN ('CLEAR', 'WHITE') THEN
      NEW.tlp := v_canon;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS event_public_tlp_normalize ON public.event;
CREATE TRIGGER event_public_tlp_normalize
  BEFORE INSERT OR UPDATE OF evidence, tlp ON public.event
  FOR EACH ROW EXECUTE FUNCTION public.event_public_tlp_normalize();

-- Publication / révocation atomique de la liste blanche.
CREATE OR REPLACE FUNCTION public.event_public_tlp_export_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.tlp_public_clear(NEW.evidence, NEW.tlp) THEN
    INSERT INTO public.export_public_event (event_id) VALUES (NEW.id)
      ON CONFLICT (event_id) DO NOTHING;
  ELSE
    DELETE FROM public.export_public_event WHERE event_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS event_public_tlp_export_sync ON public.event;
CREATE TRIGGER event_public_tlp_export_sync
  AFTER INSERT OR UPDATE OF evidence, tlp ON public.event
  FOR EACH ROW EXECUTE FUNCTION public.event_public_tlp_export_sync();

-- Reprise d'une base existante : canonise les déclarations JSON déjà écrites
-- (les triggers ci-dessus durcissent ensuite la colonne et synchronisent la
-- liste blanche), puis reconstruit complètement cette liste.
UPDATE public.event
   SET evidence = jsonb_set(
         evidence,
         '{tlp}',
         to_jsonb(public.tlp_canonical(evidence->>'tlp')),
         true
       )
 WHERE evidence ? 'tlp'
   AND evidence->>'tlp' IS DISTINCT FROM public.tlp_canonical(evidence->>'tlp');

CREATE OR REPLACE FUNCTION public.refresh_export_public_event()
RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.export_public_event x
   USING public.event e
   WHERE e.id = x.event_id
     AND NOT public.tlp_public_clear(e.evidence, e.tlp);

  INSERT INTO public.export_public_event (event_id)
  SELECT e.id FROM public.event e
   WHERE public.tlp_public_clear(e.evidence, e.tlp)
  ON CONFLICT (event_id) DO NOTHING;

  RETURN (SELECT count(*)::int FROM public.export_public_event);
END $$;

SELECT public.refresh_export_public_event();
