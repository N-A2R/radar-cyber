-- 051 : historique DNS des domaines du référentiel de Nouvelle-Aquitaine.
--
-- Objectif : suivre A/AAAA, MX et NS des domaines connus (colonne `org.domain`
-- et hôte de `org.website`), à intervalle régulier, sans service payant.
-- Sources : DNS public via DoH (Cloudflare) et RDAP (rdap.org).
--
-- Trois tables :
--   * dns_domaine    : le périmètre suivi, l'état du dernier relevé ;
--   * dns_snapshot   : chaque observation, même identique (l'historique se
--                      mesure, il ne se suppose pas) ;
--   * dns_change      : les différences entre deux observations, avec la valeur
--                      avant et après. Le libellé du fournisseur n'est pas
--                      inventé : il vient de dns_fournisseur, appliqué aux MX,
--                      NS et noms inverses (PTR).
--
-- Aucune donnée personnelle : uniquement des noms de domaine institutionnels
-- et des enregistrements publics.

BEGIN;

CREATE TABLE IF NOT EXISTS dns_domaine (
  domain         text PRIMARY KEY,
  label          text,                              -- nom de l'organisation, indicatif
  org_ids        integer[] NOT NULL DEFAULT '{}',
  active         boolean NOT NULL DEFAULT true,
  first_seen     timestamptz NOT NULL DEFAULT now(),
  last_try       timestamptz,
  last_success   timestamptz,
  last_state     text NOT NULL DEFAULT 'jamais'     -- jamais | ok | partiel | erreur
);

COMMENT ON TABLE dns_domaine IS
  'Périmètre suivi : domaines normalisés du référentiel (org.domain, org.website).';

CREATE TABLE IF NOT EXISTS dns_snapshot (
  id           bigserial PRIMARY KEY,
  domain       text NOT NULL REFERENCES dns_domaine(domain) ON DELETE CASCADE,
  observed_at  timestamptz NOT NULL DEFAULT now(),
  a            text[] NOT NULL DEFAULT '{}',
  aaaa         text[] NOT NULL DEFAULT '{}',
  mx           text[] NOT NULL DEFAULT '{}',
  ns           text[] NOT NULL DEFAULT '{}',
  ptr          jsonb  NOT NULL DEFAULT '{}'::jsonb,  -- { "ip": ["ptr1", ...] }
  registrar    text,
  errors       text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS dns_snapshot_domain_idx
  ON dns_snapshot (domain, observed_at DESC);

COMMENT ON TABLE dns_snapshot IS
  'Une observation DNS/RDAP par domaine et par passage ; conservée même si rien ne change.';

CREATE TABLE IF NOT EXISTS dns_change (
  id                   bigserial PRIMARY KEY,
  domain               text NOT NULL REFERENCES dns_domaine(domain) ON DELETE CASCADE,
  previous_snapshot_id bigint REFERENCES dns_snapshot(id) ON DELETE SET NULL,
  current_snapshot_id  bigint NOT NULL REFERENCES dns_snapshot(id) ON DELETE CASCADE,
  detected_at          timestamptz NOT NULL DEFAULT now(),
  kind                 text NOT NULL CHECK (kind IN ('ip', 'mx', 'ns', 'hebergeur', 'mx-inconnu', 'registrar')),
  severity             smallint NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 3),
  summary              text NOT NULL,
  before               jsonb NOT NULL DEFAULT '{}'::jsonb,
  after                jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS dns_change_detected_idx ON dns_change (detected_at DESC);
CREATE INDEX IF NOT EXISTS dns_change_domain_idx ON dns_change (domain, detected_at DESC);

COMMENT ON TABLE dns_change IS
  'Différences entre deux observations DNS : bascule d''IP, MX/NS, hébergeur, registraire.';

-- Catalogue des fournisseurs reconnus dans les MX, NS et PTR. Il ne sert qu'à
-- nommer ce qui est déjà public ; un suffixe absent donne « inconnu ».
-- `mode = 'suffix'` : le nom d'hôte se termine par le suffixe ;
-- `mode = 'contains'` : le suffixe apparaît comme étiquette (« awsdns-42.com »).
CREATE TABLE IF NOT EXISTS dns_fournisseur (
  suffix        text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL CHECK (category IN ('mail', 'dns', 'hosting', 'cdn', 'cloud', 'registrar')),
  mode          text NOT NULL DEFAULT 'suffix' CHECK (mode IN ('suffix', 'contains')),
  PRIMARY KEY (suffix, category)
);

COMMENT ON TABLE dns_fournisseur IS
  'Catalogue statique des suffixes publics (MX/NS/PTR) ; sert à nommer et à repérer les MX inconnus.';

INSERT INTO dns_fournisseur (suffix, name, category, mode) VALUES
  -- Messagerie
  ('google.com',              'Google Workspace',        'mail',    'suffix'),
  ('googlemail.com',          'Google Workspace',        'mail',    'suffix'),
  ('outlook.com',             'Microsoft 365',           'mail',    'suffix'),
  ('microsoft.com',           'Microsoft 365',           'mail',    'suffix'),
  ('icloud.com',              'Apple iCloud Mail',       'mail',    'suffix'),
  ('ovh.net',                 'OVHcloud',                'mail',    'suffix'),
  ('ovh.com',                 'OVHcloud',                'mail',    'suffix'),
  ('orange.fr',               'Orange',                  'mail',    'suffix'),
  ('orange.com',              'Orange',                  'mail',    'suffix'),
  ('wanadoo.fr',              'Orange',                  'mail',    'suffix'),
  ('free.fr',                 'Free',                    'mail',    'suffix'),
  ('free.net',                'Free',                    'mail',    'suffix'),
  ('proxad.net',              'Free',                    'mail',    'suffix'),
  ('gandi.net',               'Gandi',                   'mail',    'suffix'),
  ('ionos.com',               'IONOS',                   'mail',    'suffix'),
  ('ionos.fr',                'IONOS',                   'mail',    'suffix'),
  ('1and1.com',               'IONOS',                   'mail',    'suffix'),
  ('kundenserver.de',         'IONOS',                   'mail',    'suffix'),
  ('scaleway.com',            'Scaleway',                'mail',    'suffix'),
  ('online.net',              'Scaleway',                'mail',    'suffix'),
  ('amazonses.com',           'Amazon SES',              'mail',    'suffix'),
  ('amazonaws.com',           'AWS',                     'mail',    'suffix'),
  ('sendgrid.net',            'SendGrid',                'mail',    'suffix'),
  ('mailgun.org',             'Mailgun',                 'mail',    'suffix'),
  ('mailgun.net',             'Mailgun',                 'mail',    'suffix'),
  ('mailjet.com',             'Mailjet',                 'mail',    'suffix'),
  ('brevo.com',               'Brevo',                   'mail',    'suffix'),
  ('sendinblue.com',          'Brevo',                   'mail',    'suffix'),
  ('zoho.com',                'Zoho',                    'mail',    'suffix'),
  ('zoho.eu',                 'Zoho',                    'mail',    'suffix'),
  ('yandex.net',              'Yandex',                  'mail',    'suffix'),
  ('mail.ru',                 'Mail.ru',                 'mail',    'suffix'),
  ('protonmail.ch',           'Proton Mail',             'mail',    'suffix'),
  ('proton.me',               'Proton Mail',             'mail',    'suffix'),
  ('infomaniak.ch',           'Infomaniak',              'mail',    'suffix'),
  ('hostinger.com',           'Hostinger',               'mail',    'suffix'),
  ('hostinger.fr',            'Hostinger',               'mail',    'suffix'),
  ('lws.fr',                  'LWS',                     'mail',    'suffix'),
  ('lws.com',                 'LWS',                     'mail',    'suffix'),
  ('o2switch.net',            'o2switch',                'mail',    'suffix'),
  ('alwaysdata.net',          'Alwaysdata',              'mail',    'suffix'),
  ('planethoster.net',        'PlanetHoster',            'mail',    'suffix'),
  ('netim.net',               'Netim',                   'mail',    'suffix'),
  ('netim.com',               'Netim',                   'mail',    'suffix'),
  ('ikoula.com',              'Ikoula',                  'mail',    'suffix'),
  ('amen.fr',                 'Amen (AGARIK)',           'mail',    'suffix'),
  ('claranet.fr',             'Claranet',                'mail',    'suffix'),
  ('claranet.com',            'Claranet',                'mail',    'suffix'),
  ('one.com',                 'one.com',                 'mail',    'suffix'),
  ('secureserver.net',        'GoDaddy',                 'mail',    'suffix'),
  ('registrar-servers.com',   'Namecheap',               'mail',    'suffix'),
  ('namecheap.com',           'Namecheap',               'mail',    'suffix'),
  ('hostpapa.com',            'HostPapa',                'mail',    'suffix'),
  ('bluewin.ch',              'Bluewin (Swisscom)',      'mail',    'suffix'),
  ('smtp2go.com',             'SMTP2GO',                 'mail',    'suffix'),
  ('mailprotect.be',          'MailProtect',             'mail',    'suffix'),

  -- DNS / hébergement (NS)
  ('ovh.net',                 'OVHcloud',                'dns',     'suffix'),
  ('ovh.com',                 'OVHcloud',                'dns',     'suffix'),
  ('gandi.net',               'Gandi',                   'dns',     'suffix'),
  ('orange.fr',               'Orange',                  'dns',     'suffix'),
  ('wanadoo.fr',              'Orange',                  'dns',     'suffix'),
  ('free.fr',                 'Free',                    'dns',     'suffix'),
  ('scaleway.com',            'Scaleway',                'dns',     'suffix'),
  ('online.net',              'Scaleway',                'dns',     'suffix'),
  ('ionos.com',               'IONOS',                   'dns',     'suffix'),
  ('ionos.fr',                'IONOS',                   'dns',     'suffix'),
  ('hostinger.com',           'Hostinger',               'dns',     'suffix'),
  ('lws.fr',                  'LWS',                     'dns',     'suffix'),
  ('o2switch.net',            'o2switch',                'dns',     'suffix'),
  ('alwaysdata.net',          'Alwaysdata',              'dns',     'suffix'),
  ('planethoster.net',        'PlanetHoster',            'dns',     'suffix'),
  ('netim.net',               'Netim',                   'dns',     'suffix'),
  ('ikoula.com',              'Ikoula',                  'dns',     'suffix'),
  ('amen.fr',                 'Amen (AGARIK)',           'dns',     'suffix'),
  ('claranet.fr',             'Claranet',                'dns',     'suffix'),
  ('infomaniak.ch',           'Infomaniak',              'dns',     'suffix'),
  ('cloudflare.net',          'Cloudflare',              'dns',     'suffix'),
  ('cloudflare.com',          'Cloudflare',              'dns',     'suffix'),
  ('awsdns',                  'Amazon Route 53',         'dns',     'contains'),
  ('azure-dns.com',           'Microsoft Azure DNS',     'dns',     'suffix'),
  ('azure-dns.net',           'Microsoft Azure DNS',     'dns',     'suffix'),
  ('googledomains.com',       'Google Cloud DNS',        'dns',     'suffix'),
  ('nsone.net',               'NS1',                     'dns',     'suffix'),
  ('dnsimple.com',            'DNSimple',                'dns',     'suffix'),
  ('ultradns.com',            'UltraDNS',                'dns',     'suffix'),
  ('ultradns.net',            'UltraDNS',                'dns',     'suffix'),
  ('akam.net',                'Akamai',                  'dns',     'suffix'),
  ('akamai.net',              'Akamai',                  'cdn',     'suffix'),
  ('dynect.net',              'Oracle Dyn',              'dns',     'suffix'),
  ('domaincontrol.com',       'GoDaddy',                 'dns',     'suffix'),
  ('registrar-servers.com',   'Namecheap',               'dns',     'suffix'),
  ('bookmyname.com',          'BookMyName',              'dns',     'suffix'),
  ('siteground.com',          'SiteGround',              'dns',     'suffix'),
  ('siteground.net',          'SiteGround',              'dns',     'suffix'),
  ('hostgator.com',           'HostGator',               'dns',     'suffix'),
  ('bluehost.com',            'Bluehost',                'dns',     'suffix'),
  ('wixdns.net',              'Wix',                     'dns',     'suffix'),
  ('wordpress.com',           'WordPress.com',           'dns',     'suffix'),
  ('pulseheberg.com',         'PulseHeberg',             'dns',     'suffix'),
  ('nuxit.com',               'Nuxit',                   'dns',     'suffix'),
  ('phpnet.org',              'PHPNET',                  'dns',     'suffix'),
  ('sivit.fr',                'SIVIT',                   'dns',     'suffix'),
  ('hetzner.com',             'Hetzner',                 'dns',     'suffix'),
  ('digitalocean.com',        'DigitalOcean',            'dns',     'suffix'),
  ('vultr.com',               'Vultr',                   'dns',     'suffix'),
  ('linode.com',              'Linode',                  'dns',     'suffix'),
  ('shopify.com',             'Shopify',                 'dns',     'suffix'),

  -- Grands réseaux vus dans les PTR (hébergement/CDN)
  ('cloudfront.net',          'Amazon CloudFront',       'cdn',     'suffix'),
  ('fastly.net',              'Fastly',                  'cdn',     'suffix'),
  ('akamaitechnologies.com',  'Akamai',                  'cdn',     'suffix'),
  ('edgecastcdn.net',         'Edgecast',                'cdn',     'suffix'),
  ('azureedge.net',           'Microsoft Azure',         'cdn',     'suffix'),
  ('googleusercontent.com',   'Google Cloud',            'cloud',   'suffix'),
  ('1e100.net',               'Google',                  'cloud',   'suffix'),
  ('fbx.proxad.net',          'Free',                    'hosting', 'suffix'),
  ('numericable.fr',          'Numericable',             'hosting', 'suffix'),
  ('sfr.fr',                  'SFR',                     'hosting', 'suffix')
ON CONFLICT (suffix, category) DO NOTHING;

COMMIT;
