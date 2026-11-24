-- 234 — retrait de l'index redondant `org_unknown_critere_idx`.
--
-- Ses deux colonnes de prédicat (`unknown_field`, `checked_at`) sont NOT NULL
-- depuis migrate-217 : le filtre est toujours vrai. L'index (org_id) 213 Mo
-- n'a jamais eu un seul idx_scan et double la contrainte UNIQUE existante
-- (org_id, unknown_field), déjà indexée avec org_id en tête.
BEGIN;

DROP INDEX IF EXISTS org_unknown_critere_idx;

COMMIT;
