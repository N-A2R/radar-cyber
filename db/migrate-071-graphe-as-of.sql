-- 071: indexed as-of access to the temporal graph.
--
-- The 052/064 projection stores valid_from / valid_to on every relation. A
-- generated half-open tstzrange plus a GiST index lets a query ask what the
-- graph looked like at any date without scanning the whole projection.
--
-- Idempotent and additive: no fact is rewritten, no victim data is read.

BEGIN;

ALTER TABLE graph_relation
  ADD COLUMN IF NOT EXISTS period tstzrange
  GENERATED ALWAYS AS (tstzrange(valid_from, valid_to, '[)')) STORED;

CREATE INDEX IF NOT EXISTS graph_relation_period_idx
  ON graph_relation USING gist (period);

COMMENT ON COLUMN graph_relation.period IS
  'Half-open validity interval [valid_from, valid_to) used for as-of queries.';

COMMIT;
