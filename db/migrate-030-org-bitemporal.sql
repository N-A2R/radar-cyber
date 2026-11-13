-- 030 : bi-temporalité des organisations (chantier 4).
--
-- Une organisation peut fusionner, être renommée, changer de périmètre : une
-- commune avale sa voisine, une entreprise devient une filiale, un EPCI s'étend.
-- Sans histoire, un incident de 2024 se rattache à une organisation qui
-- n'existait qu'en 2025 — ou à une organisation qui n'existait plus.
--
-- Modèle : deux temps, comme le journal (migration 027), mais sur le
-- référentiel :
--   * valid_from / valid_to — quand l'organisation portait ce nom / ce périmètre
--     dans le monde (temps valide). valid_to = NULL = encore valide.
--   * recorded_at / superseded_at — quand le radar l'a appris (temps transaction) ;
--     porté par org_history.
--
-- Lecture as_of : org valides à une date = valid_from <= asOf < valid_to
-- (ou valid_to IS NULL). Écriture : jamais d'UPDATE destructif, on archive
-- l'ancienne version dans org_history puis on met à jour org.

BEGIN;

-- 1. Colonnes de validité sur org (projection courante) --------------------
ALTER TABLE org ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT '2020-01-01T00:00:00Z';
ALTER TABLE org ADD COLUMN IF NOT EXISTS valid_to timestamptz;
ALTER TABLE org ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- La projection courante est l'organisation encore valide : valid_to IS NULL
CREATE INDEX IF NOT EXISTS org_validity_idx ON org (valid_from, valid_to) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS org_valid_to_idx ON org (valid_to) WHERE valid_to IS NOT NULL;

COMMENT ON COLUMN org.valid_from IS 'Quand l''organisation a pris ce nom/périmètre dans le monde (temps valide).';
COMMENT ON COLUMN org.valid_to IS 'Quand elle a cessé de le porter ; NULL = encore valide.';
COMMENT ON COLUMN org.superseded_at IS 'Quand le radar a appris le changement (temps transaction) — null tant que courant.';

-- 2. Table d'histoire : chaque mutation y laisse une version close -----------
CREATE TABLE IF NOT EXISTS org_history (
  id            serial PRIMARY KEY,
  org_id        integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  kind          text NOT NULL,
  sector        text,
  city          text,
  dept          text,
  website       text,
  domain        text,
  status        text NOT NULL,
  lat           double precision,
  lon           double precision,
  entity_code   text,
  entity_source text,
  effectif_min  integer,
  parent_org_id integer,
  valid_from    timestamptz NOT NULL,
  valid_to      timestamptz,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  actor         text NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS org_history_org_valid_idx ON org_history (org_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS org_history_valid_idx ON org_history (valid_from, valid_to);
CREATE INDEX IF NOT EXISTS org_history_recorded_idx ON org_history (recorded_at DESC);

COMMENT ON TABLE org_history IS 'Versions closes d''organisations : chaque UPDATE de org y archive l''ancienne version.';

-- 3. Même chose pour les alias : un alias peut naître ou mourir ------------
ALTER TABLE org_alias ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT '2020-01-01T00:00:00Z';
ALTER TABLE org_alias ADD COLUMN IF NOT EXISTS valid_to timestamptz;

CREATE INDEX IF NOT EXISTS org_alias_validity_idx ON org_alias (org_id, valid_from, valid_to) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS org_alias_valid_to_idx ON org_alias (valid_to) WHERE valid_to IS NOT NULL;

COMMENT ON COLUMN org_alias.valid_from IS 'Quand cet alias est devenu valide dans le monde.';
COMMENT ON COLUMN org_alias.valid_to IS 'Quand il a cessé de l''être ; NULL = encore valide.';

COMMIT;
