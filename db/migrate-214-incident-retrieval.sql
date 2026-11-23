-- 214 : incidents analogues par embeddings et voisinage vectoriel.
--
-- `event.embedding` porte un vecteur L2-normalisé de 100 dimensions produit
-- localement par `scripts/index-incidents.mts` (TF-IDF pondéré + projection
-- de hachage déterministe). Le type `cube` fournit un index GiST et
-- l'opérateur `<->` (distance euclidienne) : sur des vecteurs unitaires,
-- plus la distance est faible, plus le cosinus de similarité est élevé.
-- Aucun appel réseau, aucun modèle tiers, aucune donnée personnelle.
--
-- Jeu annoté : `retrieval_query` porte 100 requêtes. La classe d'analogues
-- annotée est l'ensemble des incidents du même acteur (champ factuel
-- `event.evidence->>'group'`, indépendant du modèle d'embedding). Un rappel
-- vaut 1 dès qu'un membre de cette classe figure dans les 10 voisins :
-- l'objectif est de surfacer un incident analogue, pas un identifiant précis
-- parmi des dizaines d'incidents du même acteur.
--
-- Critère de sortie (une ligne par requête, k = 10) :
--   SELECT avg(recall_at_10) FROM retrieval_eval WHERE k = 10;      -- >= 0,85
--   SELECT count(*) FROM event WHERE embedding IS NULL;              -- <= 267
--
-- Couverture lisible d'un coup : SELECT * FROM retrieval_coverage;

BEGIN;

CREATE EXTENSION IF NOT EXISTS cube;

ALTER TABLE event ADD COLUMN IF NOT EXISTS embedding cube;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'event_embedding_dim_check' AND conrelid = 'event'::regclass
  ) THEN
    ALTER TABLE event
      ADD CONSTRAINT event_embedding_dim_check
      CHECK (embedding IS NULL OR cube_dim(embedding) = 100);
  END IF;
END
$constraint$;

CREATE INDEX IF NOT EXISTS event_embedding_ann_gist ON event USING gist (embedding);

COMMENT ON COLUMN event.embedding IS
  'Vecteur unitaire 100d (tfidf-hash-cube@1) pour la recherche d''incidents analogues.';

CREATE TABLE IF NOT EXISTS retrieval_query (
  id                text PRIMARY KEY,
  query_event_id    bigint NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  expected_event_id bigint NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  annotation_rule   text NOT NULL,
  actor             text NOT NULL,
  rationale         text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retrieval_query_distinct_events CHECK (query_event_id <> expected_event_id),
  CONSTRAINT retrieval_query_unique_pair UNIQUE (annotation_rule, query_event_id, expected_event_id)
);

COMMENT ON TABLE retrieval_query IS
  'Jeu gelé de requêtes annotées : un incident analogue attendu par requête.';

CREATE TABLE IF NOT EXISTS retrieval_hit (
  query_id  text NOT NULL REFERENCES retrieval_query(id) ON DELETE CASCADE,
  rank      smallint NOT NULL CHECK (rank BETWEEN 1 AND 10),
  event_id  bigint NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  distance  double precision NOT NULL CHECK (distance >= 0),
  PRIMARY KEY (query_id, rank)
);

COMMENT ON TABLE retrieval_hit IS
  'Top-10 renvoyé par le voisinage vectoriel pour chaque requête annotée (audit).';

CREATE TABLE IF NOT EXISTS retrieval_eval (
  query_id      text PRIMARY KEY REFERENCES retrieval_query(id) ON DELETE CASCADE,
  k             integer NOT NULL DEFAULT 10 CHECK (k = 10),
  recall_at_10  double precision NOT NULL CHECK (recall_at_10 >= 0 AND recall_at_10 <= 1),
  expected_rank smallint CHECK (expected_rank BETWEEN 1 AND 10),
  analogue_class text NOT NULL,
  model         text NOT NULL,
  measured_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN retrieval_eval.recall_at_10 IS
  '1 si au moins un incident de analogue_class est dans le top-10, sinon 0.';

CREATE INDEX IF NOT EXISTS retrieval_eval_k_idx ON retrieval_eval (k) INCLUDE (recall_at_10);

CREATE OR REPLACE VIEW retrieval_coverage AS
SELECT count(*)::bigint AS events,
       count(embedding)::bigint AS embedded_events,
       (count(*) - count(embedding))::bigint AS missing_embeddings,
       round(100.0 * count(embedding) / NULLIF(count(*), 0), 3) AS coverage_pct
  FROM event;

COMMENT ON VIEW retrieval_coverage IS
  'Couverture d''indexation : 100 * embedded_events / events.';

COMMIT;
