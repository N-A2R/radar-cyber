-- Quarantaine des revendications dark web (voir docs/research/darkweb-sources.md §3)
CREATE TABLE IF NOT EXISTS quarantine_raw (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source        text        NOT NULL,
    source_url    text        NOT NULL,
    groupe        text,
    org_hint      text,
    claimed_at    timestamptz,
    extracted     jsonb        NOT NULL DEFAULT '{}'::jsonb,
    raw_body      text,
    tlp           text        NOT NULL DEFAULT 'RED',
    content_hash  text        NOT NULL,
    status        text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','reviewed','promoted','rejected','purged')),
    promoted      boolean     NOT NULL DEFAULT false,
    promoted_at   timestamptz,
    promoted_by   text,
    received_at   timestamptz NOT NULL DEFAULT now(),
    purge_after   timestamptz NOT NULL DEFAULT now() + interval '30 days',
    CONSTRAINT quarantine_raw_source_url_key UNIQUE (source, content_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS quarantine_raw_dedup_idx
    ON quarantine_raw (source, content_hash);

CREATE INDEX IF NOT EXISTS quarantine_raw_pending_idx
    ON quarantine_raw (received_at)
    WHERE status = 'pending' AND promoted = false;

CREATE INDEX IF NOT EXISTS quarantine_raw_purge_idx
    ON quarantine_raw (purge_after)
    WHERE status IN ('pending','rejected','purged') AND promoted = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quarantine_raw_promotion_check'
  ) THEN
    ALTER TABLE quarantine_raw
      ADD CONSTRAINT quarantine_raw_promotion_check
      CHECK (promoted = false OR (promoted_at IS NOT NULL AND promoted_by IS NOT NULL AND status = 'promoted'));
  END IF;
END$$;
