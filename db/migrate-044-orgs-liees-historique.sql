-- 044 — Historique quotidien des compteurs « organisations reliées ».
--
-- Le chiffre affiché par la carte Aujourd'hui est une mesure instantanée : on
-- ne peut pas dire s'il monte. Cette table conserve un relevé par jour des
-- quatre compteurs déjà exposés par GET /api/orgs/liees (jamais de nouvelle
-- règle de comptage) :
--   semaine    : count(DISTINCT org_id) sur event sur 7 jours ;
--   total      : quarantine_raw WHERE promoted=true ;
--   en_attente : la predicate pending exacte de GET /review/stats ;
--   examinees  : sujets distincts de journal WHERE kind='review.decided'.
--
-- La fonction est idempotente : un second relevé le même jour remplace les
-- valeurs (upsert), il n'y a donc jamais deux points pour un même jour.
-- Le serveur l'appelle au démarrage puis une fois par jour ; un premier point
-- peut aussi être écrit à la main avec `SELECT enregistrer_orgs_liees();`.

CREATE TABLE IF NOT EXISTS orgs_liees_historique (
  jour       date PRIMARY KEY,
  semaine    integer NOT NULL,
  total      integer NOT NULL,
  en_attente integer NOT NULL,
  examinees  integer NOT NULL,
  mesure_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION enregistrer_orgs_liees(p_jour date DEFAULT current_date)
RETURNS orgs_liees_historique
LANGUAGE sql
AS $$
  WITH comptes AS (
    SELECT
      (SELECT count(DISTINCT org_id)::int FROM event
        WHERE org_id IS NOT NULL
          AND COALESCE(observed_at, collected_at) >= now() - interval '7 days') AS semaine,
      (SELECT count(*)::int FROM quarantine_raw WHERE promoted=true) AS total,
      (SELECT count(*)::int FROM quarantine_raw
        WHERE kind='claim' AND status='pending' AND promoted=false
          AND org_hint IS NOT NULL AND btrim(org_hint) <> '') AS en_attente,
      (SELECT count(DISTINCT subject)::int FROM journal
        WHERE kind='review.decided') AS examinees
  )
  INSERT INTO orgs_liees_historique (jour, semaine, total, en_attente, examinees)
  SELECT p_jour, semaine, total, en_attente, examinees FROM comptes
  ON CONFLICT (jour) DO UPDATE
     SET semaine = EXCLUDED.semaine,
         total = EXCLUDED.total,
         en_attente = EXCLUDED.en_attente,
         examinees = EXCLUDED.examinees,
         mesure_at = now()
  RETURNING *;
$$;
