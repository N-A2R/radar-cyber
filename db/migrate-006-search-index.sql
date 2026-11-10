-- migrate-006-search-index.sql
-- Active pg_trgm et cree des index GIN trigram pour accelerer les recherches ILIKE '%q%'.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- event
CREATE INDEX IF NOT EXISTS event_title_trgm ON event USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS event_summary_trgm ON event USING gin (summary gin_trgm_ops);

-- org
CREATE INDEX IF NOT EXISTS org_name_trgm ON org USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS org_domain_trgm ON org USING gin (domain gin_trgm_ops);

-- indicator (5,6 M lignes) : creation one-shot mesuree ~30 s au total (extension + 5 index),
-- l'index indicator_value_trgm dominant. Idempotent (IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS indicator_value_trgm ON indicator USING gin (value gin_trgm_ops);