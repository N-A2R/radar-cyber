-- 016 : alias d'organisation — interdiction des alias de ville
--
-- 014 dérivait un alias du nom nettoyé *après* retrait des préfixes
-- institutionnels (`Université de Limoges` → `limoges`, `Centre Hospitalier
-- d'Agen` → `agen`). Ces alias ne désignent pas l'organisation : ils
-- désignent la ville, citée dans des articles sans rapport (le maire d'Orange,
-- la gare Michelin, la météo à Limoges). 105 + 71 + 53 + 24 + 3 événements
-- étaient ainsi rattachés à tort.
--
-- Règle : un alias ne se dérive jamais en retirant l'établissement. On conserve
-- le nom entier ; les alias déjà dérivés sont **marqués**, pas supprimés, pour
-- garder la trace de l'erreur de dérivation.

ALTER TABLE org_alias ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE org_alias ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- 1. Marque les alias issus du retrait d'un préfixe institutionnel.
--    Même normalisation que 014 (translate, pas d'extension requise).
WITH norm AS (
  SELECT id,
         btrim(regexp_replace(
           btrim(regexp_replace(
             btrim(replace(translate(lower(name),
               'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
               'aaaaaaceeeeiiiinooooouuuuyyoa'), '.', '')),
             '[^a-z0-9]+', ' ', 'g')),
           '\s+', ' ', 'g')) AS full_name
  FROM org
),
institution AS (
  SELECT id, full_name FROM norm
  WHERE full_name ~ '^(universite|centre hospitalier|hopital)\s'
)
UPDATE org_alias a
   SET status = 'city-rejected',
       source = 'city-rejected',
       rejected_at = now()
  FROM institution i
 WHERE a.org_id = i.id
   AND a.source = 'name'
   AND a.status <> 'city-rejected';

-- 2. Garantit l'alias au nom entier (avec l'établissement). Il existe déjà pour
--    la plupart via le slug ; l'insertion couvre les organisations sans slug.
WITH norm AS (
  SELECT id,
         btrim(regexp_replace(
           btrim(regexp_replace(
             btrim(replace(translate(lower(name),
               'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
               'aaaaaaceeeeiiiinooooouuuuyyoa'), '.', '')),
             '[^a-z0-9]+', ' ', 'g')),
           '\s+', ' ', 'g')) AS full_name
  FROM org
)
INSERT INTO org_alias (org_id, alias, source, status)
SELECT id, full_name, 'name-full', 'active'
  FROM norm
 WHERE full_name ~ '^(universite|centre hospitalier|hopital)\s'
   AND length(full_name) >= 4
ON CONFLICT (org_id, alias) DO NOTHING;

-- 3. Le loader ne lit que les alias actifs : index partiel pour que la
--    sélection reste indexée malgré le filtre.
CREATE INDEX IF NOT EXISTS org_alias_active_lower_alias_idx
  ON org_alias (lower(alias)) WHERE status = 'active';
