CREATE INDEX IF NOT EXISTS event_collected_idx ON event (collected_at);
CREATE INDEX IF NOT EXISTS indicator_last_seen_idx ON indicator (last_seen);