-- 215 : file d'attente des enrichissements en échec.
--
-- Jusqu'ici un enrichisseur en échec (WHOIS, DNS, certificats, réputation)
-- renvoyait des `errors` puis était mis en cache comme un succès : l'échec
-- disparaissait sans trace et sans rejeu possible. Chaque échec est désormais
-- une ligne explicite, avec un état, un compteur de tentatives et la date de
-- la prochaine tentative (backoff exponentiel calculé par l'API).
--
-- `target_kind` est limité aux indicateurs techniques : aucune adresse e-mail,
-- aucun nom de personne ou d'organisation n'est stocké ici.
--
-- Les états sont : pending (à tenter), running (en cours), failed (échec avec
-- rejeu planifié), done (succès) et abandoned (tentatives épuisées, terminal).
BEGIN;

CREATE TABLE IF NOT EXISTS enrich_job (
  id           bigserial PRIMARY KEY,
  target_kind  text NOT NULL CHECK (target_kind IN ('domain', 'url', 'ip', 'hash')),
  target_value text NOT NULL CHECK (char_length(target_value) BETWEEN 1 AND 512),
  state        text NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending', 'running', 'failed', 'done', 'abandoned')),
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_try_at  timestamptz,
  last_error   text,
  last_result  jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_kind, target_value)
);

CREATE INDEX IF NOT EXISTS enrich_job_due_idx
  ON enrich_job (state, next_try_at)
 WHERE state IN ('pending', 'failed');

COMMIT;
