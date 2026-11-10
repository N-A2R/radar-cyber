INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description)
VALUES ('ctlog', 'Certificate Transparency (crt.sh)', 'cti', 'https://crt.sh/', 'public', false, true, 'indicator', 'json', '{}'::jsonb, 86400, 'Nouveaux certificats TLS via Certificate Transparency')
ON CONFLICT (id) DO NOTHING;
