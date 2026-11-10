-- Sources phase 3 — warninglists MISP + paste/fuites publiques (2026-11-10)
--
-- Chaque URL ci-dessous a été mesurée par curl le 2026-11-10 (code HTTP et
-- taille en description). Licence relevée sur le dépôt/site lui-même, jamais
-- supposée. Idempotent : ON CONFLICT (id) DO UPDATE sur url/license/enabled/
-- description, pour qu'une remesure ultérieure puisse corriger la ligne.
--
-- kind='warninglist' : référentiels de valeurs légitimes (faux positifs).
--   Ils ne sont PAS pollés par le collecteur générique (`enabled=false`) :
--   leur consommation passe par `scripts/build-warninglist.mts`, qui lit un
--   clone du dépôt et écrit `db/indicator-denylist.json`, lui-même lu par
--   `apps/api/src/collectors/warninglist.ts`. Les activer ferait télécharger
--   jusqu'à 34 Mio par heure au collecteur qui, de toute façon, rejette ce
--   format (racine objet, pas de flux d'items).
-- kind='quarantine' : index de fuites / flux de paste. Le collecteur générique
--   les exclut explicitement (`kind <> 'quarantine'`), aucun collector ne les
--   ingère encore : la ligne documente la disponibilité mesurée.
-- kind='narrative' : le flux RSS DDoS Secrets est un vrai flux d'items.

INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description, disabled_at, disabled_reason)
VALUES
-- 1. Warninglists MISP — licence du dépôt (README §License, lu le 2026-11-10) :
--    « CC0 1.0 Universal (CC0 1.0) - Public Domain Dedication ».
--    Les listes datacenter-* sont dérivées de X4BNet/lists_vpn, dont l'avis
--    MIT est conservé dans doc/licenses/X4BNet-lists_vpn.txt du même dépôt.
('wl:misp:datacenter-ipv4', 'MISP warninglist — datacenter IPv4', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/datacenter-ipv4/list.json',
 'CC0 1.0 (MISP warninglists README) + MIT (données X4BNet/lists_vpn)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=1006547 ; type=cidr, 44428 réseaux ; utilisé par build-warninglist.mts (réseaux « réseaux »)',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),
('wl:misp:datacenter-ipv6', 'MISP warninglist — datacenter IPv6', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/datacenter-ipv6/list.json',
 'CC0 1.0 (MISP warninglists README) + MIT (données X4BNet/lists_vpn)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=221363 ; type=cidr, 8752 réseaux (première entrée 2001:1520::/32)',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),
('wl:misp:tranco', 'MISP warninglist — Tranco top 1M', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/tranco/list.json',
 'CC0 1.0 (MISP warninglists README)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=16152485 ; type=hostname, liste des domaines les plus visités',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),
('wl:misp:cloudflare-top1m', 'MISP warninglist — Cloudflare Radar top 1M', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/cloudflare-top1m/list.json',
 'CC0 1.0 (MISP warninglists README)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=21904660 ; type=hostname, classement Cloudflare Radar',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),
('wl:misp:cisco-top1m', 'MISP warninglist — Cisco Umbrella top 1M', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/cisco_top1m/list.json',
 'CC0 1.0 (MISP warninglists README)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=33995095 ; type=hostname, classement Cisco Umbrella',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),
('wl:misp:majestic-million', 'MISP warninglist — Majestic Million', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/majestic_million/list.json',
 'CC0 1.0 (MISP warninglists README)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=197997 ; type=hostname, classement Majestic Million',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),
('wl:misp:amazon-aws', 'MISP warninglist — plages Amazon AWS', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/amazon-aws/list.json',
 'CC0 1.0 (MISP warninglists README)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=102676 ; type=cidr, plages publiées par AWS',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),
('wl:misp:cloudflare', 'MISP warninglist — plages Cloudflare', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/cloudflare/list.json',
 'CC0 1.0 (MISP warninglists README)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=824 ; type=cidr, plages edge Cloudflare',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),
('wl:misp:common-ioc-false-positive', 'MISP warninglist — faux positifs IOC courants', 'warninglist',
 'https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/common-ioc-false-positive/list.json',
 'CC0 1.0 (MISP warninglists README)', false, false, 'warninglist', 'json', '{"itemsPath":"list"}'::jsonb, 604800,
 'Vérifié 2026-11-10 HTTP 200 size=4128 ; hashes/domaines à faux positifs fréquents (base Florian Roth)',
 now(), 'Référentiel consommé par scripts/build-warninglist.mts (clone du dépôt), pas par le polling ; format liste JSON sans items de flux'),

-- 2. Fuites & paste réellement accessibles sans clé (mesurés le 2026-11-10)
('leak:ddosecrets:rss', 'DDoS Secrets — publications récentes', 'leaks',
 'https://ddosecrets.org/feed/rss.xml',
 'non spécifiée sur le site (aucune mention de licence sur /about ni en pied de page)', true, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Vérifié 2026-11-10 HTTP 200 application/rss+xml size=535026, 491 <item> ; rafraîchi le 2026-11-10 21:53 UTC. Le chemin /feed/ répond 404, seul /feed/rss.xml existe',
 NULL, NULL),
('leak:hibp:breaches', 'Have I Been Pwned — index des violations', 'leaks',
 'https://haveibeenpwned.com/api/v3/breaches',
 'CC BY 4.0 (page haveibeenpwned.com/API/v3, section « License - breach & paste APIs »)', true, true, 'quarantine', 'json', '{}'::jsonb, 86400,
 'Vérifié 2026-11-10 HTTP 200 application/json size=1130025, tableau de violations (Name, Domain, BreachDate, PwnCount, Description). Accessible sans clé ; les autres points d''entrée HIBP exigent une clé',
 NULL, NULL),
('paste:github:gists-public', 'GitHub — gists publics (flux)', 'paste',
 'https://api.github.com/gists/public?per_page=100',
 'GitHub Terms of Service ; licence par gist (variable)', true, true, 'quarantine', 'json', '{}'::jsonb, 3600,
 'Vérifié 2026-11-10 HTTP 200 application/json size=279852, 100 gists ; sans clé mais quota 60 requêtes/h par IP',
 NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name,
  family = excluded.family,
  url = excluded.url,
  license = excluded.license,
  retain_raw = excluded.retain_raw,
  enabled = excluded.enabled,
  kind = excluded.kind,
  format = excluded.format,
  parser = excluded.parser,
  interval_sec = excluded.interval_sec,
  description = excluded.description,
  disabled_at = excluded.disabled_at,
  disabled_reason = excluded.disabled_reason;

-- Écartées (mesure du 2026-11-10, aucune ligne insérée) :
--   https://pastebin.com/api_scraping.php           403 — scraping réservé aux comptes Pro (clé).
--   https://scrape.pastebin.com/api_scraping.php    403 — idem.
--   https://pastebin.com/archive                    200 mais HTML rendu en JS, aucun lien /<id> extractible.
--   https://pastebin.pl/api_scraping.php            200 mais page d'accueil HTML de 63 Kio, pas d'API JSON.
--   https://psbdmp.ws/api/v3/dump/0                 000 — service injoignable (DNS/refus de connexion).
--   https://0paste.com/recent                       410 Gone — index disparu.
--   https://scylla.so/api/latest                    200 mais challenge anti-bot (redirection JWT), pas de JSON.
--   https://breachdirectory.org/api                 403 — accès refusé.
--   https://ghostbin.co/                            403 — accès refusé.
--   https://api.paste.ee/v1/pastes?perpage=1        401 — clé obligatoire.
--   https://api.ransomware.live/v2/recentvictims    404 — endpoint absent (déjà couvert par ransomlook/ransomware.live).
--   https://ransomwatch.telemetry.ltd/              200 mais site déclaré « archived », plus de flux.
--   https://ddosecrets.org/feed/                    404 — seul /feed/rss.xml répond.
--   https://paste.debian.net/recent                 404 — pas d'index public.
--   https://controlc.com/archive                    404 — pas d'index public.
--   https://haveibeenpwned.com/api/v3/              404 côté API hors /breaches sans clé.
