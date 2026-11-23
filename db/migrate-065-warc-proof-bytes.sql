-- The WARC proof must remain verifiable even if the local file disappears:
-- the record is also stored in the database (compressed TOAST).
ALTER TABLE warc_proof ADD COLUMN IF NOT EXISTS warc_record bytea;
