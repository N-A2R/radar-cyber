-- Migration 020 — index de lecture des scores EPSS (idempotente).
--
-- Aucune table `epss` : la règle d'admission (`admitByEpss`) ne lit PAS de
-- table, elle lit `event` — `loadCoverageContext()` (collectors/generic.ts)
-- filtre `source_id = 'epss'` et prend `evidence->>'epss'`. Le
-- rafraîchissement (`scripts/refresh-epss.mts`) y écrit donc des événements
-- au format du collecteur `epss`. Une table `epss` avait été créée puis laissée
-- vide : elle est supprimée ici pour ne pas laisser de doublon mort.
--
-- Les 100 lignes `event` (source `epss`) déjà en base sont des données de test
-- (CVE-2026-99xx) : elles ne sont pas supprimées, seulement signalées.

DROP TABLE IF EXISTS epss;

-- La requête de couverture filtre sur cette seule valeur de `source_id`.
CREATE INDEX IF NOT EXISTS event_epss_source_idx ON event (source_id) WHERE source_id = 'epss';
