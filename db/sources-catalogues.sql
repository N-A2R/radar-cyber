-- Catalogues clearnet cyber — flux testés le 2026-11-10.
--
-- Objectif : ajouter des flux clearnet cyber réellement producteurs pour
-- renforcer la couverture CTI / CERT / vulnérabilités (aucune veille
-- aviation/maritime/météo, aucun flux non testé).
--
-- Méthode : chaque URL sondée avant insertion (curl, GET, User-Agent explicite),
-- code HTTP, Content-Type, nombre d'items réels du flux et 3 titres relevés.
-- Seuls les candidats HTTP 200 avec contenu cyber exploitable sont retenus.
--
-- Compatibilité collecteur : flux RSS/Atom, kind='narrative', parser='{}'
-- (format générique). Idempotent : ON CONFLICT (id) DO NOTHING.
-- enabled=true car toutes les sondes ci-dessous ont réussi.

INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description)
VALUES
-- CERT / CSIRT nationaux et institutionnels (Europe)
('cat-ncsc-nl-news',
 'NCSC-NL Nieuws',
 'cert',
 'https://feeds.ncsc.nl/nieuws.rss',
 'publication gouvernementale (NCSC-NL), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/xml; charset=utf-8, items=385. Titres: « Kwetsbaarheden in SonicOS van SonicWall met actief misbruik: update nu » ; « Cybersecuritybeeld 2026: AI versnelt en vergroot de dreiging » ; « Kwetsbaarheid in Microsoft Windows Paint met risico op misbruik ».'),

('cat-ncsc-nl-advisories',
 'NCSC-NL Beveiligingsadviezen',
 'vuln',
 'https://advisories.ncsc.nl/rss/advisories',
 'publication gouvernementale (NCSC-NL), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/xml, items=25. Titres: « NCSC-2026-0353 [1.03] [M/H] Kwetsbaarheden verholpen in Microsoft Windows » ; « NCSC-2026-0477 [1.00] [M/H] Kwetsbaarheden verholpen in Microsoft Exchange server » ; « NCSC-2026-0476 [1.00] [M/H] Kwetsbaarheden verholpen in Microsoft SQL Server ».'),

('cat-cert-pl',
 'CERT Polska',
 'vuln',
 'https://cert.pl/en/rss.xml',
 'publication CERT Polska (NASK), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Sondé 2026-11-10 HTTP 200, Content-Type text/xml, items=100. Titres: « Vulnerabilities in WidzialniCMS software » ; « Vulnerability in KAMSOFT ZSIRep CLIENT library » ; « Vulnerabilities in Request Tracker and RT for Incident Response software ».'),

('cat-cert-se',
 'CERT-SE (MSB) Feed',
 'cert',
 'https://www.cert.se/feed.rss',
 'publication gouvernementale (CERT-SE/MSB), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml, items=10. Titres: « NCSC – CERT-SE veckobrev v.45 » ; « EU varnar för cyberincidenter i kyl- och fryssystem » ; « Cyberangrepp mot uppkopplade kyl- och fryssystem ».'),

('cat-cert-lv',
 'CERT.LV (All)',
 'cert',
 'https://cert.lv/en/feed/rss/all',
 'publication CERT.LV, diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=utf-8, items=18. Titres: « Latvia and Canada Hold Fifth Joint Threat Hunting Workshop » ; « CyberChess 2026 brings the international cybersecurity community together in Riga » ; « CERT.LV activity review Q2 2026 ».'),

('cat-cert-ee',
 'CERT-EE / RIA News',
 'cert',
 'https://www.ria.ee/en/news-feed/all/feed',
 'publication RIA/CERT-EE, diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=utf-8, items=100. Titres: « October in cyberspace: disruptions in e-services, data breaches, and critical security vulnerabilities » ; « Reporting scam sites helps to prevent further victims » ; « September in cyberspace: data breaches and disruptions to government e-services ».'),

('cat-cert-at-warnings',
 'CERT.at Warnings',
 'cert',
 'https://cert.at/cert-at.de.warnings.rss_2.0.xml',
 'publication CERT.at, diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Sondé 2026-11-10 HTTP 200, Content-Type text/xml, items=50. Titres: « Kritische Sicherheitslücken in PHP - Updates verfügbar » ; « Kritische Sicherheitslücke in Cisco Secure Email Gateway - aktiv ausgenutzt - Updates verfügbar - CVE-2026-76519 » ; « Weitere kritische Sicherheitslücke in Citrix NetScaler ADC und NetScaler Gateway - Updates verfügbar ».'),

('cat-cert-at-blog',
 'CERT.at Blog',
 'cert',
 'https://cert.at/cert-at.de.blog.rss_2.0.xml',
 'publication CERT.at, diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type text/xml, items=50. Titres: « Kühlanlagenmanipulationen: Zweite Runde » ; « In Frankreich wurden Kühlanlagen manipuliert – geht das auch bei uns? » ; « Aktueller Stand rund um "FortiBleed" ».'),

('cat-dnsc-ro',
 'DNSC Romania (CERT-RO) News',
 'cert',
 'https://dnsc.ro/feed',
 'publication DNSC (Roumanie), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type text/xml; charset=utf-8, items=10. Titres: « ALERTĂ: Vulnerabilități critice exploatate activ în Synology » ; « Știrile săptămânii din cybersecurity (05.11.2026) » ; « UPDATE ALERTĂ: Incident de securitate ce vizează vulnerabilități ale unor instalații frigorifice ».'),

('cat-cert-hr',
 'CERT.hr News',
 'cert',
 'https://www.cert.hr/feed/',
 'publication CERT.hr (CARNET), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=UTF-8, items=10. Titres: « O kibernetičkim incidentima u rashladnim sustavima diljem Europske unije » ; « CARNET-ov Nacionalni CERT upozorava: Uoči Crnog petka pripazite na lažne internetske trgovine i prijevare » ; « Rezultati natjecanja Hacknite 2026 ».'),

('cat-cert-si-news',
 'SI-CERT News (EN)',
 'cert',
 'https://www.cert.si/en/category/news/feed/',
 'publication SI-CERT, diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=UTF-8, items=10. Titres: « CVE-2026-25600 — Credential Exposure Vulnerability in Trac PDBM » ; « CVE-2026-25599 – Missing authentication and clear‑text data transmission of Orca heat pumps » ; « CVE-2025-42611 – Authentication bypass in multiple RouterOS services caused by improper certificate validation ».'),

-- Institutionnel UE / coordination
('cat-cert-eu-sa',
 'CERT-EU Security Advisories',
 'vuln',
 'https://cert.europa.eu/publications/security-advisories-rss',
 'publication CERT-EU (institutions UE), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type text/xml; charset=utf-8, items=10. Titres: « 2026-018: Critical Vulnerabilities in PHP » ; « 2026-019: Critical Vulnerability in GitLab Community and Enterprise Editions » ; « 2026-017: Critical Vulnerability in Cisco Secure Email Gateway ».'),


-- (cat-cert-eu-ti omis : URL https://cert.europa.eu/publications/threat-intelligence-rss
--  déjà en base via estorides:cert-eu-security-advisories. Sonde 2026-11-10 : HTTP 200,
--  text/xml; charset=utf-8, items=10. Titres : « Cyber Brief 26-11 - October 2026 » ;
--  « Cyber Brief 26-10 - September 2026 » ; « Cyber Brief 26-09 - August 2026 ». Non réinséré
--  pour éviter doublon d'URL.)

('cat-circl-news',
 'CIRCL Luxembourg News',
 'cti',
 'https://www.circl.lu/rss.xml',
 'publication CIRCL (Luxembourg), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/xml, items=20. Titres: « TR-102 Critical Remote Code Execution Vulnerabilities in PHP - CVE-2026-109618 and CVE-2026-109619 » ; « Publications and Presentations » ; « CIRCL ».'),

-- Advisories vulnérabilités / produits (industrie & communauté)
('cat-cisa-ics-advisories',
 'CISA ICS Advisories',
 'vuln',
 'https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml',
 'publication gouvernementale US (CISA), domaine public',
 false, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=utf-8, items=30. Titres: « Subnet Solutions PowerSYSTEM Center » ; « Hitachi Energy TRO600 series products » ; « Hitachi Energy CoreTec Product ».'),

('cat-cisa-ics-medical',
 'CISA ICS Medical Advisories',
 'vuln',
 'https://www.cisa.gov/cybersecurity-advisories/ics-medical-advisories.xml',
 'publication gouvernementale US (CISA), domaine public',
 false, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=utf-8, items=30. Titres: « InterSystems Corporation InterSystems IRIS for Health » ; « J4Care dcm4che » ; « Thermo Fisher Torrent Suite Software ».'),

('cat-jpcert-blog',
 'JPCERT/CC Blog (EN)',
 'cti',
 'https://blogs.jpcert.or.jp/en/atom.xml',
 'publication JPCERT/CC, diffusion publique',
 false, true, 'narrative', 'atom', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/xml, items=15. Titres: « Recent AI-Assisted Cyber Attacks in Japan: Investigating Attack Infrastructure and Techniques » ; « TSUBAME Report Overflow (Apr-Jun 2026) » ; « TSUBAME Report Overflow (Jan-Mar 2026) ».'),

('cat-tenable-blog',
 'Tenable Blog',
 'vuln',
 'https://www.tenable.com/blog/feed',
 'publication éditeur (Tenable), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=utf-8, items=10. Titres: « Microsoft’s November 2026 Patch Tuesday addresses 1093 CVEs (CVE-2026-124194) » ; « U.S. urges critical infrastructure orgs to secure refrigeration systems ASAP after EU supermarket and blood bank attacks » ; « php2shell one week later: Why one exploit doesn’t work everywhere ».'),

('cat-qualys-blog',
 'Qualys Blog / Threat Research',
 'vuln',
 'https://blog.qualys.com/feed',
 'publication éditeur (Qualys), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=UTF-8, items=10. Titres: « Microsoft Patch Tuesday, November 2026 Security Update Review » ; « The Expanding Attack Surface Demands a New Operating Model » ; « Cloud Agent, now in a Container: Host Security for Nodes You Can’t Touch ».'),

('cat-drupal-sa',
 'Drupal Security Advisories',
 'vuln',
 'https://www.drupal.org/security/rss.xml',
 'publication Drupal.org, diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=utf-8, items=50. Titres: « Drupal core - Moderately critical - Cross-site scripting - SA-CORE-2026-016 » ; « Drupal core - Moderately critical - Cross-site scripting - SA-CORE-2026-015 » ; « Drupal core - Critical - Remote code execution - SA-CORE-2026-014 ».'),

('cat-aws-security-bulletins',
 'AWS Security Bulletins',
 'vuln',
 'https://aws.amazon.com/security/security-bulletins/rss/feed/',
 'publication éditeur (AWS), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml;charset=utf-8, items=43. Titres: « Issue in the Linux kernel virtio-net/TAP networking path affecting KVM-based hypervisors » ; « CVE-2026-119085 - Template injection in the publishing component of Virtual Engineering Workbench » ; « CVE-2026-121652 - Stored cross-site scripting (XSS) in AWS Amplify maplibre-gl-js-amplify popup rendering ».'),

-- CTI / recherche / blogs sécurité producteurs
('cat-schneier-security',
 'Schneier on Security',
 'cti',
 'https://www.schneier.com/feed/atom/',
 'blog personnel (Bruce Schneier), diffusion publique',
 false, true, 'narrative', 'atom', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/atom+xml; charset=UTF-8, items=10. Titres: « New OpenSSH Vulnerability » ; « AI Security » ; « Friday Squid Blogging: New Jurassic Squid Predecessors ».'),

('cat-bitdefender-labs',
 'Bitdefender Labs',
 'cti',
 'https://www.bitdefender.com/blog/api/rss/labs/',
 'publication éditeur (Bitdefender Labs), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type text/xml; charset=utf-8, items=15. Titres: « GhostMap: The Android flaw that crashes your phone before you open the app » ; « The phone was compromised before the user turned it on: the rise of Midnight Mimosa » ; « Fake Xeno Roblox Cheats Deliver Powerful Java Stealer Through Discord and Forums ».'),

('cat-sentinelone-labs',
 'SentinelOne Labs',
 'cti',
 'https://www.sentinelone.com/labs/feed/',
 'publication éditeur (SentinelOne Labs), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=utf-8, items=10. Titres: « VerifiedIDA | Making LLM-Driven Reverse Engineering Inspectable, Continuable and Reusable » ; « Defrost and Disrupt | An Assessment of Europe’s Refrigeration Attacks » ; « LABScon26 Replay | Keynote: A Sober Analysis of AI Impact ».'),

('cat-huntress-blog',
 'Huntress Blog',
 'cti',
 'https://www.huntress.com/blog/rss.xml',
 'publication éditeur (Huntress), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/xml, items=754. Titres: « N-able Disables Cloud Services Following Disclosure of "Able2Shell" Exploit Chains » ; « Inside an AhsayCBS Intrusion: Hidden Webshells, a CryptoMiner, and a C2 Implant » ; « Sasha Roshan Takes Security Education Beyond the Demo ».'),

('cat-elastic-security-labs',
 'Elastic Security Labs',
 'cti',
 'https://www.elastic.co/security-labs/rss/feed.xml',
 'publication éditeur (Elastic Security Labs), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 7200,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/xml; charset=utf-8, items=310. Titres: « Modernising threat hunting: Using Semantic Search to Find Risky AI Agent Behavior » ; « When trust becomes the payload: Inside the threats, etc quarterly report » ; « Kernel eviction notice: What wesp.sys reveals about the Windows Endpoint Security Platform ».'),

('cat-gbhackers',
 'GBHackers Security News',
 'cti',
 'https://gbhackers.com/feed/',
 'média cyber (GBHackers), diffusion publique',
 false, true, 'narrative', 'rss', '{}'::jsonb, 3600,
 'Sondé 2026-11-10 HTTP 200, Content-Type application/rss+xml; charset=UTF-8, items=10. Titres: « Weekly Cybersecurity Newsletter – Top 50 Biggest Cybersecurity Stories of the Week » ; « One Identity Unveils Safeguard 9.0 for Simpler PAM » ; « One Identity Unveils Active Roles 8.6 with Enhanced Security and Administration ».')

ON CONFLICT (id) DO NOTHING;

-- Écartées après sonde (2026-11-10, aucune ligne insérée) :
--   https://threatfox.abuse.ch/export/json/recent/          410 Gone — endpoint retiré.
--   https://urlhaus.abuse.ch/downloads/csv_recent/          410 Gone — endpoint retiré.
--   https://bazaar.abuse.ch/export/csv/recent/              410 Gone — endpoint retiré.
--   https://sslbl.abuse.ch/blacklist/sslblacklist.csv       000 (injoignable au moment du test) — non retenu.
--   https://blog.google/threat-analysis-group/rss/          404 — flux absent.
--   https://www.mandiant.com/resources/blog/rss.xml         200 mais HTML (non RSS) — PARSE_ERR.
--   https://blog.rapid7.com/rss/                            200 mais XML mal formé — PARSE_ERR.
--   https://www.fortinet.com/blog/threat-research.rss       404.
--   https://news.sophos.com/en-us/feed/                     301 vers contenu non exploitable en direct — non retenu.
--   https://www.bsi.bund.de/.../RSSNewsfeed_WID.xml         404.
--   https://wid.cert-bund.de/.../securityAdvisory/rss       200 mais URL déjà présente (estorides:cert-bund-advisories).
--   https://www.kyberturvallisuuskeskus.fi/en/rss.xml       404.
--   https://www.mozilla.org/en-US/security/advisories/mfsa/feed/ 404.
--   https://access.redhat.com/security/data/csaf/v2/advisories/index.json 404.
--   https://source.android.com/docs/security/bulletin/index.xml 404.
--   https://www.enisa.europa.eu/news/rss.xml                404/mal formé.
--   https://www.usom.gov.tr/rss/duyuru.xml                  200 HTML challenge — non parseable.
--   https://csirt.gov.it/feed                               403.
--   https://cert.europa.eu/publications/threat-intelligence-rss 200, items=10, cyber OK mais URL déjà présente en base (estorides:cert-eu-security-advisories) — non réinsérée.
--   https://api.msrc.microsoft.com/cvrf/v3.0/updates        200 JSON (204 items, type index updates, titres = IDs mensuels) — non retenu car format API/index peu adapté au parsing narratif générique sans parser dédié.
--   https://ubuntu.com/security/notices/rss.xml             200 mais URL déjà présente (estorides:ubuntu-security-notices).
--   https://www.debian.org/security/dsa                     200 mais 0 item.
