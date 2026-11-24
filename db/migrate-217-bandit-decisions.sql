-- 217 — décisions d'allocation de collecte tracées (bandit) et regret.
--
-- Chaque tirage d'un bras est une décision horodatée : quelle source active a
-- été choisie, avec quelle note du modèle, quel rendement observé et quel
-- écart à l'oracle rétrospectif. Le journal n'est pas réécrit : une décision
-- est immuable, y compris quand le modèle change de paramètres (un nouvel
-- essai porte un autre `run_id`).
--
-- `bandit_run` porte les paramètres de l'essai (graine, fenêtre, lot, prior)
-- et le verdict de l'oracle. `bandit_decision` porte une ligne par décision,
-- avec unicité (run_id, tour) : rejouer la mesure ne duplique pas l'historique.
-- Les identifiants de sources sont publics ; aucune donnée personnelle et
-- aucun secret n'est stocké ici.

BEGIN;

CREATE TABLE IF NOT EXISTS bandit_run (
  run_id            text PRIMARY KEY,
  algorithme        text NOT NULL,
  graine            bigint NOT NULL,
  fenetre_jours     integer NOT NULL CHECK (fenetre_jours > 0),
  nb_decisions      integer NOT NULL CHECK (nb_decisions > 0),
  items_par_decision integer NOT NULL CHECK (items_par_decision > 0),
  prior_pondere     numeric(8,5) NOT NULL CHECK (prior_pondere >= 0),
  taux_reference    numeric(6,5) NOT NULL,
  taux_cible        numeric(6,5) NOT NULL,
  oracle_source_id  text NOT NULL,
  taux_oracle       numeric(8,6) NOT NULL CHECK (taux_oracle > 0 AND taux_oracle <= 1),
  rendement_observe numeric(8,6) NOT NULL CHECK (rendement_observe >= 0 AND rendement_observe <= 1),
  regret_cumule     numeric(10,4) NOT NULL CHECK (regret_cumule >= 0),
  regret_pct        numeric(8,5) NOT NULL CHECK (regret_pct >= 0),
  enregistre_le     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bandit_decision (
  id                bigserial PRIMARY KEY,
  run_id            text NOT NULL REFERENCES bandit_run(run_id) ON DELETE CASCADE,
  tour              integer NOT NULL CHECK (tour > 0),
  source_id         text NOT NULL,
  score_echantillone numeric(8,6) NOT NULL CHECK (score_echantillone >= 0 AND score_echantillone <= 1),
  items_lus         integer NOT NULL CHECK (items_lus > 0),
  evenements_nouveaux integer NOT NULL CHECK (evenements_nouveaux >= 0),
  taux_observe      numeric(8,6) NOT NULL CHECK (taux_observe >= 0 AND taux_observe <= 1),
  taux_oracle       numeric(8,6) NOT NULL CHECK (taux_oracle > 0 AND taux_oracle <= 1),
  regret_attendu    numeric(8,6) NOT NULL CHECK (regret_attendu >= 0),
  regret_cumule     numeric(10,4) NOT NULL CHECK (regret_cumule >= 0),
  posterior_alpha   numeric(10,4) NOT NULL CHECK (posterior_alpha > 0),
  posterior_beta    numeric(10,4) NOT NULL CHECK (posterior_beta > 0),
  enregistre_le     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bandit_decision_unique UNIQUE (run_id, tour),
  CONSTRAINT bandit_decision_comptes CHECK (evenements_nouveaux <= items_lus)
);

CREATE INDEX IF NOT EXISTS bandit_decision_source_idx
  ON bandit_decision (source_id, tour);
CREATE INDEX IF NOT EXISTS bandit_decision_run_tour_idx
  ON bandit_decision (run_id, tour);

COMMENT ON TABLE bandit_run IS
  'Essai reproductible de bandit : paramètres, oracle rétrospectif et verdict agrégé.';
COMMENT ON TABLE bandit_decision IS
  'Trace immuable des allocations de collecte : un tirage, une source, un regret mesuré.';
COMMENT ON COLUMN bandit_decision.regret_attendu IS
  'Écart entre le rendement de l''oracle rétrospectif et celui de la source choisie, sur ce tour.';
COMMENT ON COLUMN bandit_decision.score_echantillone IS
  'Tirage Beta du posterior qui a décidé de ce bras ; la décision est rejouable depuis la graine.';

COMMIT;
