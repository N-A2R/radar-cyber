-- 023 : identifiant SIREN des organisations (référentiel entreprises NA)
ALTER TABLE org ADD COLUMN IF NOT EXISTS siren text;

CREATE UNIQUE INDEX IF NOT EXISTS org_siren_unique_idx
  ON org (siren)
  WHERE siren IS NOT NULL;
