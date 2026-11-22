-- 206 : backtest STL des pics de volume par famille.
--
-- Le détecteur décompose la série quotidienne `count(*) FROM event GROUP BY
-- family, date(observed_at)` en saison hebdomadaire, tendance et reste, puis
-- note chaque jour par un z robuste du reste. Un pic est une valeur du reste
-- hors de l'échelle de la fenêtre, pas un compte brut élevé : une famille à
-- 200 faits/jour et une famille à 2 faits/jour sont comparables.
--
-- `model_eval` matérialise le backtest : une ligne par pic annoté et par
-- fausse alerte au-dessus du seuil. Les négatifs sous le seuil sont omis ;
-- c'est sans effet sur l'average precision, car ils sont tous moins bien
-- classés que les lignes présentes. `tp` signifie « alerte partie au plus
-- tard un jour après le pic » ; `detected_on` est le lendemain du jour où le
-- score a franchi le seuil (passage quotidien).
--
-- La mesure livrée porte sur une fixture versionnée de 180 jours
-- (`bench/stl/serie-180j.json`) : la base de travail ne contient que quelques
-- jours de collecte fraîche, l'historique étant majoritairement du rattrapage.
-- Aucun fait réel, aucune organisation, aucune donnée personnelle n'y figure.
-- La fixture est rejouable par `scripts/mesure-stl-pics.mts` et le critère
-- est vérifiable par `scripts/verifie-stl-pics.mts`.

BEGIN;

-- Une table `model_eval` d'un autre chantier (Brier/ECE) peut exister dans une
-- base de travail. Elle est renommée, jamais supprimée : ses données restent
-- lisibles sous `model_eval_legacy`, et le critère STL obtient son schéma.
DO $$
BEGIN
  IF to_regclass('public.model_eval') IS NOT NULL
     AND to_regclass('public.model_eval_legacy') IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_eval'
          AND column_name = 'delay_days'
     )
  THEN
    ALTER TABLE public.model_eval RENAME TO model_eval_legacy;
    IF to_regclass('public.model_eval_pkey') IS NOT NULL THEN
      ALTER INDEX public.model_eval_pkey RENAME TO model_eval_legacy_pkey;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS peak_annotation (
  id          bigserial PRIMARY KEY,
  model       text NOT NULL DEFAULT 'stl',
  family      text NOT NULL,
  peak_day    date NOT NULL,
  volume      integer NOT NULL CHECK (volume >= 0),
  source      text NOT NULL,
  rationale   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family, peak_day)
);

COMMENT ON TABLE peak_annotation IS
  'Pics de volume annotés qui servent de vérité terrain au backtest STL.';
COMMENT ON COLUMN peak_annotation.volume IS
  'Compte du jour dans la série au moment de l''annotation.';

CREATE TABLE IF NOT EXISTS model_eval (
  id            bigserial PRIMARY KEY,
  model         text NOT NULL,
  family        text NOT NULL,
  eval_day      date NOT NULL,
  score         double precision NOT NULL CHECK (score >= 0),
  label         boolean NOT NULL,
  tp            boolean NOT NULL DEFAULT false,
  detected_on   date,
  delay_days    integer CHECK (delay_days IS NULL OR delay_days >= 0),
  window_days   integer NOT NULL DEFAULT 180 CHECK (window_days > 0),
  source        text NOT NULL,
  measured_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model, family, eval_day),
  CONSTRAINT model_eval_tp_is_label CHECK (NOT tp OR label),
  CONSTRAINT model_eval_tp_has_delay CHECK (
    NOT tp OR (detected_on IS NOT NULL AND delay_days IS NOT NULL)
  ),
  CONSTRAINT model_eval_delay_only_for_tp CHECK (tp OR delay_days IS NULL)
);

COMMENT ON TABLE model_eval IS
  'Backtest par famille et par jour : score STL, étiquette annotée, tp et délai.';
COMMENT ON COLUMN model_eval.tp IS
  'Vrai positif : pic annoté détecté au plus tard un jour après le pic.';
COMMENT ON COLUMN model_eval.delay_days IS
  'detected_on − eval_day pour un tp ; NULL sinon.';

CREATE INDEX IF NOT EXISTS model_eval_tp_idx
  ON model_eval (model, tp) INCLUDE (delay_days);
CREATE INDEX IF NOT EXISTS model_eval_rank_idx
  ON model_eval (model, score DESC);

CREATE TABLE IF NOT EXISTS model_metric (
  model                 text NOT NULL,
  window_days           integer NOT NULL CHECK (window_days > 0),
  pr_auc                double precision NOT NULL CHECK (pr_auc >= 0 AND pr_auc <= 1),
  pr_auc_trapezoid      double precision NOT NULL CHECK (pr_auc_trapezoid >= 0 AND pr_auc_trapezoid <= 1),
  annotated_peaks       integer NOT NULL CHECK (annotated_peaks > 0),
  detected_peaks        integer NOT NULL CHECK (detected_peaks >= 0),
  false_positives       integer NOT NULL CHECK (false_positives >= 0),
  median_delay_days     double precision,
  average_delay_days    double precision,
  source                text NOT NULL,
  measured_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, window_days),
  CONSTRAINT model_metric_detected_bounded CHECK (detected_peaks <= annotated_peaks)
);

COMMENT ON TABLE model_metric IS
  'Résumé du backtest STL : PR-AUC, pics détectés, délais médian et moyen.';

COMMIT;
