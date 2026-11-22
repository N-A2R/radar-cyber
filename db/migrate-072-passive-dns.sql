-- 072: passive DNS observations for Nouvelle-Aquitaine domains.
--
-- The sensor only observes public DNS answers for domains that already exist
-- in the territorial reference (institutional corpus or org records). It
-- stores one row per domain, day, record type and answer: a "resolution" is
-- an answer actually returned by the resolver, never an inferred value.
--
-- No victim data, no e-mail address and no private network record is stored.

BEGIN;

CREATE TABLE IF NOT EXISTS dns_passive_domain (
  domain        text PRIMARY KEY,
  source        text NOT NULL,
  org_id        integer,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dns_passive_domain IS
  'NA-only domain perimeter of the passive DNS sensor, with provenance.';

CREATE TABLE IF NOT EXISTS dns_passive_resolution (
  id            bigserial PRIMARY KEY,
  domain        text NOT NULL REFERENCES dns_passive_domain(domain) ON DELETE CASCADE,
  observed_on   date NOT NULL,
  record_type   text NOT NULL CHECK (record_type IN ('A', 'AAAA', 'MX', 'NS')),
  value         text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dns_passive_resolution_unique
    UNIQUE (domain, observed_on, record_type, value)
);

CREATE INDEX IF NOT EXISTS dns_passive_resolution_day_idx
  ON dns_passive_resolution (observed_on DESC);

COMMENT ON TABLE dns_passive_resolution IS
  'One row per distinct DNS answer observed for an NA domain on a UTC day.';

CREATE OR REPLACE VIEW dns_passive_daily AS
SELECT observed_on AS day,
       count(*) AS resolutions,
       count(DISTINCT domain) AS domains
  FROM dns_passive_resolution
 GROUP BY observed_on;

COMMENT ON VIEW dns_passive_daily IS
  'Daily count of resolutions observed by the passive DNS sensor.';

COMMIT;
