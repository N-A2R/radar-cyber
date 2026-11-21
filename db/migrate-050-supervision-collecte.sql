-- 050 : historique des cycles de collecte et alertes de supervision.
--
-- Un cycle = un passage complet des collecteurs dédiés et génériques. Les
-- compteurs de sources et d'éléments sont calculés à partir des `collector_run`
-- produits pendant le cycle, jamais recomputés côté client. La mémoire est
-- celle du processus API au début et à la fin du passage (RSS et heap).
CREATE TABLE IF NOT EXISTS collecte_cycle (
  id                    bigserial PRIMARY KEY,
  started_at            timestamptz NOT NULL,
  finished_at           timestamptz NOT NULL,
  duree_ms              integer NOT NULL CHECK (duree_ms >= 0),
  statut                text NOT NULL CHECK (statut IN ('ok', 'degraded', 'error')),
  sources_ok            integer NOT NULL DEFAULT 0,
  sources_error         integer NOT NULL DEFAULT 0,
  items_in              integer NOT NULL DEFAULT 0,
  items_new             integer NOT NULL DEFAULT 0,
  memoire_rss_octets    bigint NOT NULL,
  memoire_heap_octets   bigint NOT NULL,
  memoire_delta_octets  bigint NOT NULL,
  erreur                text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_collecte_cycle_finished_at
  ON collecte_cycle (finished_at DESC);

-- Les alertes de supervision vivent dans la table d'alertes, avec un scope de
-- revue : elles ne sont jamais diffusées sur les canaux externes. La clé de
-- déduplication est portée par evidence->>'cle', comme pour les agents CPU.
CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_supervision_cle
  ON alert (rule_id, (evidence->>'cle'))
  WHERE scope = 'supervision-collecte' AND evidence ? 'cle';

CREATE INDEX IF NOT EXISTS idx_alert_supervision_revue
  ON alert (status, created_at DESC)
  WHERE scope = 'supervision-collecte';
