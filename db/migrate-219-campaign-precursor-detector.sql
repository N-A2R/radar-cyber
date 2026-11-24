-- 219 — signal précurseur de campagne avant la première alerte.
--
-- Le critère du chantier lit directement la table détaillée :
--
--   SELECT count(*) FILTER (WHERE lead_days >= 14)::float / count(*)
--     FROM campaign_precursor_eval;
--
-- Une ligne par campagne évaluée (campagne ayant au moins une alerte sur un
-- incident), avec l'horodatage du précurseur retenu et l'avance en jours.
-- `campaign_precursor_signal` conserve les pics de revendications détectés,
-- `campaign_precursor_metric` porte le résumé (taux, faux positifs par mois).
--
-- Aucune donnée personnelle : seules des agrégations journalières de
-- revendications publiques (nombre, nombre de sites) et des dates de campagnes.
-- Les tables sont créées de façon idempotente : une base déjà migrée garde ses
-- données et ses contraintes.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_precursor_signal (
  id                bigserial PRIMARY KEY,
  model             text NOT NULL,
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz NOT NULL,
  claims            integer NOT NULL CHECK (claims > 0),
  sources           integer NOT NULL CHECK (sources > 0),
  matched_campaigns integer NOT NULL DEFAULT 0 CHECK (matched_campaigns >= 0),
  false_positive    boolean NOT NULL DEFAULT false,
  source            text NOT NULL,
  measured_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_precursor_signal_model_started_at_key UNIQUE (model, started_at),
  CONSTRAINT campaign_precursor_signal_fp_check
    CHECK ((NOT false_positive) OR matched_campaigns = 0)
);

COMMENT ON TABLE campaign_precursor_signal IS
  'Pics de revendications détectés avant les campagnes : une ligne par pic et par modèle.';
COMMENT ON COLUMN campaign_precursor_signal.started_at IS
  'Jour UTC du pic (minuit UTC) ; aucune donnée postérieure au pic n''entre dans le calcul.';
COMMENT ON COLUMN campaign_precursor_signal.ended_at IS
  'Fin de la fenêtre d''appariement (started_at + horizon maximal).';
COMMENT ON COLUMN campaign_precursor_signal.claims IS
  'Revendications publiées le jour du pic, tous groupes confondus.';
COMMENT ON COLUMN campaign_precursor_signal.sources IS
  'Sites distincts ayant publié une revendication le jour du pic.';

CREATE TABLE IF NOT EXISTS campaign_precursor_eval (
  id             bigserial PRIMARY KEY,
  model          text NOT NULL,
  campaign_key   text NOT NULL,
  label          text NOT NULL,
  first_alert_at timestamptz NOT NULL,
  precursor_at   timestamptz,
  lead_days      integer,
  signal_claims  integer NOT NULL CHECK (signal_claims > 0),
  signal_sources integer NOT NULL CHECK (signal_sources > 0),
  source         text NOT NULL,
  measured_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_precursor_eval_model_campaign_key_key UNIQUE (model, campaign_key),
  CONSTRAINT campaign_precursor_eval_precursor_check
    CHECK ((precursor_at IS NULL) = (lead_days IS NULL)),
  CONSTRAINT campaign_precursor_eval_lead_check CHECK (lead_days IS NULL OR lead_days > 0)
);

COMMENT ON TABLE campaign_precursor_eval IS
  'Évaluation du précurseur : une ligne par campagne évaluée et par modèle.';
COMMENT ON COLUMN campaign_precursor_eval.first_alert_at IS
  'Première alerte créée sur un incident de la campagne (min de alert.created_at).';
COMMENT ON COLUMN campaign_precursor_eval.precursor_at IS
  'Dernier pic détecté au moins 14 jours et au plus 60 jours avant la première alerte.';
COMMENT ON COLUMN campaign_precursor_eval.lead_days IS
  'Nombre entier de jours entre le précurseur et la première alerte.';

CREATE TABLE IF NOT EXISTS campaign_precursor_metric (
  model                    text PRIMARY KEY,
  evaluated_campaigns      integer NOT NULL CHECK (evaluated_campaigns > 0),
  early_campaigns          integer NOT NULL CHECK (early_campaigns >= 0),
  detection_rate           double precision NOT NULL
                             CHECK (detection_rate >= 0 AND detection_rate <= 1),
  false_positives          integer NOT NULL CHECK (false_positives >= 0),
  evaluated_months         integer NOT NULL CHECK (evaluated_months > 0),
  false_positives_per_month double precision NOT NULL CHECK (false_positives_per_month >= 0),
  lookback_days            integer NOT NULL CHECK (lookback_days > 0),
  min_claims               integer NOT NULL CHECK (min_claims > 0),
  min_sources              integer NOT NULL CHECK (min_sources > 0),
  min_lead_days            integer NOT NULL CHECK (min_lead_days > 0),
  max_lead_days            integer NOT NULL CHECK (max_lead_days > 0),
  cooldown_days            integer NOT NULL CHECK (cooldown_days > 0),
  source                   text NOT NULL,
  measured_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_precursor_metric_early_check
    CHECK (early_campaigns <= evaluated_campaigns),
  CONSTRAINT campaign_precursor_metric_check CHECK (max_lead_days >= min_lead_days)
);

COMMENT ON TABLE campaign_precursor_metric IS
  'Résumé d''une mesure de précurseur : taux de détection et faux positifs par mois.';

CREATE INDEX IF NOT EXISTS campaign_precursor_eval_model_lead_idx
  ON campaign_precursor_eval (model, lead_days);
CREATE INDEX IF NOT EXISTS campaign_precursor_signal_model_started_idx
  ON campaign_precursor_signal (model, started_at);

COMMIT;
