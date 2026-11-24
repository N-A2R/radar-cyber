-- 217 — fenêtre de publication d'un incident déjà survenu.
--
-- Le radar voit parfois un incident avant sa première mention publique. Le
-- chantier demande une fenêtre de dates émise *avant* cette mention, avec un
-- résultat mesurable :
--
--   SELECT count(*) FROM disclosure_forecast
--    WHERE issued_at < first_public_at
--      AND first_public_at BETWEEN window_start AND window_end;
--
-- `disclosure_observation` porte la vérité terrain datée des corpora
-- versionnés : date de survenue et date de première mention publique. Aucune
-- organisation, aucun titre, aucune donnée personnelle : seulement des identifiants
-- de corpus, deux dates et le chemin du jeu de données.
--
-- La règle est volontairement pauvre et reproductible (vérifiable sans réseau) :
--   * émission à J+23 h UTC le jour de la survenue, donc avant toute mention
--     publique datée du lendemain ; les cas publiés le jour même sont exclus,
--     la granularité en jours ne permettant pas d'y prouver l'antériorité ;
--   * horizon = 75e percentile des délais de publication *déjà observés à la
--     date d'émission* (jamais du cas lui-même), plancher 7 jours, et 21 jours
--     tant que moins de 8 cas antérieurs sont connus ;
--   * `first_public_at` est l'étiquette de résolution, connue après coup,
--     jamais utilisée pour choisir la fenêtre.
--
-- Le calcul est une fonction SQL unique : le producteur TypeScript et le
-- rapport appellent cette même fonction, il n'existe pas de second modèle.

BEGIN;

CREATE TABLE IF NOT EXISTS public.disclosure_observation (
  incident_id     text PRIMARY KEY,
  occurred_at     timestamptz NOT NULL,
  first_public_at timestamptz NOT NULL,
  source_dataset  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disclosure_observation_order CHECK (occurred_at <= first_public_at)
);

COMMENT ON TABLE public.disclosure_observation IS
  'Vérité terrain datée des corpora versionnés : survenue et première mention publique, sans contenu d''incident.';
COMMENT ON COLUMN public.disclosure_observation.source_dataset IS
  'Chemin du corpus versionné d''origine ; aucune source nationale n''est présentée comme locale.';

CREATE TABLE IF NOT EXISTS public.disclosure_forecast (
  id              bigserial PRIMARY KEY,
  incident_id     text NOT NULL REFERENCES public.disclosure_observation(incident_id) ON DELETE CASCADE,
  issued_at       timestamptz NOT NULL,
  window_start    timestamptz NOT NULL,
  window_end      timestamptz NOT NULL,
  first_public_at timestamptz,
  horizon_days    integer NOT NULL CHECK (horizon_days > 0),
  model           text NOT NULL,
  source_dataset  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  measured_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disclosure_forecast_window CHECK (issued_at <= window_start AND window_start < window_end),
  CONSTRAINT disclosure_forecast_label CHECK (first_public_at IS NULL OR first_public_at >= issued_at),
  CONSTRAINT disclosure_forecast_unique UNIQUE (incident_id, model, issued_at)
);

COMMENT ON TABLE public.disclosure_forecast IS
  'Fenêtres de publication émises avant la première mention publique ; first_public_at est renseigné à la résolution.';
COMMENT ON COLUMN public.disclosure_forecast.first_public_at IS
  'Date de première mention publique observée ensuite ; NULL tant que l''incident n''est pas résolu.';
COMMENT ON COLUMN public.disclosure_forecast.model IS
  'Règle versionnée ayant produit la fenêtre, sans aucun appel à une donnée postérieure à issued_at.';

CREATE INDEX IF NOT EXISTS disclosure_forecast_resolution_idx
  ON public.disclosure_forecast (issued_at, first_public_at)
  WHERE first_public_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.emit_disclosure_forecast(
  p_model text DEFAULT 'disclosure-window-quantile@1'
) RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  inserted integer;
BEGIN
  WITH eligible AS (
    SELECT o.*, o.occurred_at + interval '23 hours' AS issued_at
      FROM public.disclosure_observation o
     -- Les publications le jour même ne peuvent pas être datées avec assez de
     -- précision pour prouver issued_at < first_public_at : on ne les émet pas.
     WHERE o.occurred_at + interval '23 hours' < o.first_public_at
  ), calibration AS (
    SELECT e.*,
           (SELECT percentile_cont(0.75) WITHIN GROUP (
                      ORDER BY extract(epoch FROM (h.first_public_at - h.occurred_at)) / 86400.0)
              FROM public.disclosure_observation h
             WHERE h.first_public_at < e.issued_at) AS prior_q75_days
      FROM eligible e
  ), windows AS (
    SELECT c.*,
           greatest(7, ceil(coalesce(c.prior_q75_days, 21)))::integer AS horizon_days
      FROM calibration c
  )
  INSERT INTO public.disclosure_forecast
    (incident_id, issued_at, window_start, window_end, first_public_at,
     horizon_days, model, source_dataset)
  SELECT w.incident_id,
         w.issued_at,
         w.issued_at,
         w.issued_at + make_interval(days => w.horizon_days),
         w.first_public_at,
         w.horizon_days,
         p_model,
         w.source_dataset
    FROM windows w
  ON CONFLICT (incident_id, model, issued_at) DO UPDATE SET
    window_end = EXCLUDED.window_end,
    first_public_at = EXCLUDED.first_public_at,
    horizon_days = EXCLUDED.horizon_days,
    source_dataset = EXCLUDED.source_dataset,
    measured_at = now();

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

COMMENT ON FUNCTION public.emit_disclosure_forecast(text) IS
  'Émet (ou recalcule) une fenêtre par observation éligible ; aucune donnée postérieure à issued_at n''est lue pour le choix de l''horizon.';

COMMIT;
