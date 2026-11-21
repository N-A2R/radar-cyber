-- Secteur agrégé publiable (9 groupes) : la valeur, son origine et sa confiance.
ALTER TABLE org ADD COLUMN IF NOT EXISTS secteur_groupe text;
ALTER TABLE org ADD COLUMN IF NOT EXISTS secteur_source text;
ALTER TABLE org ADD COLUMN IF NOT EXISTS secteur_confiance real;
CREATE INDEX IF NOT EXISTS org_secteur_groupe_idx ON org (secteur_groupe);
