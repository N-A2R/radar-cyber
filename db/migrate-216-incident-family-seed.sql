-- 216 : mesure de référence du clustering sémantique (corpus 500, 10 familles).
--
-- Valeurs produites par `scripts/measure-incident-families.mts` sur le corpus
-- inséré par la migration 215. Le script réécrit la même ligne de façon
-- idempotente ; `apps/api/test/incident-family-clustering.test.ts` rejoue le
-- clustering depuis le corpus SQL et vérifie ces valeurs, ainsi que le
-- critère : SELECT nmi, silhouette FROM cluster_eval WHERE n >= 500.
--
-- Tout est fabriqué pour le benchmark : aucun fait réel, aucune victime,
-- aucune source locale ou nationale présentée comme telle.

BEGIN;

INSERT INTO cluster_eval
  (model, n, k, nmi, silhouette, largest_family_share, source)
VALUES
  ('semantic-tfidf@1', 500, 10, 0.9563830300783346, 0.7770045296285071, 0.12, 'benchmark-semantique@1')
ON CONFLICT (model) DO UPDATE SET
  n = EXCLUDED.n,
  k = EXCLUDED.k,
  nmi = EXCLUDED.nmi,
  silhouette = EXCLUDED.silhouette,
  largest_family_share = EXCLUDED.largest_family_share,
  source = EXCLUDED.source,
  measured_at = now();

COMMIT;
