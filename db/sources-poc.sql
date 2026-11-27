INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description)
VALUES
  ('poc', 'PoC publics GitHub (nomi-sec/PoC-in-GitHub)', 'vuln', 'https://github.com/nomi-sec/PoC-in-GitHub', 'public', false, true, 'indicator', 'json', '{}'::jsonb, 86400, 'Existence d un PoC public pour une CVE (exploitabilite)'),
  ('poc_github', 'PoC publics GitHub (identifiant historique)', 'vuln', 'urn:source:poc_github', 'public', false, false, 'indicator', 'json', '{}'::jsonb, 86400, 'Identifiant historique conservé pour les événements déjà collectes ; remplacé par poc.'),
  ('fuites', 'Fuites documentees (HIBP, LeakIX, DataBreaches, Pwned Passwords)', 'leaks', 'https://haveibeenpwned.com/api/v3/breaches', 'public', false, true, 'indicator', 'json', '{}'::jsonb, 86400, 'Collecteur dedie : métadonnées de violations vérifiées et expositions LeakIX, sans donnée personnelle')
ON CONFLICT (id) DO NOTHING;
