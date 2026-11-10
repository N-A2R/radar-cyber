-- 024 : traçabilité de la diffusion des alertes (webhook / Telegram)
-- delivered_at NULL + attempts < N => éligible ; delivered_at NULL + attempts >= N => abandonnée.

ALTER TABLE alert ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

-- File des alertes non encore diffusées ni abandonnées, par ancienneté.
CREATE INDEX IF NOT EXISTS alert_delivery_pending_idx
  ON alert (created_at, id)
  WHERE delivered_at IS NULL AND attempts < 10;

-- Reprises programmées (back-off).
CREATE INDEX IF NOT EXISTS alert_delivery_retry_idx
  ON alert (next_attempt_at, id)
  WHERE delivered_at IS NULL AND attempts > 0 AND attempts < 10;
