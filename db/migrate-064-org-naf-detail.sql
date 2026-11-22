-- Detailed NAF (APE) classification: canonical code, origin and confidence.
-- Only codes present in the official NAF rev.2 nomenclature are written.
ALTER TABLE org ADD COLUMN IF NOT EXISTS naf_detail text;
ALTER TABLE org ADD COLUMN IF NOT EXISTS naf_detail_source text;
ALTER TABLE org ADD COLUMN IF NOT EXISTS naf_detail_confidence real;
CREATE INDEX IF NOT EXISTS org_naf_detail_idx ON org (naf_detail);
