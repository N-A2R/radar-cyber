-- 211 — évaluation de la décroissance du risque avec l'âge des faits.
--
-- Le score de risque historique additionne tous les faits à poids égal. Un
-- incident de six mois pèse donc autant qu'un signal de la veille. Ce chantier
-- compare deux modèles sur le même découpage temporel :
--
--   * `risk_static` : somme brute des faits observés avant `asOf` ;
--   * `risk_decay`  : même somme, chaque fait multiplié par 0,5^(âge / demi-vie).
--
-- Le critère de sortie se lit directement :
--   SELECT d.c_index - s.c_index
--     FROM model_eval d, model_eval s
--    WHERE d.model = 'risk_decay'
--      AND s.model = 'risk_static'
--      AND d.horizon_days = s.horizon_days;   -- cible >= 0,05
--
-- `model_eval` portait jusqu'ici un backtest par famille et par jour (modèle
-- STL). Les lignes de risque sont des résumés par horizon : une seule ligne
-- par modèle et par horizon, `family = '__overall__'`, `eval_day = asOf`.
-- `c_index` est la concordance de Harrell pour une issue binaire (équivalent
-- à l'AUC), `horizon_days` la fenêtre d'issue après `asOf`.
--
-- Aucune donnée personnelle, aucune organisation, aucune source réelle : le
-- benchmark est entièrement synthétique (`apps/api/src/risk/decay-benchmark.ts`).

BEGIN;

ALTER TABLE model_eval ADD COLUMN IF NOT EXISTS c_index double precision;
ALTER TABLE model_eval ADD COLUMN IF NOT EXISTS horizon_days integer;

COMMENT ON COLUMN model_eval.c_index IS
  'Concordance de Harrell (0–1) pour les lignes de synthèse risk_static/risk_decay ; NULL pour le backtest STL.';
COMMENT ON COLUMN model_eval.horizon_days IS
  'Fenêtre d''issue après eval_day pour les lignes de risque ; NULL pour le backtest STL.';

ALTER TABLE model_eval DROP CONSTRAINT IF EXISTS model_eval_c_index_range;
ALTER TABLE model_eval ADD CONSTRAINT model_eval_c_index_range
  CHECK (c_index IS NULL OR (c_index >= 0 AND c_index <= 1));

ALTER TABLE model_eval DROP CONSTRAINT IF EXISTS model_eval_horizon_positive;
ALTER TABLE model_eval ADD CONSTRAINT model_eval_horizon_positive
  CHECK (horizon_days IS NULL OR horizon_days > 0);

-- Les lignes de risque sont des résumés : sans c_index ni horizon, le critère
-- serait indéchiffrable. La contrainte empêche une insertion partielle.
ALTER TABLE model_eval DROP CONSTRAINT IF EXISTS model_eval_risk_has_metrics;
ALTER TABLE model_eval ADD CONSTRAINT model_eval_risk_has_metrics
  CHECK (
    model NOT IN ('risk_decay', 'risk_static')
    OR (c_index IS NOT NULL AND horizon_days IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS risk_model_metric (
  model           text NOT NULL,
  horizon_days    integer NOT NULL CHECK (horizon_days > 0),
  n_entities      integer NOT NULL CHECK (n_entities > 0),
  n_positives     integer NOT NULL CHECK (n_positives > 0),
  n_negatives     integer NOT NULL CHECK (n_negatives > 0),
  n_facts         integer NOT NULL CHECK (n_facts > 0),
  c_index         double precision NOT NULL CHECK (c_index >= 0 AND c_index <= 1),
  pairs           integer NOT NULL CHECK (pairs > 0),
  half_life_days  double precision CHECK (half_life_days IS NULL OR half_life_days > 0),
  source          text NOT NULL,
  measured_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, horizon_days),
  CONSTRAINT risk_model_metric_positives_bounded CHECK (n_positives < n_entities),
  CONSTRAINT risk_model_metric_half_life CHECK (
    (model = 'risk_static' AND half_life_days IS NULL)
    OR (model = 'risk_decay' AND half_life_days IS NOT NULL)
  )
);

COMMENT ON TABLE risk_model_metric IS
  'Détail auditable des deux modèles de risque : entités, positifs, faits, concordance.';
COMMENT ON COLUMN risk_model_metric.c_index IS
  'Concordance de Harrell sur la même population et le même découpage pour les deux modèles.';
COMMENT ON COLUMN risk_model_metric.half_life_days IS
  'Demi-vie de la décroissance pour risk_decay ; NULL pour le modèle statique.';

CREATE INDEX IF NOT EXISTS risk_model_metric_c_index_idx
  ON risk_model_metric (horizon_days, c_index DESC);

COMMIT;
