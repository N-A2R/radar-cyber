-- 064 : per-channel delivery tracking for the email notification channel.
--
-- Webhook and Telegram already have their own timestamps. RSS is a pull feed
-- and needs no row state. This column is additive and replayable.
ALTER TABLE alert ADD COLUMN IF NOT EXISTS email_delivered_at timestamptz;
