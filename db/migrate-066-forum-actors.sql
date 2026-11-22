-- 066 : French-language public forum feeds and passive actor-mention storage.
-- Idempotent: replaying updates metadata but never duplicates rows.
INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, interval_sec)
VALUES
  ('forum:zataz:bordeaux', 'Zataz — Bordeaux public discussion', 'forum',
   'https://www.zataz.com/?s=bordeaux&feed=rss2', 'public RSS — free, no account, gray source',
   false, true, 'narrative', 'rss', 3600),
  ('forum:zataz:gironde', 'Zataz — Gironde public discussion', 'forum',
   'https://www.zataz.com/?s=gironde&feed=rss2', 'public RSS — free, no account, gray source',
   false, true, 'narrative', 'rss', 3600),
  ('forum:zataz:poitiers', 'Zataz — Poitiers public discussion', 'forum',
   'https://www.zataz.com/?s=poitiers&feed=rss2', 'public RSS — free, no account, gray source',
   false, true, 'narrative', 'rss', 3600)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  license = EXCLUDED.license,
  enabled = true,
  kind = EXCLUDED.kind,
  format = EXCLUDED.format,
  interval_sec = EXCLUDED.interval_sec;

-- One row per actor mentioned in one admitted French-language public message.
-- No author identity, no victim detail: only public actor labels and timestamps.
CREATE TABLE IF NOT EXISTS forum_actor_mention (
  message_key text NOT NULL,
  actor_key text NOT NULL,
  actor_label text NOT NULL,
  actor_kind text NOT NULL,
  source_id text NOT NULL,
  observed_at timestamptz,
  PRIMARY KEY (message_key, actor_key)
);

CREATE INDEX IF NOT EXISTS forum_actor_mention_actor_idx ON forum_actor_mention (actor_key);
