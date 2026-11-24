-- 220 — injection contrôlée : mesurer la détection réelle du pipeline.
--
-- Trente scénarios synthétiques sont injectés en préproduction puis soumis au
-- moteur d'alertes réel (`apps/api/src/detect/engine.ts`). Une ligne par
-- scénario porte le résultat observé, jamais une valeur déclarée :
--
--   SELECT count(*) FILTER (WHERE detected AND latency_s<=60)::float/count(*)
--     FROM injection_eval;                                  -- cible >= 0,90
--   SELECT count(*) FROM injection_eval WHERE control_period AND alerted;
--                                                           -- cible = 0
--
-- `latency_s` est le temps écoulé entre le début de l'injection du scénario
-- (événements écrits) et la première alerte visible en base. Il est mesuré par
-- `scripts/mesure-injection.mts`, rejouable sur une base de préproduction.
--
-- La période de contrôle de 30 jours est mesurée à part, dans
-- `injection_control_eval` : trente jours d'événements bénins, évalués par le
-- même moteur, avec zéro alerte attendue. La garder hors du dénominateur du
-- premier critère évite de mélanger taux de détection et taux de faux positifs.
-- `injection_eval.control_period` reste renseigné à faux pour les trente
-- scénarios actifs : aucun d'eux n'est une observation de contrôle.
--
-- Aucune donnée personnelle : organisations et événements sont fictifs, les
-- URL de preuve pointent vers example.invalid, aucune source nationale n'est
-- présentée comme une source locale.

BEGIN;

CREATE TABLE IF NOT EXISTS injection_eval (
  id             bigserial PRIMARY KEY,
  run_id         text NOT NULL,
  scenario_id    text NOT NULL,
  control_period boolean NOT NULL DEFAULT false,
  family         text NOT NULL,
  rule_expected  text NOT NULL,
  injected_at    timestamptz NOT NULL,
  event_ids      bigint[] NOT NULL,
  alert_ids      integer[] NOT NULL DEFAULT '{}'::integer[],
  detected       boolean NOT NULL DEFAULT false,
  alerted        boolean NOT NULL DEFAULT false,
  latency_s      numeric(10, 3),
  source         text NOT NULL,
  measured_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, scenario_id),
  CONSTRAINT injection_eval_detected_has_latency CHECK (
    NOT detected OR latency_s IS NOT NULL
  ),
  CONSTRAINT injection_eval_latency_nonneg CHECK (
    latency_s IS NULL OR latency_s >= 0
  ),
  CONSTRAINT injection_eval_alerted_consistent CHECK (
    alerted = (cardinality(alert_ids) > 0)
  )
);

COMMENT ON TABLE injection_eval IS
  'Une ligne par scénario injecté en préproduction, avec alerte et latence réellement observées.';
COMMENT ON COLUMN injection_eval.injected_at IS
  'Début de l''injection du scénario (avant écriture des événements), origine de latency_s.';
COMMENT ON COLUMN injection_eval.latency_s IS
  'Secondes entre injected_at et la première alerte visible pour ce scénario.';
COMMENT ON COLUMN injection_eval.detected IS
  'Vrai si au moins une alerte a été observée pour les événements du scénario.';
COMMENT ON COLUMN injection_eval.alerted IS
  'Vrai si une alerte existe ; conservé pour le critère de période de contrôle.';
COMMENT ON COLUMN injection_eval.control_period IS
  'Vrai si la ligne est une observation de la période de contrôle (aucune ici).';

CREATE INDEX IF NOT EXISTS injection_eval_detected_idx
  ON injection_eval (detected, latency_s);

CREATE TABLE IF NOT EXISTS injection_control_eval (
  id             bigserial PRIMARY KEY,
  run_id         text NOT NULL,
  control_day    integer NOT NULL CHECK (control_day BETWEEN 1 AND 30),
  observed_day   date NOT NULL,
  events_injected integer NOT NULL CHECK (events_injected >= 0),
  alerts         integer NOT NULL CHECK (alerts >= 0),
  alerted        boolean NOT NULL DEFAULT false,
  source         text NOT NULL,
  measured_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, control_day),
  CONSTRAINT injection_control_eval_alerted_consistent CHECK (
    alerted = (alerts > 0)
  )
);

COMMENT ON TABLE injection_control_eval IS
  'Trente jours de contrôle : événements bénins injectés puis évalués, aucune alerte attendue.';
COMMENT ON COLUMN injection_control_eval.alerts IS
  'Nombre d''alertes réellement présentes pour les événements bénins de ce jour.';

COMMIT;
