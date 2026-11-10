-- Migration 021 — les scores EPSS vivent dans une table dédiée, plus dans `event`.
--
-- Mesuré avant cette migration : 2 834 lignes `event` avec `source_id = 'epss'`
-- (titre « CVE-… — EPSS x », `observed_at`/`org_id`/coordonnées NULL), dont
-- 2 734 créées en 6 h. Or `loadCoverageContext()` lisait ces mêmes lignes pour
-- décider de l'admission : le collecteur alimentait la règle qui l'autorisait
-- (boucle auto-référente), et le fil se remplissait d'événements sans lieu ni
-- acteur. EPSS est un référentiel de probabilités, pas un flux d'actualité :
-- une ligne par CVE, mise à jour en place, aucun événement.
--
-- Idempotente : ré-exécutable sans perte (upserts côté collecteur).

BEGIN;

-- L'index de migration 020 servait uniquement la lecture `event.source_id='epss'`,
-- supprimée avec elle.
DROP INDEX IF EXISTS event_epss_source_idx;

CREATE TABLE IF NOT EXISTS epss (
  cve text PRIMARY KEY,
  score double precision NOT NULL,
  percentile double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lecture de couverture : tous les scores au-dessus du seuil d'admission.
CREATE INDEX IF NOT EXISTS epss_score_idx ON epss (score DESC);

COMMIT;
