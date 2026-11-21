-- 045 : la langue devient une propriété de l'événement.
--
-- Les flux narratifs mélangent français et anglais. Stocker la langue sur la
-- ligne permet d'appliquer le filtre d'ingestion (RADAR_EVENT_LANGUAGES) et de
-- mesurer la répartition ensuite, sans réanalyser les textes. `und` signifie
-- que le texte ne portait pas assez d'indices pour trancher.

ALTER TABLE event ADD COLUMN IF NOT EXISTS langue text;

COMMENT ON COLUMN event.langue IS
  'Langue détectée à l''ingestion (fr, en ou und) ; NULL pour les événements antérieurs à la migration 045.';
