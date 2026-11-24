-- 246 — F11 (schéma neuf) : normalisation des fixtures `zz-fixture-%`.
--
-- `migrate-200-event-premier-rapport.sql` insère 15 lignes de démonstration
-- avec `at` dans le passé (2 à 20 jours) et `valid_at = now()` par défaut.
-- Ces lignes n'existent pas sur la base live (vérification parent). Sur un
-- schéma neuf, la contrainte 245 les exempte pour pouvoir être validée, puis
-- cette migration aligne `valid_at` sur `at` pour ces seules sources.
--
-- Aucune autre source n'est modifiée : les scénarios `bench-%` et
-- `precision-eval-%` gardent volontairement leur inversion mesurée.
-- Comptes avant/après consignés dans `event_temporal_normalisation` (table
-- créée par migrate-243). Rejouable : UPDATE idempotent, INSERT ON CONFLICT.

BEGIN;

DO $$
DECLARE
  v_avant     integer;
  v_modifiees integer;
  v_restantes integer;
BEGIN
  SELECT count(*)::integer
    INTO v_avant
    FROM public.event
   WHERE source_id LIKE 'zz-fixture-%'
     AND at < valid_at - interval '5 seconds';

  UPDATE public.event
     SET valid_at = at
   WHERE source_id LIKE 'zz-fixture-%'
     AND valid_at <> at;
  GET DIAGNOSTICS v_modifiees = ROW_COUNT;

  SELECT count(*)::integer
    INTO v_restantes
    FROM public.event
   WHERE at < valid_at - interval '5 seconds'
     AND source_id NOT LIKE 'bench-%'
     AND source_id NOT LIKE 'precision-eval-%'
     AND source_id NOT LIKE 'zz-fixture-%';

  INSERT INTO public.event_temporal_normalisation
    (migration, famille, motif, avant, modifiees, inversions_restantes, tolerees_ransomware)
  VALUES
    ('migrate-246-fixture-temporal-normalisation.sql', 'zz-fixture',
     'valid_at = now() par défaut > at', v_avant, v_modifiees, v_restantes, 0)
  ON CONFLICT (migration) DO NOTHING;
END
$$;

-- Aligne aussi les bases ayant appliqué l'ancienne définition de 245 : la
-- contrainte finale exempte explicitement les fixtures désormais normalisées.
ALTER TABLE public.event DROP CONSTRAINT IF EXISTS event_at_not_before_valid_at;
ALTER TABLE public.event
  ADD CONSTRAINT event_at_not_before_valid_at
  CHECK (at IS NULL OR valid_at IS NULL
         OR at >= valid_at - interval '5 seconds'
         OR source_id LIKE 'bench-%'
         OR source_id LIKE 'precision-eval-%'
         OR source_id LIKE 'zz-fixture-%')
  NOT VALID;
ALTER TABLE public.event VALIDATE CONSTRAINT event_at_not_before_valid_at;

COMMENT ON TABLE public.event_temporal_normalisation IS
  'F11 : comptes avant/après des normalisations cti +1 h (243) et zz-fixture (246), avec le reste toléré ransomware.';

COMMIT;
