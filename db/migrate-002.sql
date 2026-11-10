-- Migration 002 : sources génériques (catalogue de flux)
ALTER TABLE source ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'narrative';
ALTER TABLE source ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'rss';
ALTER TABLE source ADD COLUMN IF NOT EXISTS parser jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE source ADD COLUMN IF NOT EXISTS interval_sec integer NOT NULL DEFAULT 3600;
ALTER TABLE source ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE source ADD COLUMN IF NOT EXISTS items_total bigint;
ALTER TABLE source ADD COLUMN IF NOT EXISTS last_items bigint;

CREATE INDEX IF NOT EXISTS source_kind_idx ON source (kind, enabled);
-- Indicateurs : dédup global par valeur, et origine
CREATE TABLE IF NOT EXISTS indicator (
  id         bigserial PRIMARY KEY,
  type       text NOT NULL,                 -- ip | domain | url | hash | ja3
  value      text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  tlp        text NOT NULL DEFAULT 'WHITE',
  confidence text,
  source_id  text REFERENCES source(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS indicator_value_idx ON indicator (type, value);
CREATE INDEX IF NOT EXISTS indicator_source_idx ON indicator (source_id);
