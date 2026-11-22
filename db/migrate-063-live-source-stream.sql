-- 063: continuous collection of opted-in Nouvelle-Aquitaine sources.
--
-- A "live" source is polled by the fast loop in apps/api/src/collecte/live.ts,
-- independently of the 60-second general cycle. Only regional sources are
-- eligible. Every event written by a live source gets one latency row: the
-- difference between the publication time supplied by the feed and the moment
-- the row was recorded. The measurement is made at write time, not rebuilt
-- later from logs, so it cannot drift when the feed changes.
ALTER TABLE source ADD COLUMN IF NOT EXISTS live boolean NOT NULL DEFAULT false;
ALTER TABLE source ADD COLUMN IF NOT EXISTS live_interval_ms integer NOT NULL DEFAULT 15000;

CREATE TABLE IF NOT EXISTS source_live_item (
  id          bigserial PRIMARY KEY,
  event_id    bigint NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  source_id   text NOT NULL REFERENCES source(id),
  published_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  latency_ms  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_live_item_recorded_at ON source_live_item (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_live_item_source_recorded ON source_live_item (source_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION record_source_live_latency() RETURNS trigger AS $$
BEGIN
  IF NEW.date_source = 'feed' AND NEW.observed_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM source s WHERE s.id = NEW.source_id AND s.live) THEN
    INSERT INTO source_live_item (event_id, source_id, published_at, recorded_at, latency_ms)
    VALUES (NEW.id, NEW.source_id, NEW.observed_at, NEW.created_at,
            ROUND(EXTRACT(EPOCH FROM (NEW.created_at - NEW.observed_at)) * 1000)::integer);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_record_source_live_latency ON event;
CREATE TRIGGER trg_record_source_live_latency
  AFTER INSERT ON event
  FOR EACH ROW EXECUTE FUNCTION record_source_live_latency();
