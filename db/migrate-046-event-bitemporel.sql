-- 046 : bi-temporalité des événements.
--
--   valid_at — quand le fait était vrai dans le monde (date de l'article) ;
--   at       — quand le radar l'a appris (date de collecte).
--
-- Les lignes existantes n'ont pas deux dates distinctes : on reprend
-- `observed_at` comme date de vérité, ou `collected_at` à défaut. Le temps
-- transactionnel est celui de la collecte. Aucune date n'est inventée.
-- Les collecteurs renseignent explicitement `valid_at` ensuite.

BEGIN;

ALTER TABLE event ADD COLUMN IF NOT EXISTS valid_at timestamptz;
ALTER TABLE event ADD COLUMN IF NOT EXISTS at timestamptz;

UPDATE event
   SET valid_at = COALESCE(observed_at, collected_at, created_at, now()),
       at       = COALESCE(collected_at, created_at, now())
 WHERE valid_at IS NULL OR at IS NULL;

ALTER TABLE event ALTER COLUMN valid_at SET DEFAULT now();
ALTER TABLE event ALTER COLUMN at SET DEFAULT now();
ALTER TABLE event ALTER COLUMN valid_at SET NOT NULL;
ALTER TABLE event ALTER COLUMN at SET NOT NULL;

CREATE INDEX IF NOT EXISTS event_valid_at_idx ON event (valid_at DESC);
CREATE INDEX IF NOT EXISTS event_at_idx ON event (at DESC);

COMMENT ON COLUMN event.valid_at IS 'Quand le fait était vrai dans le monde (date de l''article).';
COMMENT ON COLUMN event.at IS 'Quand le radar a appris le fait (date de collecte).';

COMMIT;
