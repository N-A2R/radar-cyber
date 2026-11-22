-- 065 — daily detection of newly exposed services in Nouvelle-Aquitaine.
--
-- exposition_service.consulted_at is overwritten on every refresh, so the
-- first observation needs its own column: otherwise a service that vanishes
-- and reappears would look brand new again. first_seen_at is set on insert
-- and never updated by the upsert.
--
-- The detection table is append-only per service: one row the first time a
-- daily pass sees it, with the timestamps needed to measure latency. Only
-- public network metadata (IP, port, source URL) is involved: no victim
-- personal data, no active scanning, no paid API.

BEGIN;

ALTER TABLE exposition_service ADD COLUMN IF NOT EXISTS first_seen_at timestamptz;
UPDATE exposition_service SET first_seen_at = consulted_at WHERE first_seen_at IS NULL;
ALTER TABLE exposition_service ALTER COLUMN first_seen_at SET NOT NULL;
ALTER TABLE exposition_service ALTER COLUMN first_seen_at SET DEFAULT now();

CREATE TABLE IF NOT EXISTS exposition_service_detection (
  id            bigserial PRIMARY KEY,
  service_id    bigint NOT NULL REFERENCES exposition_service(id) ON DELETE CASCADE,
  org_id        integer NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  detected_on   date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  UNIQUE (service_id)
);

CREATE INDEX IF NOT EXISTS exposition_service_detected_at_idx
  ON exposition_service_detection (detected_at DESC);

CREATE INDEX IF NOT EXISTS exposition_service_detected_on_idx
  ON exposition_service_detection (detected_on DESC);

-- Baseline: services already inventoried when this migration runs are not
-- new. Seeding them avoids reporting the whole inventory as discoveries on
-- the first pass. Only Nouvelle-Aquitaine organisations are recorded; the
-- daily pass applies the same scope at runtime.
WITH scoped_orgs AS (
  SELECT id FROM org
   WHERE dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
      OR replace(translate(lower(trim(dept)), 'éèêëàâäîïôöùûüç', 'eeeeaaaaiioouuuc'), '-', '')
         IN ('charente','charentemaritime','correze','creuse','dordogne','gironde',
             'landes','lotetgaronne','pyreneesatlantiques','deuxsevres','vienne',
             'hautevienne','nouvelleaquitaine')
)
INSERT INTO exposition_service_detection (service_id, org_id, first_seen_at, detected_at, detected_on)
SELECT s.id, s.org_id, s.first_seen_at, s.first_seen_at, (s.first_seen_at AT TIME ZONE 'UTC')::date
  FROM exposition_service s
  JOIN scoped_orgs o ON o.id = s.org_id
ON CONFLICT (service_id) DO NOTHING;

COMMENT ON TABLE exposition_service_detection IS
  'One row per newly exposed service found by the daily pass, with first observation and detection timestamps.';

COMMIT;
