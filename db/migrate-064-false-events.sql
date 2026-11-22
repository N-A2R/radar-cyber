-- 064 : false events detected and discarded from the alert engine.
--
-- An event with no cyber signal in its own text and no Nouvelle-Aquitaine
-- anchor (no org_id, no regional flag) is noise in the regional feed. The
-- event row is kept for audit; only the detection decision is stored here,
-- with its reason and relevance score. No victim data is copied.

BEGIN;

CREATE TABLE IF NOT EXISTS false_event (
  event_id bigint PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
  reason text NOT NULL,
  relevance_score integer NOT NULL DEFAULT 0,
  detected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS false_event_reason_idx ON false_event (reason);

COMMENT ON TABLE false_event IS
  'False events detected and discarded from alerts.';

COMMIT;
