-- Sources de collecte — idempotent
INSERT INTO source (id, name, family, url, license, retain_raw, enabled)
VALUES
  ('cert_fr', 'CERT-FR / ANSSI', 'cert_fr', 'https://www.cert.ssi.gouv.fr/feed/', 'ANSSI — diffusion publique', false, true),
  ('cisa_kev', 'CISA Known Exploited Vulnerabilities', 'vuln', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', 'US Government — public domain', false, true),
  ('ransomlook', 'RansomLook', 'ransomware', 'https://www.ransomlook.io/api/recent', 'CC BY 4.0', false, true),
  ('epss', 'FIRST EPSS', 'vuln', 'https://www.first.org/epss/', 'FIRST — gratuit, attribution demandée', false, true),
  ('hermes_radar_cyber', 'Hermes Agent — bot de veille radar-cyber', 'cti', 'box hermes / profil radar-cyber', 'interne', false, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  license = EXCLUDED.license,
  enabled = EXCLUDED.enabled;
