-- 065 — normalized event text for bounded trigram global search.
--
-- The global search endpoint matches accent-free query tokens against scraped
-- event titles and summaries. Normalizing those two columns at query time
-- forces a sequential scan (measured at ~2 s on the 26k-event corpus); a
-- generated column followed by a trigram index keeps that work out of the
-- request path. `translate` is IMMUTABLE, unlike `unaccent`, so it is valid in
-- a generated column.
CREATE OR REPLACE FUNCTION normalize_search_input(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(
    lower(coalesce(value, '')),
    'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ',
    'aaaaaaceeeeiiiinoooooouuuuyy'
  )
$$;

ALTER TABLE event
  ADD COLUMN IF NOT EXISTS title_search text
  GENERATED ALWAYS AS (normalize_search_input(title)) STORED,
  ADD COLUMN IF NOT EXISTS summary_search text
  GENERATED ALWAYS AS (normalize_search_input(summary)) STORED;

CREATE INDEX IF NOT EXISTS event_title_search_trgm ON event USING gin (title_search gin_trgm_ops);
CREATE INDEX IF NOT EXISTS event_summary_search_trgm ON event USING gin (summary_search gin_trgm_ops);

ANALYZE event;
