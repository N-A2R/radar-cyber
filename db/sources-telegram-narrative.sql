-- Cinq canaux Telegram ransomware câblés en sources narratives — 2026-11-17
--
-- Ces canaux mesurés vivants (11 à 20 messages au sondage du 2026-11-17 :
-- BaseLeak, Leaked Databases, Marketo Leaked Data, BLACKNET-00, Snatch Team)
-- étaient en `kind='quarantine'`. Personne ne les lisait : la boucle générique
-- exclut ce kind, et `collectors/quarantine.collector.ts` ne connaît qu'un
-- identifiant en dur, `quarantine:ransomware.live`.
--
-- Décision utilisateur du 2026-11-17 : les passer en `narrative` pour que le
-- parseur Telegram existant (`parseTelegramMessages`, stratégie
-- `telegram-channel`) les lise. Le compromis est assumé : leurs messages
-- entrent dans `event` sans passer par la file de quarantaine.
--
-- Idempotent.

BEGIN;

UPDATE source SET
  kind = 'narrative',
  enabled = true,
  disabled_at = NULL,
  disabled_reason = NULL
WHERE id IN (
  'tg-baseleeak',          -- BaseLeak — 20 messages
  'tg-leaked-databases',   -- Leaked Databases — 20 messages
  'tg-marketo-leaks',      -- Marketo Leaked Data — 19 messages
  'tg-ransomwareg',        -- BLACKNET-00 Ransomware — 11 messages
  'tg-snatch-news'         -- Snatch Team — 20 messages
);

COMMIT;
