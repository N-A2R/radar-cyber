INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description)
VALUES ('poc_github', 'PoC publics GitHub (nomi-sec/PoC-in-GitHub)', 'vuln', 'https://github.com/nomi-sec/PoC-in-GitHub', 'public', false, true, 'indicator', 'json', '{}'::jsonb, 86400, 'Existence d un PoC public pour une CVE (exploitabilite)')
ON CONFLICT (id) DO NOTHING;
