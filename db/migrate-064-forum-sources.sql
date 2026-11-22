-- 064 : public forum sources (free, no account, NA-scoped or message-scoped).
-- Idempotent: a replay updates metadata but never duplicates a source.
INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, interval_sec)
VALUES
  ('forum:hn:bordeaux', 'Hacker News — Bordeaux discussion', 'forum',
   'https://hn.algolia.com/api/v1/search?query=Bordeaux%20cyber%20security&hitsPerPage=30',
   'public discussion search API — free, no account', false, true, 'narrative', 'json', 3600),
  ('forum:hn:gironde', 'Hacker News — Gironde discussion', 'forum',
   'https://hn.algolia.com/api/v1/search?query=Gironde%20cyber%20security&hitsPerPage=30',
   'public discussion search API — free, no account', false, true, 'narrative', 'json', 3600),
  ('forum:hn:poitiers', 'Hacker News — Poitiers discussion', 'forum',
   'https://hn.algolia.com/api/v1/search?query=Poitiers%20cyber%20security&hitsPerPage=30',
   'public discussion search API — free, no account', false, true, 'narrative', 'json', 3600),
  ('forum:hn:latest', 'Hacker News — latest discussion', 'forum',
   'https://news.ycombinator.com/rss', 'public RSS — free, no account',
   false, true, 'narrative', 'rss', 3600),
  ('forum:letsencrypt:community', 'Let''s Encrypt community — latest discussion', 'forum',
   'https://community.letsencrypt.org/latest.rss', 'public Discourse RSS — free, no account',
   false, true, 'narrative', 'rss', 3600),
  ('forum:httparchive:discuss', 'HTTP Archive discuss — latest discussion', 'forum',
   'https://discuss.httparchive.org/latest.rss', 'public Discourse RSS — free, no account',
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
