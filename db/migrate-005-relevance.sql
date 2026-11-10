-- Migration 005 : pertinence des flux (strict = cyber, context = presse généraliste)
ALTER TABLE source ADD COLUMN IF NOT EXISTS relevance text NOT NULL DEFAULT 'context';
ALTER TABLE collector_run ADD COLUMN IF NOT EXISTS items_skipped integer NOT NULL DEFAULT 0;

-- Famille 'presse' : ingestion conditionnelle via relevance.ts (voir packages/shared).
-- (la valeur 'presse' est ajoutée à l'enum applicatif FAMILIES ; pas de contrainte DB sur family)
