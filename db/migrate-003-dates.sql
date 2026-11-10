ALTER TABLE event ADD COLUMN IF NOT EXISTS date_source text;
ALTER TABLE event ADD COLUMN IF NOT EXISTS date_confidence text;
UPDATE event SET date_source='missing' WHERE observed_at IS NULL AND date_source IS NULL;