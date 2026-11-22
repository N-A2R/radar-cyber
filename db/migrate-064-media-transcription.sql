-- 063 — Audio/video watch: transcription records.
--
-- One row per audio/video item published by a Nouvelle-Aquitaine radio or TV
-- source. The publisher text is hashed, never copied into the database: no
-- transcript body, no victim personal data. Writer: scripts/mesure-veille-av.mts
-- through apps/api/src/media/store.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS media_transcription (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  dept text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('audio', 'video')),
  media_url text NOT NULL,
  method text NOT NULL CHECK (method IN ('enclosure-caption', 'publisher-caption')),
  text_sha256 char(64) NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  text_length integer NOT NULL CHECK (text_length >= 0),
  word_count integer NOT NULL CHECK (word_count >= 0),
  language text NOT NULL CHECK (language IN ('fr', 'unknown')),
  relevant boolean NOT NULL,
  relevance_score smallint NOT NULL CHECK (relevance_score BETWEEN 0 AND 10),
  reason text NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media_transcription DROP CONSTRAINT IF EXISTS media_transcription_dept_chk;
ALTER TABLE media_transcription ADD CONSTRAINT media_transcription_dept_chk
  CHECK (dept IN ('16','17','19','23','24','33','40','47','64','79','86','87'));

ALTER TABLE media_transcription DROP CONSTRAINT IF EXISTS media_transcription_evidence_chk;
ALTER TABLE media_transcription ADD CONSTRAINT media_transcription_evidence_chk
  CHECK (jsonb_typeof(evidence) = 'object' AND evidence ?& ARRAY['pageUrl','method','rule']);

CREATE INDEX IF NOT EXISTS media_transcription_dept_idx ON media_transcription (dept);
CREATE INDEX IF NOT EXISTS media_transcription_relevant_idx ON media_transcription (relevant) WHERE relevant;

COMMENT ON TABLE media_transcription IS
  'Transcription signals from NA audio/video items; publisher text is hashed, never stored.';

COMMIT;
