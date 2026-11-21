-- 047 : langue des événements.
--
-- Les lignes antérieures à la migration n'ont pas été mesurées : `langue`
-- reste NULL pour elles, on n'invente pas de valeur. Les points d'insertion
-- renseignent 'fr' ou 'en' (détection dans collectors/filter.ts), et
-- RADAR_LANGUAGES décide des langues admises à la collecte.

BEGIN;

ALTER TABLE event ADD COLUMN IF NOT EXISTS langue text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_langue_check') THEN
    ALTER TABLE event ADD CONSTRAINT event_langue_check CHECK (langue IN ('fr', 'en'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS event_langue_idx ON event (langue);

COMMENT ON COLUMN event.langue IS 'Langue détectée du titre et du résumé (fr/en). NULL : événement antérieur à la migration 047.';

COMMIT;
