-- Migration 008 : provenance géographique et index de rattachement.
--
-- Toute coordonnée doit être traçable : une position d'org (siège SIRENE,
-- adresse BAN, centre de commune ou saisie manuelle) et une position
-- d'événement (héritée de l'org, estimée par l'hébergeur, etc.).
-- Voir docs/geo.md.

ALTER TABLE org ADD COLUMN IF NOT EXISTS geo_source text;
ALTER TABLE event ADD COLUMN IF NOT EXISTS geo_source text;

-- Index event(org_id) : l'index existant event_org_idx (org_id, observed_at DESC)
-- couvre déjà le préfixe org_id, on ne crée donc un index dédié que si aucun
-- index utilisable ne commence par org_id. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'event'::regclass
      AND i.indisvalid
      AND a.attname = 'org_id'
  ) THEN
    CREATE INDEX event_org_id_idx ON event (org_id);
  END IF;
END$$;
