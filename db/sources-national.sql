-- Catalogue de flux CTI mondiaux sans clé d'API — kind 'indicator'
-- Vérifiés en live le 2026-11-10 (curl, statuts notés dans description).
INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description)
VALUES
  ('feodo-ip', 'Feodo Tracker (abuse.ch) IP blocklist', 'reputation', 'https://feodotracker.abuse.ch/downloads/ipblocklist.json', 'abuse.ch — CC0 / usage libre', false, true, 'indicator', 'json', '{}'::jsonb, 3600, 'HTTP 200 (2026-11-10). JSON array d''objets {ip_address,port,status,...}. ToS abuse.ch : usage libre, attribution appréciée.'),
  ('openphish', 'OpenPhish community feed', 'phishing', 'https://openphish.com/feed.txt', 'OpenPhish — usage libre non commercial', false, true, 'indicator', 'text', '{}'::jsonb, 3600, 'HTTP 302 -> 200 (2026-11-10), redirect vers raw.githubusercontent.com/openphish/public_feed. Liste d''URLs phishing, une par ligne. ToS : usage non commercial.'),
  ('spamhaus-drop', 'Spamhaus DROP list', 'reputation', 'https://www.spamhaus.org/drop/drop.txt', 'Spamhaus — usage libre sous conditions', false, true, 'indicator', 'text', '{}'::jsonb, 86400, 'HTTP 200 (2026-11-10). Blocklist CIDR + commentaires ;. ToS Spamhaus : usage non commercial, pas de revente.'),
  ('et-compromised', 'Emerging Threats compromised IPs', 'reputation', 'https://rules.emergingthreats.net/blockrules/compromised-ips.txt', 'Proofpoint Emerging Threats — gratuit', false, true, 'indicator', 'text', '{}'::jsonb, 86400, 'HTTP 200 (2026-11-10). Une IP par ligne. Licence : gratuit pour usage non commercial.'),
  ('cinsscore-badguys', 'CINS Score badguys list', 'reputation', 'https://cinsscore.com/list/ci-badguys.txt', 'CINS Army — gratuit', false, true, 'indicator', 'text', '{}'::jsonb, 86400, 'HTTP 200 (2026-11-10). Une IP par ligne. Usage libre.'),
  ('tor-bulk-exit', 'Tor Project bulk exit list', 'reputation', 'https://check.torproject.org/torbulkexitlist', 'Tor Project — CC BY 3.0', false, true, 'indicator', 'text', '{}'::jsonb, 86400, 'HTTP 200 (2026-11-10). Liste d''IPs de sortie Tor. Licence CC BY 3.0.'),
  ('alienvault-reputation', 'AlienVault IP Reputation (generic)', 'reputation', 'https://reputation.alienvault.com/reputation.generic', 'AlienVault OTX — gratuit', false, true, 'indicator', 'text', '{}'::jsonb, 86400, 'HTTP 200 (2026-11-10). Format "IP # comment". Usage libre.'),
  ('danmeuk-torlist', 'dan.me.uk Tor node list', 'reputation', 'https://www.dan.me.uk/torlist/', 'dan.me.uk — gratuit, rate limit 30 min', false, true, 'indicator', 'text', '{}'::jsonb, 86400, 'HTTP 200 (2026-11-10, rate-limited ensuite). Liste texte. Respecter le rate limit 30 min.')
ON CONFLICT (id) DO UPDATE SET
  url = EXCLUDED.url,
  description = EXCLUDED.description;
