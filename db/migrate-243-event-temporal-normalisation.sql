-- 243 — F11 : normalisation des inversions `cti` historiques.
--
-- Le relevé de l'audit compte 218 événements `cti` avec
-- `valid_at = at + interval '1 hour'` exactement, et 153 `ransomware` dont
-- l'écart est de l'ordre de la seconde (toléré par le check NOT VALID ajouté
-- en 242). Le +1 h constant n'est pas une règle active : aucun writer actuel
-- ne le produit (voir docs/database-residual.md).
--
-- Cette migration cible UNIQUEMENT le motif exact, famille `cti` :
--   UPDATE event SET valid_at = at WHERE family='cti' AND valid_at=at+1h.
-- Les lignes `ransomware` ne sont pas touchées. Les comptes avant/après et le
-- nombre de lignes tolérées sont consignés dans une table d'audit dédiée.
-- La contrainte 242 n'est validée que si aucune inversion > 2 s ne subsiste ;
-- sinon elle reste NOT VALID et un WARNING indique le nombre restant.
--
-- Rejouable : UPDATE idempotent, insertion ON CONFLICT DO NOTHING, VALIDATE
-- sans effet si la contrainte est déjà validée.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_temporal_normalisation (
  migration           text        PRIMARY KEY,
  famille             text        NOT NULL,
  motif               text        NOT NULL,
  avant               integer     NOT NULL,
  modifiees           integer     NOT NULL,
  inversions_restantes integer    NOT NULL,
  tolerees_ransomware integer     NOT NULL,
  applique_le         timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  v_avant            integer;
  v_modifiees        integer;
  v_restantes        integer;
  v_tolerees         integer;
  v_contrainte_existe boolean;
BEGIN
  SELECT count(*) FILTER (WHERE family = 'cti' AND valid_at = at + interval '1 hour'),
         count(*) FILTER (WHERE family = 'ransomware'
                             AND at < valid_at
                             AND at >= valid_at - interval '2 seconds')
    INTO v_avant, v_tolerees
    FROM public.event;

  UPDATE public.event
     SET valid_at = at
   WHERE family = 'cti'
     AND valid_at = at + interval '1 hour';
  GET DIAGNOSTICS v_modifiees = ROW_COUNT;

  SELECT count(*)::integer
    INTO v_restantes
    FROM public.event
   WHERE at IS NOT NULL
     AND valid_at IS NOT NULL
     AND at < valid_at - interval '2 seconds';

  INSERT INTO public.event_temporal_normalisation
    (migration, famille, motif, avant, modifiees, inversions_restantes, tolerees_ransomware)
  VALUES
    ('migrate-243-event-temporal-normalisation.sql', 'cti',
     'valid_at = at + 1 hour', v_avant, v_modifiees, v_restantes, v_tolerees)
  ON CONFLICT (migration) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event'::regclass
       AND conname = 'event_at_not_before_valid_at'
  ) INTO v_contrainte_existe;

  IF v_contrainte_existe AND v_restantes = 0 THEN
    EXECUTE 'ALTER TABLE public.event VALIDATE CONSTRAINT event_at_not_before_valid_at';
  ELSE
    RAISE WARNING 'F11 : % inversion(s) > 2 s subsistent, contrainte 242 laissée NOT VALID', v_restantes;
  END IF;
END
$$;

COMMENT ON TABLE public.event_temporal_normalisation IS
  'F11 : comptes avant/après de la normalisation cti +1 h et du reste toléré ransomware (migration 243).';

COMMIT;
