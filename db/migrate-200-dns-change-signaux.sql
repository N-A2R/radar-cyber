-- 200 : signaux de changement DNS — kinds explicites A/MX/NS.
--
-- La migration 051 enregistrait les bascules sous les libellés `ip`, `mx`,
-- `ns`. Le signal de détection parle le langage des enregistrements DNS :
-- A, MX, NS. On renomme les lignes existantes, on élargit la contrainte et on
-- indexe `kind` pour que le comptage des signaux reste une lecture indexée.
-- Aucune donnée n'est ajoutée : seulement des libellés d'enregistrements
-- publics, déjà présents dans la base.
--
-- Prérequis : migration 051 (tables dns_snapshot / dns_change).

BEGIN;

ALTER TABLE dns_change DROP CONSTRAINT IF EXISTS dns_change_kind_check;

UPDATE dns_change SET kind = 'A' WHERE kind = 'ip';
UPDATE dns_change SET kind = 'MX' WHERE kind = 'mx';
UPDATE dns_change SET kind = 'NS' WHERE kind = 'ns';

ALTER TABLE dns_change
  ADD CONSTRAINT dns_change_kind_check
  CHECK (kind IN ('A', 'MX', 'NS', 'hebergeur', 'mx-inconnu', 'registrar'));

CREATE INDEX IF NOT EXISTS dns_change_kind_idx ON dns_change (kind);

-- Rejeu idempotent de la détection rétrospective : une paire de snapshots
-- consécutifs ne peut produire qu'un signal par type d'enregistrement.
-- (Les paires issues d'un premier relevé n'existent pas : previous est NOT NULL
-- pour tout signal de comparaison.)
DELETE FROM dns_change a
 USING dns_change b
 WHERE a.id > b.id
   AND a.previous_snapshot_id = b.previous_snapshot_id
   AND a.current_snapshot_id = b.current_snapshot_id
   AND a.kind = b.kind;

CREATE UNIQUE INDEX IF NOT EXISTS dns_change_paire_kind_idx
  ON dns_change (previous_snapshot_id, current_snapshot_id, kind);

COMMENT ON COLUMN dns_change.kind IS
  'Type d''enregistrement modifié (A, MX, NS) ou signal dérivé (hébergeur, MX inconnu, registraire).';

COMMIT;
