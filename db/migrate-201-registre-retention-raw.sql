-- 201 : rétention déclarée des données brutes.
--
-- Le registre des traitements était uniquement documenté (docs/conformite.md) :
-- aucune table ne portait la durée annoncée, et `quarantine_raw` n'exposait
-- ni identifiant de source ni date de collecte sous les noms qu'utilise le
-- contrôle de conformité (`q.source_id`, `q.collected_at`, `r.duree_jours`).
-- On matérialise ces trois faits sans renommer les colonnes existantes, pour
-- ne casser aucun collecteur ni écran de revue.
--
-- Durée déclarée par défaut : 90 jours de brut, comme les événements
-- (docs/memoire-longue.md § « Seuil de purge du brut »). Chaque source a sa
-- ligne : la durée peut ensuite être changée source par source sans toucher
-- au code. La purge elle-même vit dans `runRetention` (apps/api), qui applique
-- exactement le prédicat du contrôle et consigne une trace datée par source.
BEGIN;

CREATE TABLE IF NOT EXISTS registre_traitement (
  source_id   text PRIMARY KEY,
  duree_jours integer NOT NULL CHECK (duree_jours > 0),
  traitement  text NOT NULL DEFAULT 'donnees_brutes',
  declare_at  timestamptz NOT NULL DEFAULT now()
);

-- Colonnes calculées : elles ne peuvent pas dériver de `source`/`received_at`.
ALTER TABLE quarantine_raw
  ADD COLUMN IF NOT EXISTS source_id text GENERATED ALWAYS AS (source) STORED,
  ADD COLUMN IF NOT EXISTS collected_at timestamptz GENERATED ALWAYS AS (received_at) STORED;

CREATE INDEX IF NOT EXISTS quarantine_raw_retention_idx
  ON quarantine_raw (source_id, collected_at);

-- Amorçage : toute source déjà connue du référentiel ou déjà présente dans le
-- brut reçoit la durée déclarée de 90 jours. Les sources apparues plus tard
-- sont déclarées par `runRetention` avant sa première purge : aucune collecte
-- n'échappe au registre parce qu'elle est nouvelle.
INSERT INTO registre_traitement (source_id, duree_jours)
SELECT s, 90
  FROM (
    SELECT DISTINCT source AS s FROM quarantine_raw
    UNION
    SELECT id FROM source
  ) connues
ON CONFLICT (source_id) DO NOTHING;

COMMENT ON TABLE registre_traitement IS
  'Durée de conservation déclarée par source pour les données brutes (quarantine_raw).';
COMMENT ON COLUMN registre_traitement.duree_jours IS
  'Durée annoncée dans le registre des traitements, en jours, pour cette source.';
COMMENT ON COLUMN registre_traitement.traitement IS
  'Traitement concerné par la durée ; seules les données brutes sont purgées par source.';
COMMENT ON COLUMN quarantine_raw.source_id IS
  'Identifiant stable de la source, clé de jointure avec registre_traitement.';
COMMENT ON COLUMN quarantine_raw.collected_at IS
  'Date de collecte du brut : miroir de received_at, utilisé par la rétention déclarée.';

COMMIT;
