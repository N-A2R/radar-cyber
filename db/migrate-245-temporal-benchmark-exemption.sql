-- 245 — F11 (correction live) : invariants des jeux de mesure.
--
-- La vérification sur la base live montre 307 inversions `at < valid_at`
-- qui ne sont pas des incidents : 198 `cti` issues de sources
-- `precision-eval-*` (2 à 20 h, scénarios de calibration) et 108 `ransomware`
-- issues de sources `bench-*` (jusqu'à 192 jours, cas de mesure). Le dernier
-- cas est un écart d'horloge réel de 3,280262 s sur `ransomlook`.
--
-- La contrainte 242 (2 s, sans exemption) est donc remplacée par le même
-- invariant avec :
--   * tolérance portée à 5 s pour couvrir la dérive d'horloge réelle ;
--   * exemption explicite des sources `bench-%`, `precision-eval-%` et
--     `zz-fixture-%` (jeux de démonstration de migrate-200, dont `at` est
--     dans le passé et `valid_at` vaut `now()` par défaut).
-- Les lignes de benchmark ne sont PAS normalisées : leur inversion est le
-- scénario mesuré. Les lignes `zz-fixture-%` sont normalisées séparément par
-- migrate-246 ; l'exemption permet à 245 de se valider sur un schéma neuf.
--
-- Rejouable : si la contrainte porte déjà la nouvelle définition et est
-- validée, la migration ne fait rien. Sinon elle est remplacée puis validée.

BEGIN;

DO $$
DECLARE
  v_deja_courante boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.event'::regclass
       AND conname = 'event_at_not_before_valid_at'
       AND convalidated
       AND pg_get_constraintdef(oid) LIKE '%5 seconds%'
       AND pg_get_constraintdef(oid) LIKE '%precision-eval-%'
       AND pg_get_constraintdef(oid) LIKE '%zz-fixture-%'
  ) INTO v_deja_courante;

  IF NOT v_deja_courante THEN
    ALTER TABLE public.event
      DROP CONSTRAINT IF EXISTS event_at_not_before_valid_at;

    ALTER TABLE public.event
      ADD CONSTRAINT event_at_not_before_valid_at
      CHECK (
        at IS NULL
        OR valid_at IS NULL
        OR at >= valid_at - interval '5 seconds'
        OR source_id LIKE 'bench-%'
        OR source_id LIKE 'precision-eval-%'
        OR source_id LIKE 'zz-fixture-%'
      )
      NOT VALID;

    ALTER TABLE public.event
      VALIDATE CONSTRAINT event_at_not_before_valid_at;
  END IF;
END
$$;

COMMENT ON CONSTRAINT event_at_not_before_valid_at ON public.event IS
  'F11 : at >= valid_at - 5 s pour les données réelles (dérive d''horloge ransomlook) ; bench-%, precision-eval-% et zz-fixture-% sont exemptées (jeux de mesure/démonstration). Remplace la contrainte 2 s de migrate-242.';

COMMIT;
