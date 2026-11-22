-- 210 : le gabarit anglais de la voie na-gap est traduit à l'écriture.
--
-- Les revendications `na-gap` ne viennent pas d'un collecteur du dépôt : une
-- voie d'ingestion externe écrit directement dans `event`, avec un titre au
-- gabarit anglais (« Third-party ransomware claim referencing a Nouvelle-
-- Aquitaine organization (department 16) »). La migration 204 a corrigé les
-- lignes déjà présentes ; ce trigger couvre les suivantes, quel que soit
-- l'écrivain — y compris un INSERT SQL venu de l'extérieur, que le code de
-- l'API ne peut pas intercepter.
--
-- Portée volontairement étroite : uniquement les lignes dont la clé de
-- dédoublonnage est `na-%-gap:%` ET dont le titre commence par le gabarit
-- exact. Les vrais titres anglais des sources (NVD, RansomLook, Telegram)
-- restent intacts — on ne traduit pas une donnée, on normalise un gabarit.

BEGIN;

CREATE OR REPLACE FUNCTION public.event_na_gap_titre_fr()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.dedup_key LIKE 'na-%-gap:%'
     AND NEW.title LIKE 'Third-party ransomware claim %(department %' THEN
    NEW.title := replace(
      NEW.title,
      'Third-party ransomware claim referencing a Nouvelle-Aquitaine organization (department ',
      'Revendication de rançongiciel par un tiers visant une organisation de Nouvelle-Aquitaine (département '
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_na_gap_titre_fr ON public.event;
CREATE TRIGGER event_na_gap_titre_fr
  BEFORE INSERT OR UPDATE OF title ON public.event
  FOR EACH ROW EXECUTE FUNCTION public.event_na_gap_titre_fr();

COMMIT;
