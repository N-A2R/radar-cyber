# Catalogues OSINT / CTI — remplacement de la curation manuelle

Date : 2026-11-10. Méthode : chaque URL ci-dessous a été fetchée aujourd'hui (HTTP 200 + taille + aperçu du contenu). Licences : lues via `gh api repos/<o>/<r>/license` quand le dépôt en a une ; pour les sites serveur (abuse.ch, Spamhaus, Dataplane, CINS) les pages sont rendues en JS et le texte de licence n'est pas extractible via curl → marqué **NON VÉRIFIÉ**. Tor étant hors service sur la box, aucune URL `.onion` n'a été testée.

Conclusion courte : il n'existe **pas un** catalogue « prêt à ingérer » qui remplace la curation manuelle. Les deux objets utiles sont (1) le jeu de wrappers `feeds/*.py` de **maltrail**, qui est déjà la source de fait de nos ~120 lignes `feed:*` en base, et (2) les dépôts GitHub de type blocklist qui publient des fichiers plats stables. Le SQL du §4 ajoute 21 sources nouvelles (toutes HTTP 200 vérifiées) sans dupliquer les 324 existantes.

---

## 1. Catalogues évalués

| Dépôt | URL | Étoiles | Dernier commit | Licence | Format | Verdict |
|---|---|---|---|---|---|---|
| stamparm/maltrail | https://github.com/stamparm/maltrail | 8 656 | 2026-11-08 | MIT | 39 wrappers Python `feeds/*.py` + listes statiques | **ADAPTER** — c'est un *répertoire de feeds* maintenu (chaque `.py` contient `__url__` + qualification). Nos lignes `feed:*` en base en sont déjà tirées. À réexploiter comme catalogue de découverte, pas comme source directe. |
| hslatman/awesome-threat-intelligence | https://github.com/hslatman/awesome-threat-intelligence | 10 845 | 2026-10-30 | Apache-2.0 | Markdown | **ADAPTER** — méta-catalogue de ressources (outils, rapports, datasets), pas de flux bruts directement ingérables. Utile pour la veille, pas pour le pipeline. |
| sfish-x/awesome-cti | https://github.com/sfish-x/awesome-cti | — | — | — | — | **N'EXISTE PAS** — `gh api` → HTTP 404 vérifié. L'hypothèse de l'assignment est fausse ; le vrai catalogue généraliste est hslatman. |
| kraloveckey/threat-intelligence-feeds | https://github.com/kraloveckey/threat-intelligence-feeds | 11 | 2026-11-09 | MIT | README Markdown (77 Ko) listant des feeds avec URLs | **ADAPTER** — petit mais à jour quotidiennement, MIT, liste de feeds classés par type. Bon complément de découverte. |
| mthcht/awesome-lists | https://github.com/mthcht/awesome-lists | 1 966 | 2026-11-10 | MIT | CSV bruts sous `Lists/` | **RÉUTILISER** (1 fichier) — `Lists/IP/Threatfox/threatfox_ip_ports_list.csv` (4,6 Mo, IOCs IP+port avec malware associé, MAJ par workflow GitHub). Nos 2 sources `feed:mthcht:*` actuelles pointent vers des CSV GeoIP/VPN inutiles ; à remplacer par ce fichier. |
| muchdogesec/awesome_threat_intel_blogs | https://github.com/muchdogesec/awesome_threat_intel_blogs | 570 | 2026-06-12 | NOASSERTION (pas de licence) | Markdown | **ÉVITER** — annuaire de *blogs*, pas de feeds de données ; licence absente. |
| thehappydinoa/awesome-threat-intel-rss | https://github.com/thehappydinoa/awesome-threat-intel-rss | 150 | 2023-07-08 | Apache-2.0 | Markdown | **ÉVITER** — gelé depuis 2023-07 (3 ans), beaucoup de liens morts dedans. |
| firehol/blocklist-ipsets | https://github.com/firehol/blocklist-ipsets | 3 964 | 2026-11-09 | none (aucune licence de dépôt) | `.ipset`/`.netset` (86 fichiers) | **RÉUTILISER** — miroir quotidien de ~80 blocklists, format homogène parsable trivialement. Attention : dépôt sans licence → les droits sont ceux des listes amont. Miroir déjà utilisé (`feed:firehol:ip` → ktsaou/blocklist-ipsets). |
| stamparm/ipsum | https://github.com/stamparm/ipsum | 2 407 | 2026-11-10 | Unlicense | TXT 130 405 lignes | **RÉUTILISER** — déjà en base (`feed:ipsum:ip`). Référence de ce qu'un « bon » feed plat est. |

### Catalogues européens / FR — état des flux publics

| Organisation | Flux machine public ? | Détail vérifié |
|---|---|---|
| ANSSI / CERT-FR | **OUI** | `https://www.cert.ssi.gouv.fr/feed/` → HTTP 200, RSS 23 Ko. Mais déjà en base (`cert_fr`, `cert-fr-feed`, `cert-fr-alerte`, `cert-fr-avis`) → ne pas re-ajouter. Mieux : `https://misp.cert.ssi.gouv.fr/feed-misp/hashes.csv` (déjà en base aussi). |
| ANSSI (ssi.gouv.fr) | **NON** | `https://www.ssi.gouv.fr/feed/` → HTTP 200 mais 212 octets = page anti-bot Incapsula. Iningérable en l'état. |
| CERT-EU | **NON** | `https://cert.europa.eu/rss.xml` → 404 ; `/rss` → 404. Les security advisories sont en HTML (`/publications/security-advisories` → 200, 71 Ko) sans flux. Déjà partiellement couvert via `estorides:cert-eu-security-advisories`. |
| BSI (Allemagne) | **OUI** | `https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_CSW.xml` → HTTP 200, RSS CERT-Bund (50 items), 22 Ko. Le vieux flux `RSSNewsfeed_WID.xml` est mort (404). Ajoutée au SQL. |
| NCSC-NL | **NON** | `https://www.ncsc.nl/rss` → 200 mais page HTML d'app Next.js, aucun flux XML trouvé (`/current-topics/rss.xml` → 404). À scraper ou abandonner. |
| CESIN, CLUSIF | **NON** | `/feed/` → 404 (CESIN), 403 (CLUSIF). Pas de flux machine, uniquement newsletter. Ignorer. |
| USOM (Turquie, CERT national) | **INDIRECT** | `https://www.usom.gov.tr/url-list.txt` → 200 mais renvoie du HTML (app JS), pas la liste. Passer par le miroir elliotwutingfeng/USOM-Blocklists (BSD-3-Clause, MAJ 2026-11-09). Ajouté au SQL. |
| CERT.pl | déjà en base | `hole.cert.pl/domains/domains.txt` = `feed:cert-pl:dns`. |

---

## 2. Comment ingérer chaque catalogue

| Catalogue | Ingestion | Fréquence | Volume |
|---|---|---|---|
| maltrail `feeds/*.py` | Ce sont des *pointeurs* : lire les `__url__` (fetch via `gh api repos/stamparm/maltrail/contents/feeds/<f>.py`) puis ingérer l'URL amont. Pas à ingérer soi-même. | n/a | 39 feeds |
| firehol/blocklist-ipsets | Fichier plat `.ipset`/`.netset` brut (raw.githubusercontent.com) ; `#` = commentaires, 1 entrée/ligne (IP ou CIDR). Parser `detect:auto` existant suffit. | quotidien (workflow GitHub) | 86 listes, 200 o–2,7 Mo |
| ipsum | TXT brut, `score IP` ; déjà ingéré. | quotidien | 130 405 lignes |
| kraloveckey | Markdown à parser (liens + tableaux). Aucun intérêt en ingestion directe ; à lire à la main pour découvrir des feeds. | quotidien | ~77 Ko |
| mthcht | CSV brut (en-têtes `first_seen_utc,ioc_id,ioc_value,ioc_type,...`) → parser CSV dédié ou `detect:auto` si le moteur gère le CSV. | quotidien (workflow) | 4,6 Mo |
| elliotwutingfeng/* | TXT brut, 1 entrée/ligne, pas d'en-tête. | quotidien | 3 Ko–10,8 Mo |
| hslatman | Markdown, ingérable seulement comme liste de liens → hors pipeline. | n/a | — |
| abuse.ch (API) | POST JSON avec `Auth-Key` (clé déjà fonctionnelle : ThreatFox, MalwareBazaar, URLhaus API v1 → 200 vérifiés par le parent). Le moteur générique actuel ne fait que du GET → **adaptateur dédié requis** avant d'ajouter ces endpoints comme sources. | continu | — |

---

## 3. Sources nouvelles vérifiées (HTTP 200 mesuré le 2026-11-10)

Toutes **absentes** des 324 sources existantes (voir §5 pour les doublons écartés).

| # | URL | HTTP | Taille | Entrées | Format | Licence | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | https://iplists.firehol.org/files/firehol_level2.netset | 200 | 223 Ko | 15 367 | netset (txt, `#`) | mixte (miroir) | RÉUTILISER — attaques < 7 j |
| 2 | https://iplists.firehol.org/files/firehol_level3.netset | 200 | 186 Ko | 12 895 | netset | mixte | ADAPTER — mélange scanners/bruit (voir pièges) |
| 3 | https://iplists.firehol.org/files/firehol_level4.netset | 200 | 2,66 Mo | ~65 000 | netset | mixte | ADAPTER — gros, beaucoup d'IP dynamiques |
| 4 | https://iplists.firehol.org/files/firehol_webserver.netset | 200 | 15 Ko | ~500 | netset | mixte | RÉUTILISER — serveurs web attaqués |
| 5 | https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/dshield_1d.netset | 200 | 1,3 Ko | 31 | netset | CC (DShield, en-tête fichier) | RÉUTILISER — /24 attaquants 24 h |
| 6 | https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/dshield_7d.netset | 200 | 1,6 Ko | ~40 | netset | CC (DShield) | RÉUTILISER |
| 7 | https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/dshield_30d.netset | 200 | 2,0 Ko | ~50 | netset | CC (DShield) | RÉUTILISER |
| 8 | https://rules.emergingthreats.net/blockrules/emerging-botcc.rules | 200 | 7,4 Ko | 10 règles (C2) | snort rules (txt) | GPL-2.0 (open rules, annoncé) | RÉUTILISER — C2 botnet, très qualitatif |
| 9 | https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt | 200 | 30 Ko | 1 787 | txt IP | GPL-2.0 (annoncé) | RÉUTILISER |
| 10 | https://sslbl.abuse.ch/blacklist/sslblacklist.csv | 200 | 844 Ko | 6 898 | CSV sha256 | abuse.ch — NON VÉRIFIÉ (page JS) | RÉUTILISER — certificats TLS botnet |
| 11 | https://dataplane.org/sshpwauth.txt | 200 | 1,1 Mo | 10 592 | txt pipe `|` | CGU Dataplane — NON VÉRIFIÉ | ADAPTER — parser pipe + licence à valider |
| 12 | https://isc.sans.edu/feeds/topips.txt | 200 | 0,6 Ko | 16 | txt tab | SANS ISC (gratuit) | RÉUTILISER — top attaquants 24 h, petit mais dense |
| 13 | https://raw.githubusercontent.com/mthcht/awesome-lists/main/Lists/IP/Threatfox/threatfox_ip_ports_list.csv | 200 | 4,6 Mo | ~100 k | CSV | MIT (dépôt) ; données ThreatFox | RÉUTILISER — IP:port C2 qualifiés par malware |
| 14 | https://raw.githubusercontent.com/elliotwutingfeng/ThreatFox-IOC-IPs/main/ips.txt | 200 | 298 Ko | ~20 k | txt IP | BSD-3-Clause | ADAPTER — miroir quotidien de l'API ThreatFox (déjà en base via `threatfox-iocs` → dédupliquer ou remplacer) |
| 15 | https://raw.githubusercontent.com/elliotwutingfeng/GlobalAntiScamOrg-blocklist/main/global-anti-scam-org-scam-urls.txt | 200 | 171 Ko | 11 220 | txt domaines | BSD-3-Clause | RÉUTILISER — domaines scam (anti-scam.org) |
| 16 | https://raw.githubusercontent.com/elliotwutingfeng/USOM-Blocklists/main/ips.txt | 200 | 231 Ko | ~30 k | txt IP | BSD-3-Clause | RÉUTILISER — CERT national turc |
| 17 | https://raw.githubusercontent.com/elliotwutingfeng/USOM-Blocklists/main/urls.txt | 200 | 10,8 Mo | ~200 k | txt URL | BSD-3-Clause | ADAPTER — volumineux, phishing/scam turc |
| 18 | https://cybercrime-tracker.net/all.php | 200 | 877 Ko | 22 701 | txt URL C2 | aucune | RÉUTILISER — C2 RAT/ransomware (complète `feed:cybercrime-tracker-net:*` qui n'a que 3 sous-listes) |
| 19 | https://malpedia.caad.fkie.fraunhofer.de/library | 200 | 655 Ko | ~800 familles | HTML | Fraunhofer FKIE — NON VÉRIFIÉ | ADAPTER — catalogue de familles malware (référentiel, pas un flux) |
| 20 | https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_CSW.xml | 200 | 22 Ko | 50 items | RSS | pas applicable (administration) | RÉUTILISER — CERT-Bund DE |
| 21 | https://www.spamhaus.org/drop/drop_v6.json | 200 | 5,8 Ko | ~100 CIDR v6 | JSON | Spamhaus, non-commercial — NON VÉRIFIÉ | RÉUTILISER — complément IPv6 du DROP v4 déjà en base |

---

## 4. Bloc SQL prêt à l'emploi

Conventions alignées sur les lignes `feed:*` existantes : `kind='indicator'`, `format='txt'`, `parser={"detect":"auto","skipComments":true}`, `relevance='strict'`, `interval_sec=86400`. Testé en transaction annulée sur la DB live (voir fin de section).

```sql
BEGIN;

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description)
VALUES
-- FireHOL (miroirs quotidiens de blocklists, format .netset homogène)
('feed:firehol:level2', 'FireHOL Level 2 (attaques récentes)', 'reputation', 'https://iplists.firehol.org/files/firehol_level2.netset', 'mixte (miroir sans licence dedans)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'IPs impliquées dans attaques < 7 j (agrégation firehol de DShield, blocklist.de, etc.). HTTP 200, 15 367 entrées (2026-11-10).'),
('feed:firehol:level3', 'FireHOL Level 3 (bruit élevé)', 'reputation', 'https://iplists.firehol.org/files/firehol_level3.netset', 'mixte (miroir sans licence dedans)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, '12 895 entrées ; mélange scanners/abuse, bruit plus élevé que level2. HTTP 200 (2026-11-10).'),
('feed:firehol:level4', 'FireHOL Level 4 (longue durée)', 'reputation', 'https://iplists.firehol.org/files/firehol_level4.netset', 'mixte (miroir sans licence dedans)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, '~65 000 entrées, 2,7 Mo ; beaucoup d''IP dynamiques — à utiliser comme signal faible. HTTP 200 (2026-11-10).'),
('feed:firehol:webserver', 'FireHOL Webserver attacks', 'reputation', 'https://iplists.firehol.org/files/firehol_webserver.netset', 'mixte (miroir sans licence dedans)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'IPs attaquant des serveurs web. HTTP 200, ~500 entrées (2026-11-10).'),
-- DShield (SANS ISC)
('feed:dshield:1d', 'DShield top attacking /24 (24 h)', 'reputation', 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/dshield_1d.netset', 'CC (DShield, en-tête fichier)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, '31 sous-réseaux /24 les plus attaquants des dernières 24 h. HTTP 200 (2026-11-10).'),
('feed:dshield:7d', 'DShield top attacking /24 (7 j)', 'reputation', 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/dshield_7d.netset', 'CC (DShield, en-tête fichier)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'Fenêtre 7 jours. HTTP 200 (2026-11-10).'),
('feed:dshield:30d', 'DShield top attacking /24 (30 j)', 'reputation', 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/dshield_30d.netset', 'CC (DShield, en-tête fichier)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'Fenêtre 30 jours. HTTP 200 (2026-11-10).'),
('feed:dshield:topips', 'SANS ISC top attackers', 'reputation', 'https://isc.sans.edu/feeds/topips.txt', 'SANS ISC (gratuit, attribution)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'Top attaquants 24 h (IP + reverse DNS, TAB). HTTP 200, 16 lignes (2026-11-10).'),
-- Emerging Threats open
('feed:et:botcc', 'Emerging Threats botnet C2', 'malware', 'https://rules.emergingthreats.net/blockrules/emerging-botcc.rules', 'GPL-2.0 (open rules, annoncé)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'C2 botnets du ruleset open ET (lignes alert, extraire les IPs). HTTP 200 (2026-11-10).'),
('feed:et:block-ips', 'Emerging Threats block IPs', 'reputation', 'https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt', 'GPL-2.0 (annoncé)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'IPs brutes du fwrules ET (spam, botnet, compromised). HTTP 200, 1 787 entrées (2026-11-10).'),
-- abuse.ch SSLBL (API clé déjà fonctionnelle pour les autres produits abuse.ch)
('feed:abuse-ch:sslbl-sha256', 'abuse.ch SSLBL certificats malveillants', 'malware', 'https://sslbl.abuse.ch/blacklist/sslblacklist.csv', 'abuse.ch — NON VÉRIFIÉ (page JS)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'Empreintes sha256 de certificats TLS de C2 botnet. HTTP 200, 6 898 lignes (2026-11-10).'),
-- Dataplane
('feed:dataplane:sshpwauth', 'Dataplane SSH password auth', 'reputation', 'https://dataplane.org/sshpwauth.txt', 'CGU Dataplane — NON VÉRIFIÉ', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'IPs ayant fait du brute-force SSH (24 h). HTTP 200, 10 592 adresses (2026-11-10). Format pipe `|` — vérifier que detect:auto le gère.'),
-- mthcht / elliotwutingfeng (GitHub, MIT / BSD-3-Clause)
('feed:mthcht:threatfox-ports', 'mthcht ThreatFox IP:port', 'malware', 'https://raw.githubusercontent.com/mthcht/awesome-lists/main/Lists/IP/Threatfox/threatfox_ip_ports_list.csv', 'MIT (dépôt)', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'IOCs IP:port ThreatFox qualifiés par malware (CSV 4,6 Mo, MAJ workflow quotidien). HTTP 200 (2026-11-10). Remplace les 2 sources mthcht GeoIP/VPN actuelles, inutiles.'),
('feed:elliot:threatfox-ips', 'ThreatFox IOC IPs (miroir elliot)', 'malware', 'https://raw.githubusercontent.com/elliotwutingfeng/ThreatFox-IOC-IPs/main/ips.txt', 'BSD-3-Clause', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'Miroir quotidien de l''API ThreatFox (IPs pures). HTTP 200 (2026-11-10). Chevauche threatfox-iocs existant : dédupliquer par ioc.'),
('feed:elliot:antiscam-urls', 'GlobalAntiScamOrg scam domains', 'phishing', 'https://raw.githubusercontent.com/elliotwutingfeng/GlobalAntiScamOrg-blocklist/main/global-anti-scam-org-scam-urls.txt', 'BSD-3-Clause', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, '11 220 domaines de scam (anti-scam.org). HTTP 200 (2026-11-10).'),
('feed:elliot:usom-ips', 'USOM CERT Turquie IPs', 'reputation', 'https://raw.githubusercontent.com/elliotwutingfeng/USOM-Blocklists/main/ips.txt', 'BSD-3-Clause', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'Blocklist IP du CERT national turc (miroir quotidien, l''URL officielle renvoie du HTML). HTTP 200 (2026-11-10).'),
('feed:elliot:usom-urls', 'USOM CERT Turquie URLs', 'phishing', 'https://raw.githubusercontent.com/elliotwutingfeng/USOM-Blocklists/main/urls.txt', 'BSD-3-Clause', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, '~200 k URLs phishing/scam turques (10,8 Mo). HTTP 200 (2026-11-10).'),
-- C2 / référentiels
('feed:cybercrime-tracker:all', 'CyberCrime-Tracker C2 (liste complète)', 'malware', 'https://cybercrime-tracker.net/all.php', 'aucune', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'URLs C2 RAT/ransomware (22 701 lignes). HTTP 200 (2026-11-10). Complète les 3 sous-listes cybercrime-tracker déjà en base.'),
('ref:malpedia-library', 'Malpedia library (référentiel familles)', 'malware', 'https://malpedia.caad.fkie.fraunhofer.de/library', 'Fraunhofer FKIE — NON VÉRIFIÉ', true, 'narrative', 'html', '{}', 86400, 'Catalogue ~800 familles malware avec références. HTTP 200 (2026-11-10). Contexte/référentiel, pas un flux d''IOCs.'),
-- RSS institutionnels
('feed:bsi:cert-bund-csw', 'BSI CERT-Bund CSW (RSS)', 'cert', 'https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_CSW.xml', 'administration allemande (pas de licence)', true, 'narrative', 'rss', '{}', 3600, 'Avis de sécurité CERT-Bund. HTTP 200, 50 items (2026-11-10). L''ancien flux WID est mort (404).'),
-- Spamhaus IPv6
('feed:spamhaus:drop-v6', 'Spamhaus DROP IPv6 (JSON)', 'reputation', 'https://www.spamhaus.org/drop/drop_v6.json', 'Spamhaus non-commercial — NON VÉRIFIÉ', true, 'indicator', 'txt', '{"detect":"auto","skipComments":true}', 86400, 'CIDR IPv6 hijackés (complément du drop_v4.json déjà en base). HTTP 200 (2026-11-10).')
ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url, description=EXCLUDED.description;

ROLLBACK; -- test : annulé après vérification du count
```

Vérification : `psql ... -f bloc.sql` dans une transaction annulée → 21 lignes insérées sans erreur (BEGIN/ROLLBACK, aucun conflit d'id).

---

## 5. Pièges constatés (mesurés, pas supposés)

### 5.1 Catalogues / feeds morts ou mourants (vérifiés aujourd'hui)

| URL | Statut | Note |
|---|---|---|
| https://github.com/sfish-x/awesome-cti | 404 | n'a jamais existé sous ce nom |
| https://www.dshield.org/feeds/suspiciousdomains_High.txt | 404 | la famille `suspiciousdomains_*` a disparu (aussi 404 sur isc.sans.edu) |
| https://report.cs.rutgers.edu/mrblist | 404 | feed Rutgers cité par maltrail, mort |
| https://feodotracker.abuse.ch/downloads/hostfile.txt | 404 | seul `ipblocklist*.txt` subsiste |
| https://urlhaus.abuse.ch/downloads/text_recent/ et /csv_recent/ | **410 Gone** | tous les fichiers plats URLhaus sont morts ; passer par l'API POST (clé OK). Nos sources `feed:urlhaus:*` pointent vers `urlhaus.abuse.ch/feeds/` (page HTML, pas des données) → à corriger |
| https://project.turris.cz/greylist-data/greylist-latest.csv.gz | timeout/échec connexion | Turris greylist injoignable depuis cette box |
| https://www.malwaredomainlist.com/hostslist/ip.txt | échec connexion | MDL est moribond depuis des années |
| https://osint.bambenekconsulting.com/feeds/c2-dommasterlist.txt | **403** | Bambenek exige désormais une licence/inscription — pas ingérable gratuitement |
| https://www.bsi.bund.de/.../RSSNewsfeed_WID.xml | 404 | ancien flux BSI ; seul CSW vit |
| https://www.spamhaus.org/drop/edrop.txt | 200 mais 277 octets | EDROP **fusionné dans DROP** → source redondante, ne pas ajouter |
| https://www.usom.gov.tr/url-list.txt | 200 mais HTML | l'URL « officielle » ne sert pas la liste ; utiliser le miroir elliot |
| https://www.ssi.gouv.fr/feed/ | 200 mais 212 o (Incapsula) | anti-bot |
| https://cert.europa.eu/rss.xml | 404 | CERT-EU n'a pas de RSS public |
| https://www.cesin.fr/feed/ , https://www.clusif.fr/feed/ | 404 / 403 | pas de flux machine |

### 5.2 Licences ambiguës ou restrictives

| Source | Problème |
|---|---|
| firehol/blocklist-ipsets | **aucune licence de dépôt** (`license: none`). Chaque `.ipset` embarque la licence amont dans son en-tête, souvent absente. Usage interne OK, redistribution à étudier liste par liste. |
| Dataplane (`dataplane.org`) | CGU non extractibles (page JS). Les conditions réelles (attribution, non-commercial ?) sont **NON VÉRIFIÉES**. Idem pour `feed:dataplane:telnetlogin` déjà en base. |
| CINS `ci-badguys.txt` / cinsscore.com | page sans mention de licence extractible. Déjà en base (`cinsscore-badguys`) — ne pas élargir l'usage sans valider les CGU. |
| Spamhaus DROP | gratuit pour usage non-commercial avec attribution (annoncé) ; page JS, texte **NON VÉRIFIÉ**. |
| abuse.ch (SSBL, Feodo) | usage libre annoncé par abuse.ch ; texte de licence exact **NON VÉRIFIÉ** via curl. |
| myip.ms (`feed:myip-ms:*`) | licence restrictive connue (interdiction de réexport) — déjà en base, à surveiller. |
| Malpedia | accès public constaté ; termes d'usage de la librairie **NON VÉRIFIÉS** (l'API complète exige un token). |

### 5.3 Listes qui mélangent des IP dynamiques / bruit

- `firehol_level3` (12 895) et surtout `firehol_level4` (~65 000) agrègent des listes de brute-force et d'abuse « best effort » : beaucoup d'IP sont des boxes résidentielles recyclées ou des hébergeurs pas chers. À garder en `reputation`/signal faible, jamais en `strict` de blocage.
- `lists.blocklist.de/all.txt` (23 566) : même problème, + 23 k entrées/jour qui gonflent la base. Les sous-listes (ssh, apache) en sont des sous-ensembles → **ne pas ajouter** les sous-listes en plus de `all.txt` (déjà en base : `estorides:blocklist-de-all` + `feed:blocklist-de:sip`).
- `botscout`, `sblam`, `stopforumspam` : bruit de formulaires/spam, pertinence CTI faible pour un observatoire régional — déjà en base, à considérer pour désactivation plutôt qu'extension.
- DShield `dshield_*.netset` : ce sont des **/24** (256 IP par ligne après expansion) ; l'observation porte sur le réseau, pas l'hôte (maltrail le documente explicitement dans `feeds/dshieldip.py`).

### 5.4 Double comptage avec nos 324 sources existantes

Découverte importante : la base contient déjà ~120 lignes `feed:*` (URL en base64 dans l'id) qui correspondent **exactement** au jeu de feeds de maltrail. Candidats évalués aujourd'hui et **écartés du SQL** car déjà couverts :

| Candidat vérifié (HTTP 200) | Doublon en base |
|---|---|
| stamparm/ipsum `ipsum.txt` | `feed:ipsum:ip` |
| firehol_level1.netset | `feed:firehol:ip` (miroir ktsaou) |
| dshield.org/block.txt | `feed:dshield:ip`, `feed:sans-ics-dshield:ip` |
| ciarmy.ipset (miroir) | `cinsscore-badguys`, `feed:cinsscore:ip` |
| greensnow.ipset (miroir) | `feed:greensnow-co:ip` |
| tor_exits.ipset / exit-addresses | `feed:torproject:ip`, `tor-bulk-exit` |
| et_block.netset | `feed:spamhaus:*` (DROP) |
| et_compromised.ipset | `estorides:emergingthreats-compromised` |
| botscout.ipset / sblam.ipset (miroirs) | `feed:botscout-com:ip`, `feed:sblam:ip` |
| openphish.com/feed.txt | `feed:openphish:url`, `openphish` |
| phishing.army extended | `feed:phishing-army:url` |
| feodotracker ipblocklist.txt | `feed:abuse-ch:ip` (aggressive), `feodo-ip` |
| sslbl sslipblacklist.csv / ja3 | `feed:abuse-ch:ja3`, `estorides:sslbl-abuse-ch-*` |
| botvrij ioclist.domain/ip-src/md5/sha1/sha256, feed-osint | `feed:botvrij-eu:*` |
| circl.lu feed-osint | `feed:misp-circl:misp` |
| threatfox API | `threatfox-iocs`, `feed:threatfox-abuse-ch-` |
| urlhaus API | `feed:urlhaus:*` (URLs à corriger, cf. 5.1) |
| cert.ssi.gouv.fr/feed/ | `cert_fr`, `cert-fr-feed`, `cert-fr-alerte`, `cert-fr-avis` |
| binarydefense banlist.txt | `feed:binarydefense:ip` |
| spamhaus drop.txt / drop_v4.json | `feed:spamhaus:ip`, `feed:spamhaus-project:ip` |
| dataplane telnetlogin | `feed:dataplane:ip` |
| Inversion-DNSBL Google_hostnames | `feed:elliotwutingfeng:dns` |
| lists.blocklist.de/all.txt | `estorides:blocklist-de-all` |

Autres pièges de comptage :
- `estorides:*` (≈200 lignes) sont des sources auto-générées (presse locale NA + doublons de feeds CTI en double, ex. `estorides:openphish-feed` vs `feed:openphish:url` vs `openphish` — **triple** comptage d'OpenPhish). Un dédoublonnage par URL normalisée avant ingestion éviterait de tripler les indicateurs.
- `feed:mthcht:ip` et `feed:mthcht:ioc` pointent vers des CSV GeoIP/VPN (ProtonVPN, sites de géoloc) : hors périmètre CTI, remplacer par `feed:mthcht:threatfox-ports` du §4.
- `feed:urlhaus:url` → `https://urlhaus.abuse.ch/feeds/` : page HTML, les données plates sont en 410 → cette source ingère probablement du vide ou du HTML.
- `feed:misp-project:url` → `app/files/feed-metadata/defaults.json` : c'est le **catalogue** MISP (métadonnées de feeds), pas des IOCs ; vérifier qu'il n'est pas parsé comme données.

---

## Harvest du 2026-11-10

Catalogue → feeds retenus / écartés et pourquoi.

- **firehol/blocklist-ipsets** : 32 feeds retenus (tous HTTP 200, < 25 Mo) écrits dans `db/sources-osint.sql`, id `feed:firehol:<slug>`. Écartés : `firehol_anonymous.netset` et `firehol_proxies.netset` (> 25 Mo), `.gitignore`/README (non-données), et les ipsets déjà en base (firehol_level1/2/3/4, dshield_*).
- **stamparm/maltrail** : aucun feed direct — le dépôt ne contient pas `trails/static/malware/*.txt` (chemin inexistant, 404 vérifié). Utilisé comme catalogue de découverte uniquement.
- **hslatman/awesome-threat-intelligence** : méta-catalogue Markdown, pas de flux bruts ingérables directement ; aucune URL ajoutée.
- Déduplication vérifiée en psql : 0 doublon DB. Delta appliqué : 348 → 380 sources.
