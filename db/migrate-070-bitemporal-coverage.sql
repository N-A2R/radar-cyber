-- 070 : complete bitemporal coverage of the organisation reference.
--
-- The first bi-temporal version (030) added valid_from/valid_to and org_history,
-- but only muterOrganisation() wrote a version. Every other UPDATE (geocoding,
-- filiation, enrichment, corpus load, raw SQL) changed the projection without
-- leaving a trace, and aliases had no history table at all. Both clocks were
-- therefore incomplete: an as-of query could not tell what the radar knew at a
-- given time for most writes.
--
-- This migration makes coverage structural instead of conventional: a trigger
-- on every INSERT/UPDATE/DELETE of org and org_alias writes the version. No
-- application path can bypass it. The bulk backfill of rows that predate this
-- migration is done by scripts/backfill-bitemporal-coverage.mts (batched, under
-- the 60 s command limit).
--
-- Version convention: org_history / org_alias_history hold EVERY version,
-- including the current one. superseded_at IS NULL marks the assertion still
-- held by the radar; valid_to IS NULL marks the state still true in the world.

BEGIN;

-- 1. Alias history (the organisation history table comes from migration 030).
CREATE TABLE IF NOT EXISTS org_alias_history (
  id            bigserial PRIMARY KEY,
  org_alias_id  integer,
  org_id        integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  alias         text NOT NULL,
  source        text,
  status        text,
  rejected_at   timestamptz,
  nom_normalise text,
  valid_from    timestamptz NOT NULL DEFAULT '2020-01-01T00:00:00Z',
  valid_to      timestamptz,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  actor         text NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS org_alias_history_org_valid_idx
  ON org_alias_history (org_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS org_alias_history_recorded_idx
  ON org_alias_history (recorded_at DESC);
CREATE INDEX IF NOT EXISTS org_alias_history_open_idx
  ON org_alias_history (org_id) WHERE superseded_at IS NULL;

-- 2. Organisation versions: archive the previous assertion, open the new one.
CREATE OR REPLACE FUNCTION radar_org_bitemporal_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor text := COALESCE(nullif(current_setting('radar.actor', true), ''), 'system');
  v_valid_to timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE org_history
       SET valid_to = COALESCE(valid_to, now()), superseded_at = now()
     WHERE org_id = OLD.id AND superseded_at IS NULL;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_valid_to := CASE
      WHEN NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN NEW.valid_from
      WHEN NEW.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN NEW.valid_to
      ELSE OLD.valid_to
    END;
    UPDATE org_history
       SET valid_to = v_valid_to, superseded_at = now()
     WHERE org_id = OLD.id AND superseded_at IS NULL;
  END IF;

  INSERT INTO org_history (org_id, name, slug, kind, sector, city, dept, website, domain,
                           status, lat, lon, entity_code, entity_source, effectif_min,
                           parent_org_id, valid_from, valid_to, recorded_at, superseded_at, actor)
  VALUES (NEW.id, NEW.name, NEW.slug, NEW.kind, NEW.sector, NEW.city, NEW.dept, NEW.website,
          NEW.domain, NEW.status, NEW.lat, NEW.lon, NEW.entity_code, NEW.entity_source,
          NEW.effectif_min, NEW.parent_org_id, NEW.valid_from, NEW.valid_to, now(), NULL, v_actor);
  RETURN NEW;
END;
$$;

-- 3. Alias versions: same two clocks, keyed on the alias row identity.
CREATE OR REPLACE FUNCTION radar_alias_bitemporal_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor text := COALESCE(nullif(current_setting('radar.actor', true), ''), 'system');
  v_valid_to timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE org_alias_history
       SET valid_to = COALESCE(valid_to, now()), superseded_at = now()
     WHERE org_alias_id = OLD.id AND superseded_at IS NULL;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_valid_to := CASE
      WHEN NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN NEW.valid_from
      WHEN NEW.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN NEW.valid_to
      ELSE OLD.valid_to
    END;
    UPDATE org_alias_history
       SET valid_to = v_valid_to, superseded_at = now()
     WHERE org_alias_id = OLD.id AND superseded_at IS NULL;
  END IF;

  INSERT INTO org_alias_history (org_alias_id, org_id, alias, source, status, rejected_at,
                                 nom_normalise, valid_from, valid_to, recorded_at, superseded_at, actor)
  VALUES (NEW.id, NEW.org_id, NEW.alias, NEW.source, NEW.status, NEW.rejected_at,
          NEW.nom_normalise, NEW.valid_from, NEW.valid_to, now(), NULL, v_actor);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS radar_org_bitemporal_sync ON org;
CREATE TRIGGER radar_org_bitemporal_sync
  AFTER INSERT OR UPDATE OR DELETE ON org
  FOR EACH ROW EXECUTE FUNCTION radar_org_bitemporal_sync();

DROP TRIGGER IF EXISTS radar_alias_bitemporal_sync ON org_alias;
CREATE TRIGGER radar_alias_bitemporal_sync
  AFTER INSERT OR UPDATE OR DELETE ON org_alias
  FOR EACH ROW EXECUTE FUNCTION radar_alias_bitemporal_sync();

COMMIT;
