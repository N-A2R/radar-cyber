-- 068: extend the public provider catalogue with suffixes observed on the
-- Nouvelle-Aquitaine DNS map and attributed to their documented operator.
--
-- Only public NS/MX names and public operator documentation are used: no
-- victim data, no organization names, no paid source. A row records a naming
-- fact about infrastructure, not exclusivity or a service contract.
--
-- Evidence:
--   ui-dns.{biz,com,de,org}  IONOS Cloud DNS secondary-zone nameservers
--     https://docs.ionos.com/cloud/network-services/cloud-dns/api-how-tos/create-secondary-dns-zone.md
--   mailinblack.com  MAILINBLACK SAS legal notice
--     https://www.mailinblack.com/mentions-legales/
--   lwsdns.com  Ligne Web Services SAS, RDAP registrar rdap.lws.net
--     https://rdap.verisign.com/com/v1/domain/LWSDNS.COM
--   pphosted.com  Proofpoint email protection, RDAP NS ns1.proofpoint.com
--     https://rdap.verisign.com/com/v1/domain/PPHOSTED.COM
--   mimecast.com  Mimecast inbound mail hosts (public MX observations)
--   cloudflare.net  Cloudflare Email Routing MX hosts (public MX observations)

BEGIN;

INSERT INTO dns_fournisseur (suffix, name, category, mode) VALUES
  ('ui-dns.biz',      'IONOS',      'dns',  'suffix'),
  ('ui-dns.com',      'IONOS',      'dns',  'suffix'),
  ('ui-dns.de',       'IONOS',      'dns',  'suffix'),
  ('ui-dns.org',      'IONOS',      'dns',  'suffix'),
  ('mailinblack.com', 'MailinBlack', 'mail', 'suffix'),
  ('lwsdns.com',      'LWS',        'dns',  'suffix'),
  ('pphosted.com',    'Proofpoint', 'mail', 'suffix'),
  ('mimecast.com',    'Mimecast',   'mail', 'suffix'),
  ('cloudflare.net',  'Cloudflare', 'mail', 'suffix')
ON CONFLICT (suffix, category) DO NOTHING;

COMMIT;
