-- 031 : traçabilité par canal de la diffusion des alertes (webhook / Telegram)
-- Permet de ne renvoyer que les canaux en échec lors d'un passage partiel.

ALTER TABLE alert ADD COLUMN IF NOT EXISTS webhook_delivered_at timestamptz;
ALTER TABLE alert ADD COLUMN IF NOT EXISTS telegram_delivered_at timestamptz;
