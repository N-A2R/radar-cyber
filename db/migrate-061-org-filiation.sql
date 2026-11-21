-- 061 — Provenance of organisation parent/child links.
--
-- `org.parent_org_id` already models the link (a SIRENE establishment belongs
-- to its legal entity). What was missing is the proof: which rule established
-- the link, and from which public dataset. This migration adds that payload.
-- It creates no second source of truth and leaves existing rows untouched.
--
-- Writer: scripts/mesure-filiation.mts. Evidence holds public identifiers only
-- (never victim data, never personal data).

BEGIN;

ALTER TABLE org ADD COLUMN IF NOT EXISTS parent_evidence jsonb;

ALTER TABLE org DROP CONSTRAINT IF EXISTS org_parent_evidence_shape_chk;
ALTER TABLE org ADD CONSTRAINT org_parent_evidence_shape_chk
  CHECK (
    parent_evidence IS NULL OR (
      jsonb_typeof(parent_evidence) = 'object'
      AND parent_evidence ?& ARRAY['method', 'source', 'childCode', 'parentCode', 'dataset', 'url']
    )
  );

CREATE INDEX IF NOT EXISTS org_parent_evidence_idx
  ON org (parent_org_id) WHERE parent_evidence IS NOT NULL;

COMMENT ON COLUMN org.parent_evidence IS
  'Proof payload for parent_org_id: public SIRENE codes, rule and source URL.';

COMMIT;
