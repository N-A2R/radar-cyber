-- WARC proof: one archivable proof per Nouvelle-Aquitaine fact.
--
-- The WARC file stays outside the database (WARC_DIR); this table holds the
-- index used to locate and verify the record without collecting again.
CREATE TABLE IF NOT EXISTS warc_proof (
  event_id       bigint PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
  source_url     text NOT NULL,
  target_uri     text NOT NULL,
  warc_file      text NOT NULL,
  record_id      text NOT NULL UNIQUE,
  block_sha1     text NOT NULL,
  payload_sha256 text NOT NULL,
  http_status    integer NOT NULL,
  content_type   text,
  byte_length    integer NOT NULL,
  redacted       boolean NOT NULL DEFAULT false,
  captured_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warc_proof_captured_idx ON warc_proof (captured_at DESC);
CREATE INDEX IF NOT EXISTS warc_proof_file_idx ON warc_proof (warc_file);
