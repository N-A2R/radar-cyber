CREATE TABLE IF NOT EXISTS alert (
  id serial PRIMARY KEY,
  rule_id text NOT NULL,
  title text NOT NULL,
  severity int NOT NULL CHECK (severity BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','resolved')),
  event_id int,
  indicator_id int,
  org_id int,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  acked_at timestamptz,
  acked_by int
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_rule_event ON alert (rule_id, event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_rule_indicator ON alert (rule_id, indicator_id) WHERE indicator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_status_severity_created ON alert (status, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS detection_rule (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  severity int NOT NULL CHECK (severity BETWEEN 1 AND 5),
  enabled boolean NOT NULL DEFAULT true,
  match jsonb NOT NULL,
  action text NOT NULL DEFAULT 'alert',
  created_at timestamptz NOT NULL DEFAULT now()
);
