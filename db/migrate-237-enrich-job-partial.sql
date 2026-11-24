-- 237 — état `partial` de la file d'enrichissement.
--
-- Un enrichisseur peut produire un résultat exploitable incomplet (WHOIS
-- partiel, DNS partiel) : le forcer en `done` masque le manque, le forcer en
-- `failed` le rejoue indéfiniment. `partial` est un état terminal observable
-- distinct. Aucune nouvelle colonne : le bail est porté par `next_try_at`
-- pendant l'état `running`.
BEGIN;

ALTER TABLE enrich_job DROP CONSTRAINT IF EXISTS enrich_job_state_check;
ALTER TABLE enrich_job ADD CONSTRAINT enrich_job_state_check
  CHECK (state IN ('pending', 'running', 'failed', 'partial', 'done', 'abandoned'));

DROP INDEX IF EXISTS enrich_job_due_idx;
CREATE INDEX enrich_job_due_idx
  ON enrich_job (state, next_try_at)
 WHERE state IN ('pending', 'failed', 'partial');

COMMIT;
