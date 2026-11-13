-- 026 : `org` accueille tous les types d'organisations, pas seulement les collectivités.
--
-- Contexte : le chargement du référentiel (`planReferentiel`) ne produisait que des
-- collectivités — communes, EPCI, départements, région. Santé (10 008 établissements
-- FINESS), enseignement (6 528 UAI) et entreprises (13 332 SIREN) ne pouvaient pas
-- être chargés sans perdre de l'information : ni identifiant officiel, ni effectif,
-- ni établissement parent.
--
-- Règles :
--   * `kind` garde son vocabulaire fermé de 022 — aucun nouveau type n'est inventé ;
--     l'établissement, l'école et l'entreprise sont des `sante`, `enseignement` et
--     `entreprise`. En revanche `sector` s'ouvre : c'est là que se lit la nature
--     réelle (pharmacie, collège, SSIAD, école, TPE…), pour les facettes du rail.
--   * `entity_code` porte l'identifiant officiel de la source — FINESS, UAI ou SIREN —
--     ce qui rend le chargement rejouable sans table de correspondance.
--   * `effectif_min` garde la borne basse de la tranche d'effectif, pour trier les
--     organisations à enjeu sans prétendre connaître l'effectif exact.
--   * `parent_org_id` relie un établissement à son organisme de rattachement quand la
--     source le nomme : un événement sur le CHU doit remonter l'établissement.
--
-- Aucune donnée existante n'est modifiée : les collectivités déjà chargées gardent
-- leur slug et leurs alias, et les colonnes ajoutées restent nulles pour elles.

BEGIN;

-- 1. Identifiant officiel de la source -------------------------------------
-- Le slug est déjà dérivé d'un code officiel, mais il n'est pas interrogeable :
-- retrouver une organisation par son FINESS ou son UAI demande une colonne.
ALTER TABLE org ADD COLUMN IF NOT EXISTS entity_code text;
ALTER TABLE org ADD COLUMN IF NOT EXISTS entity_source text;

COMMENT ON COLUMN org.entity_code IS
  'Identifiant officiel chez la source : code INSEE (collectivité), FINESS, UAI, SIREN.';
COMMENT ON COLUMN org.entity_source IS
  'Nom du jeu d''origine (referentiel-na, finess, annuaire-education, sirene).';

-- Un même identifiant ne peut désigner qu'une organisation *par source* : le
-- SIREN est déjà servi par `org_siren_unique_idx` (migration 023).
CREATE UNIQUE INDEX IF NOT EXISTS org_entity_code_unique_idx
  ON org (entity_source, entity_code)
  WHERE entity_code IS NOT NULL AND entity_source IS NOT NULL;

-- 2. Enjeu et rattachement -------------------------------------------------
ALTER TABLE org ADD COLUMN IF NOT EXISTS effectif_min integer;
ALTER TABLE org ADD COLUMN IF NOT EXISTS parent_org_id integer
  REFERENCES org(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS org_parent_org_idx ON org (parent_org_id)
  WHERE parent_org_id IS NOT NULL;

-- Tri du répertoire par enjeu : les plus gros employeurs d'abord.
CREATE INDEX IF NOT EXISTS org_effectif_idx ON org (effectif_min DESC NULLS LAST)
  WHERE effectif_min IS NOT NULL;

COMMENT ON COLUMN org.effectif_min IS
  'Borne basse de la tranche d''effectif INSEE (0, 1, 3, 6, 10, 20, 50, 100, 500, 1000).';
COMMENT ON COLUMN org.parent_org_id IS
  'Organisme de rattachement quand la source le nomme (établissement -> CHU, école -> commune).';

-- 3. Retrouver les établissements d'un secteur -----------------------------
-- Les facettes du répertoire comptent par `kind` et `sector` sur l'ensemble de la
-- table : sans index, l'ouverture à 30 000 lignes rend le rail lent.
CREATE INDEX IF NOT EXISTS org_kind_sector_idx ON org (kind, sector);

COMMIT;
