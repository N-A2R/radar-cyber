-- 066: provider suffixes observed in the Nouvelle-Aquitaine domain map.
--
-- These suffixes come from public NS/MX records collected by the DNS history
-- script and published in the provider map's unknown-host evidence. They are
-- named after the operator owning the suffix; no organization name, victim
-- data or paid source is involved.
--
-- Each row is a technical observation, not a claim of exclusivity: a provider
-- may use several suffixes, and a suffix may be shared by related services.

BEGIN;

INSERT INTO dns_fournisseur (suffix, name, category, mode) VALUES
  ('anycast.me',            'OVHcloud',          'dns',  'suffix'),
  ('hornetsecurity.com',    'Hornetsecurity',    'mail', 'suffix'),
  ('girondenumerique.net',  'Gironde Numérique', 'dns',  'suffix'),
  ('prodomaines.com',       'Prodomaines',       'dns',  'suffix'),
  ('alienor.net',           'Alienor',           'dns',  'suffix'),
  ('eolas.fr',              'Eolas',             'dns',  'suffix'),
  ('eolas-dns.eu',          'Eolas',             'dns',  'suffix'),
  ('amenworld.com',         'Amenworld',         'dns',  'suffix'),
  ('nameshield.net',        'Nameshield',        'dns',  'suffix'),
  ('infomaniak.com',        'Infomaniak',        'dns',  'suffix')
ON CONFLICT (suffix, category) DO NOTHING;

COMMIT;
