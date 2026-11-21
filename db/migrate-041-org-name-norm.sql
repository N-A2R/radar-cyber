-- 041 : nom déaccentué, indexé, pour le préfiltre des candidats de promotion.
--
-- Défaut mesuré le 2026-11-21 (mission « Nuit Nouvelle-Aquitaine », Task 3) :
-- `loadCandidateIndex` (apps/api/src/quarantine/promote.ts) préfiltre avec
-- `name ILIKE '%jeton%'` où les jetons sont déaccentués par `normalizeName`,
-- mais les noms du référentiel gardent leurs accents. « espérance » →
-- `ILIKE '%esperance%'` rate « Commune de Pechs-de-l'Espérance » : les deux
-- ILIKE rendent des ensembles disjoints en base. Les domaines cités par les
-- revendications ne portent jamais d'accent, donc toute organisation au nom
-- accentué était invisible du préfiltre — et le moteur ne voit que ce que le
-- préfiltre lui donne.
--
-- La colonne est GÉNÉRÉE : elle ne peut pas diverger du nom, et `translate`
-- (IMMUTABLE) est déaccentué côté SQL exactement comme `normalizeName` le fait
-- côté TypeScript sur les mêmes lettres françaises. Œ/æ sont volontairement
-- absents de la table de traduction : NFD ne les décompose pas, et
-- `normalizeName` non plus — il faut que les deux côtés se répondent.

ALTER TABLE org
  ADD COLUMN IF NOT EXISTS name_norm text
  GENERATED ALWAYS AS (
    translate(
      lower(name),
      'àáâãäåàáâãäåççèéêëèéêëìíîïìíîïññòóôõöøòóôõöøùúûüùúûüýýÿÿ',
      'aaaaaaaaaaaacceeeeeeeeeeiiiiiiiinnoooooooooouuuuuuuuuyyyy'
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS org_name_norm_trgm ON org USING gin (name_norm gin_trgm_ops);

ANALYZE org;
