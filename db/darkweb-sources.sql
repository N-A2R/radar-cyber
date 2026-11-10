-- Chantier 2 : couverture revendications & canaux (harvest du 2026-11-10)
-- Objectif : élargir la couverture « sites, canaux, actus, revendications ».
-- Chaque URL a été mesurée par curl le 2026-11-10 (code HTTP + taille notés en description).
-- Aucun .onion. Déduplication : ON CONFLICT (id) DO NOTHING.
-- kind='quarantine' : source de revendications (sites de fuite, canaux de leaks,
--   agrégateurs de leaks) -> ne PAS ingérer comme « event » direct ; le collecteur
--   générique doit les exclure et un collecteur de quarantaine doit les lire.
-- kind='narrative' : actus, trackers, flux CTI.

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description) VALUES
-- 1. Sites de fuite des rançongiciels (pages de revendication publiques, sans .onion)
('ransomleak-netleaks','NetLeaks (Bjorka)','ransomware','https://netleaks.net/','public, diffusion publique',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=10733 ; page de revendication de Bjorka (base de données à vendre, renvoie vers Telegram)'),
('ransomleak-antibrok3rs','AntiBrok3rs','ransomware','https://antibrok3rs.bearblog.dev/','public, diffusion publique',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=10165 ; blog « Leaking the Leakers », revendications AntiBrok3rs'),
('ransomleak-lapsus','LAPSUS$','ransomware','https://lapsus.ar.io','public, diffusion publique',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=14987 ; déclaration PGP signée du groupe LAPSUS$, revendications'),
('ransomleak-fulcrumsec','FulcrumSec','ransomware','https://fulcrumsec.vg/','public, diffusion publique',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=13246 ; index de victimes de FulcrumSec (« The Hardcoded Horror Show »)'),
('ransomleak-soulgroup','Soul Group','ransomware','https://codice-ledger.io/','public, diffusion publique',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=10118 ; organisation et répertoire de victimes du groupe Soul'),
('ransomleak-toufan','Cyber Toufan','ransomware','https://toufanleaks.org/','public, diffusion publique',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=45813 ; blog de fuite de Cyber Toufan'),
('ransomleak-leakeddata','Leaked Data','ransomware','https://business-data-leaks.com','public, diffusion publique',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=3222 ; site « LEAKED DATA » de publication de fuites'),

-- 2. Canaux Telegram publics (t.me/s/, HTTP 200, extraits relevés le 2026-11-10)
('tg-leaked-databases','Telegram Leaked Databases','ransomware','https://t.me/s/leaked_databases','Telegram public channel',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=109395 ; 21 messages publics ; extrait : « DEA Investigating Breach of Law Enforcement Data Portal »'),
('tg-snatch-news','Telegram Snatch Team','ransomware','https://t.me/s/snatch_news','Telegram public channel',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=87495 ; 20 messages publics ; extrait : « Lootah Group data added 3.6 GB »'),
('tg-baseleeak','Telegram BaseLeak','ransomware','https://t.me/s/baseleeak','Telegram public channel',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=167858 ; 20 messages publics ; extrait : « INCIDENT: TOASTTAB.COM … Ransomware group Clop »'),
('tg-ransomwareg','Telegram BLACKNET-00 Ransomware','ransomware','https://t.me/s/Ransomwareg','Telegram public channel',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=79071 ; 11 messages publics ; extrait : « We successfully hacked the government run NIKDU Institute and stole 483 GB of sensitive data »'),
('tg-marketo-leaks','Telegram Marketo Leaks','ransomware','https://t.me/s/marketo_leaks','Telegram public channel',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=108735 ; 20 messages publics ; extrait : « The Brokerage Land Co 1Gb of data is uploaded »'),
('tg-cvenotify','Telegram CVE Notify','cti','https://t.me/s/cveNotify','Telegram public channel',true,'narrative','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=114713 ; 20 messages publics ; extrait : « CVE-2026-111822 … Apache ActiveMQ »'),
('tg-darkfeednews','Telegram DarkFeedNews','cti','https://t.me/s/DarkfeedNews','Telegram public channel',true,'narrative','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=111879 ; 20 messages publics ; extrait : « New Threat Intelligence Alert! Malaysian Government Employee Records Containing PII Leaked »'),
('tg-itsecalert','Telegram IT Security Alerts','cti','https://t.me/s/itsecalert','Telegram public channel',true,'narrative','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=114706 ; 19 messages publics ; extrait : « Firefox Information Exposure »'),
('tg-aptanalysis','Telegram APT Analysis','cti','https://t.me/s/APTANALYSIS','Telegram public channel',true,'narrative','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=171183 ; 21 messages publics ; extrait : « Threat Intelligence Report: APT35 Internal Leak of Hacking Campaigns »'),
('tg-techpwnews','Telegram TechPwnews','cti','https://t.me/s/techpwnews','Telegram public channel',true,'narrative','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=115198 ; 20 messages publics ; extrait : « A mistake in the bulletproofs paper could have led to the theft of millions of dollars »'),

-- 3. Trackers et agrégateurs publics
('ransom-coveware-feed','Coveware ransomware feed','ransomware','https://www.coveware.com/feed','Coveware, diffusion publique',true,'narrative','rss','{}'::jsonb,21600,'Vérifié 2026-11-10 HTTP 200 size=209126 ; flux RSS des rapports et analyses ransomware de Coveware'),
('ransom-nomoreransom','No More Ransom','ransomware','https://www.nomoreransom.org/','No More Ransom, diffusion publique',true,'narrative','html','{}'::jsonb,86400,'Vérifié 2026-11-10 HTTP 200 size=22129 ; portail des outils de déchiffrement et de prévention ransomware'),
('ransom-emsisoft-decrypt','Emsisoft ransomware decryption','ransomware','https://www.emsisoft.com/en/ransomware-decryption/','Emsisoft, diffusion publique',true,'narrative','html','{}'::jsonb,86400,'Vérifié 2026-11-10 HTTP 200 size=189597 ; catalogue des outils de déchiffrement Emsisoft'),
('ransom-look-leaks','RansomLook Leaks','ransomware','https://www.ransomlook.io/leaks','RansomLook, diffusion publique',true,'quarantine','html','{}'::jsonb,21600,'Vérifié 2026-11-10 HTTP 200 size=1790783 ; annuaire public des fuites (RansomLook), agrégé et dédupliqué'),
('ransom-ichi-ecosystem','ICHI Adversary Ecosystem','ransomware','https://ichi.global/ecosystem.html','ICHI, diffusion publique',true,'quarantine','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=25211 ; activité de leak récente fusionnée depuis ransomware.live et ransomlook'),
('ransom-securityalert','SecurityAlert.ai Ransomware Tracker','ransomware','https://securityalert.ai/ransomware','SecurityAlert.ai, diffusion publique',true,'narrative','html','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=48367 ; tracker live des victimes ransomware (source ransomware.live)'),
('ransom-binaryresponse','Binary Response Ransomware Groups Tracker','ransomware','https://binary-response.com/threat-intel/ransomware-groups.html','Binary Response, diffusion publique',true,'narrative','html','{}'::jsonb,21600,'Vérifié 2026-11-10 HTTP 200 size=56740 ; tracker de 90 groupes ransomware et statut de leurs DLS'),

-- 4. Actus (flux RSS/JSON de veille cyber absents de la base)
('actu-cybersecuritydive','Cybersecurity Dive','cti','https://www.cybersecuritydive.com/feeds/news/','Cybersecurity Dive, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=8206 ; flux RSS d’actualité cybersécurité'),
('actu-infosecurity-magazine','Infosecurity Magazine','cti','https://www.infosecurity-magazine.com/rss/news/','Infosecurity Magazine, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=132135 ; flux RSS d’actualité cybersécurité'),
('actu-helpnetsecurity','Help Net Security','cti','https://www.helpnetsecurity.com/feed/','Help Net Security, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=18576 ; flux RSS d’actualité cybersécurité'),
('actu-securityaffairs','Security Affairs','cti','https://securityaffairs.co/wordpress/feed','Security Affairs, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=82767 ; flux RSS d’actualité cybersécurité'),
('actu-itsecurityguru','IT Security Guru','cti','https://www.itsecurityguru.org/feed/','IT Security Guru, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=157702 ; flux RSS d’actualité cybersécurité'),
('actu-cybernews','CyberNews','cti','https://cybernews.com/feed/','CyberNews, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=27541 ; flux RSS d’actualité cybersécurité'),
('actu-hackread','HackRead','cti','https://www.hackread.com/feed/','HackRead, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=11580 ; flux RSS d’actualité cybersécurité'),
('actu-welivesecurity','WeLiveSecurity (ESET)','cti','https://www.welivesecurity.com/feed/','ESET WeLiveSecurity, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=70099 ; flux RSS de recherche ESET'),
('actu-crowdstrike','CrowdStrike Blog','cti','https://www.crowdstrike.com/blog/feed/','CrowdStrike, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=5253 ; flux RSS du blog CrowdStrike'),
('actu-zdnet-security','ZDNet Security','cti','https://www.zdnet.com/topic/security/rss.xml','ZDNet, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200 size=24924 ; flux Atom de la rubrique sécurité')
ON CONFLICT (id) DO NOTHING;
