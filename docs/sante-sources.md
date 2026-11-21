# Santé des sources — historique 12 semaines

Généré le 2026-11-21T18:20:48.406Z par `scripts/sante-sources-historique.mts`.

**Fenêtre.** 2026-08-31 au 2026-11-22 (semaines calendaires UTC, lundi → dimanche, semaine en cours incluse).

**Règle de détection.** Est dite *muette* une source active (hors statut `morte`) qui a produit au moins un événement durant les 10 premières semaines de la fenêtre et aucun durant les 2 dernières. Une source sans production sur la fenêtre n'est pas muette : son silence n'a pas de point de départ mesuré.

**Synthèse.** 312 sources (202 actives) ; 11 muettes ; 214 sans événement sur la fenêtre.

## Sources muettes (11)

| Source | Famille | Dernier item | Silence (j) | Événements 12 sem. |
| --- | --- | --- | ---: | ---: |
| DDoS Secrets — publications récentes `leak:ddosecrets:rss` | leaks | 2026-09-05 | 77 | 4 |
| France 3 NA — Landes (RSS) `presse-france3-landes` | cti | 2026-10-20 | 32 | 1 |
| Université de Limoges (RSS) `univ-limoges` | cti | 2026-10-20 | 32 | 1 |
| CISA ICS Medical Advisories `cat-cisa-ics-medical` | vuln | 2026-10-21 | 31 | 6 |
| JPCERT/CC Blog (EN) `cat-jpcert-blog` | cti | 2026-10-21 | 31 | 1 |
| France 3 NA — Creuse (RSS) `presse-france3-creuse` | cti | 2026-10-21 | 31 | 1 |
| Coveware ransomware feed `ransom-coveware-feed` | ransomware | 2026-10-28 | 24 | 1 |
| Have I Been Pwned — index des violations (JSON public) `leak:hibp:breaches-index` | leaks | 2026-11-02 | 19 | 3 |
| CERT.LV (All) `cat-cert-lv` | cert | 2026-11-05 | 16 | 3 |
| Google News — cyber Corrèze (30 j) `gn-19` | cti | 2026-11-05 | 16 | 1 |
| Google News — cyber Landes (30 j) `gn-40` | cti | 2026-11-07 | 14 | 7 |

## Historique par source (312)

| Source | État | 08/31 (S-11) | 09/07 (S-10) | 09/14 (S-9) | 09/21 (S-8) | 09/28 (S-7) | 10/05 (S-6) | 10/12 (S-5) | 10/19 (S-4) | 10/26 (S-3) | 11/02 (S-2) | 11/09 (S-1) | 11/16 (S-0) | Dernier item |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| CrowdStrike Blog `actu-crowdstrike` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 2026-11-19 |
| CyberNews `actu-cybernews` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Cybersecurity Dive `actu-cybersecuritydive` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 12 | 2026-11-20 |
| HackRead `actu-hackread` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 22 | 2026-11-21 |
| Help Net Security `actu-helpnetsecurity` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 12 | 2026-11-20 |
| Infosecurity Magazine `actu-infosecurity-magazine` | active | 0 | 20 | 26 | 26 | 23 | 31 | 22 | 23 | 27 | 25 | 27 | 28 | 2026-11-20 |
| IT Security Guru `actu-itsecurityguru` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 9 | 6 | 2026-11-17 |
| Security Affairs `actu-securityaffairs` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 21 | 2026-11-20 |
| WeLiveSecurity (ESET) `actu-welivesecurity` | active | 2 | 2 | 3 | 4 | 3 | 3 | 3 | 2 | 5 | 3 | 2 | 3 | 2026-11-19 |
| ZDNet Security `actu-zdnet-security` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 2026-11-16 |
| AlienVault IP Reputation (generic) `alienvault-reputation` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| AWS Security Bulletins `cat-aws-security-bulletins` | active | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 22 | 18 | 28 | 18 | 12 | 2026-11-20 |
| Bitdefender Labs `cat-bitdefender-labs` | active | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 2 | 2026-11-20 |
| CERT.at Blog `cat-cert-at-blog` | active | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 2026-11-11 |
| CERT.at Warnings `cat-cert-at-warnings` | active | 1 | 0 | 1 | 3 | 0 | 2 | 2 | 1 | 0 | 0 | 0 | 2 | 2026-11-18 |
| CERT-EE / RIA News `cat-cert-ee` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| CERT-EU Security Advisories `cat-cert-eu-sa` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 2 | 2026-11-20 |
| CERT.hr News `cat-cert-hr` | active | 0 | 0 | 0 | 0 | 0 | 2 | 3 | 1 | 0 | 1 | 0 | 2 | 2026-11-19 |
| CERT.LV (All) `cat-cert-lv` | active | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 2026-11-05 |
| CERT Polska `cat-cert-pl` | active | 5 | 2 | 4 | 3 | 18 | 4 | 8 | 4 | 18 | 2 | 4 | 8 | 2026-11-20 |
| CERT-SE (MSB) Feed `cat-cert-se` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 2 | 2026-11-20 |
| SI-CERT News (EN) `cat-cert-si-news` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| CIRCL Luxembourg News `cat-circl-news` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 2 | 2026-11-20 |
| CISA ICS Advisories `cat-cisa-ics-advisories` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 24 | 5 | 1 | 5 | 12 | 2026-11-19 |
| CISA ICS Medical Advisories `cat-cisa-ics-medical` | active | 0 | 3 | 0 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 2026-10-21 |
| DNSC Romania (CERT-RO) News `cat-dnsc-ro` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 2 | 2 | 2 | 2026-11-19 |
| Drupal Security Advisories `cat-drupal-sa` | active | 0 | 0 | 2 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 3 | 2026-11-18 |
| Elastic Security Labs `cat-elastic-security-labs` | active | 1 | 2 | 0 | 0 | 2 | 0 | 1 | 2 | 0 | 0 | 3 | 2 | 2026-11-20 |
| GBHackers Security News `cat-gbhackers` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Huntress Blog `cat-huntress-blog` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| JPCERT/CC Blog (EN) `cat-jpcert-blog` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2026-10-21 |
| NCSC-NL Beveiligingsadviezen `cat-ncsc-nl-advisories` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 4 | 2026-11-20 |
| NCSC-NL Nieuws `cat-ncsc-nl-news` | active | 1 | 10 | 0 | 1 | 1 | 4 | 5 | 8 | 3 | 6 | 4 | 5 | 2026-11-20 |
| Qualys Blog / Threat Research `cat-qualys-blog` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 4 | 5 | 11 | 2026-11-20 |
| Schneier on Security `cat-schneier-security` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| SentinelOne Labs `cat-sentinelone-labs` | active | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 2026-11-12 |
| Tenable Blog `cat-tenable-blog` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 6 | 0 | 5 | 7 | 2026-11-20 |
| Conseil departemental de la Creuse — a la une `cd23-a-la-une` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Conseil departemental du Lot-et-Garonne — actualites (RSS) `cd47-actualites-rss` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| CISA cyber advisories (XML) `cert-cisa-advisories` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 5 | 7 | 7 | 1 | 2026-11-17 |
| CERT-EU advisories (page) `cert-eu-page` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 52 | 2 | 2026-11-20 |
| CERT-FR / ANSSI `cert_fr` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 40 | 55 | 2026-11-20 |
| CERT-FR alerte `cert-fr-alerte` | active | 2 | 2 | 0 | 0 | 2 | 0 | 3 | 2 | 0 | 2 | 0 | 2 | 2026-11-18 |
| CERT-FR avis `cert-fr-avis` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 80 | 54 | 2026-11-20 |
| CERT-FR feed `cert-fr-feed` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 39 | 1 | 2026-11-16 |
| CHU de Poitiers (RSS) `chu-poitiers` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| CINS Score badguys list `cinsscore-badguys` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| CISA Known Exploited Vulnerabilities `cisa_kev` | active | 10 | 14 | 7 | 12 | 6 | 5 | 9 | 8 | 10 | 3 | 12 | 9 | 2026-11-20 |
| Certificate Transparency (crt.sh) `ctlog` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| dan.me.uk Tor node list `danmeuk-torlist` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Aquitaine Robotics (RSS) `eco-aquitaine-robotics` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Charente Libre Économie (RSS) `eco-charentelibre` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 2026-11-17 |
| Dordogne Libre Économie (RSS) `eco-dordogne-libre` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2026-11-09 |
| Le Journal des Entreprises Nouvelle-Aquitaine (RSS) `eco-jde-na` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| La République des Pyrénées Économie (RSS) `eco-rep-pyrenees` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Sud Ouest Éco (RSS) `eco-sudouest` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 2 | 2026-11-21 |
| Bordeaux Technowest (RSS) `eco-technowest` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Unitec (incubateur Bordeaux, RSS) `eco-unitec` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FIRST EPSS `epss` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Emerging Threats compromised IPs `et-compromised` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL abuseipdb_1d `feed:firehol:abuseipdb_1d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL abuseipdb_30d `feed:firehol:abuseipdb_30d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de `feed:firehol:blocklist_de` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_apache `feed:firehol:blocklist_de_apache` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_bots `feed:firehol:blocklist_de_bots` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_bruteforce `feed:firehol:blocklist_de_bruteforce` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_ftp `feed:firehol:blocklist_de_ftp` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_imap `feed:firehol:blocklist_de_imap` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_mail `feed:firehol:blocklist_de_mail` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_sip `feed:firehol:blocklist_de_sip` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_ssh `feed:firehol:blocklist_de_ssh` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_de_strongips `feed:firehol:blocklist_de_strongips` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL blocklist_net_ua `feed:firehol:blocklist_net_ua` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL botscout `feed:firehol:botscout` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL botscout_1d `feed:firehol:botscout_1d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL botscout_30d `feed:firehol:botscout_30d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL botscout_7d `feed:firehol:botscout_7d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL botvrij_dst `feed:firehol:botvrij_dst` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL botvrij_src `feed:firehol:botvrij_src` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL bruteforceblocker `feed:firehol:bruteforceblocker` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL c2_tracker `feed:firehol:c2_tracker` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL ciarmy `feed:firehol:ciarmy` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cidr_report_bogons `feed:firehol:cidr_report_bogons` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cleantalk `feed:firehol:cleantalk` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cleantalk_1d `feed:firehol:cleantalk_1d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cleantalk_30d `feed:firehol:cleantalk_30d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cleantalk_7d `feed:firehol:cleantalk_7d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cleantalk_new_1d `feed:firehol:cleantalk_new_1d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cleantalk_new_30d `feed:firehol:cleantalk_new_30d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cleantalk_new_7d `feed:firehol:cleantalk_new_7d` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cybercrime `feed:firehol:cybercrime` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FireHOL cybercure `feed:firehol:cybercure` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Feodo Tracker (abuse.ch) IP blocklist `feodo-ip` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Google News — cyber Charente (30 j) `gn-16` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 3 | 7 | 7 | 1 | 2026-11-18 |
| Google News — cyber Charente-Maritime (30 j) `gn-17` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 12 | 8 | 1 | 2026-11-19 |
| Google News — cyber Corrèze (30 j) `gn-19` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 2026-11-05 |
| Google News — cyber Creuse (30 j) `gn-23` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 3 | 2 | 1 | 2026-11-19 |
| Google News — cyber Dordogne (30 j) `gn-24` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 5 | 2 | 2 | 0 | 2026-11-12 |
| Google News — cyber Gironde (30 j) `gn-33` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 6 | 4 | 2026-11-21 |
| Google News — cyber Landes (30 j) `gn-40` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 4 | 0 | 0 | 2026-11-07 |
| Google News — cyber Lot-et-Garonne (30 j) `gn-47` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 5 | 8 | 5 | 4 | 2026-11-20 |
| Google News — cyber Pyrénées-Atlantiques (30 j) `gn-64` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2 | 1 | 2 | 2026-11-21 |
| Google News — cyber Deux-Sèvres (30 j) `gn-79` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 1 | 4 | 3 | 2 | 2026-11-18 |
| Google News — cyber Vienne (30 j) `gn-86` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2 | 1 | 4 | 2026-11-21 |
| Google News — cyber Haute-Vienne (30 j) `gn-87` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 | 2026-11-17 |
| Google News — « cyberattaque Nouvelle-Aquitaine » `gn-cyber-na` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 3 | 2026-11-20 |
| Google News — « fuite de données » métropoles NA `gn-fuite-metropoles` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 | 6 | 2026-11-17 |
| Google News — « cyberattaque mairie » `gn-mairie-cyber` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14 | 7 | 2026-11-19 |
| Google News — cyber sur lamontagne.fr (30 j) `gn-press-lamontagne` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 4 | 1 | 2026-11-17 |
| Google News — cyber sur lepopulaire.fr (30 j) `gn-press-lepopulaire` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Google News — « ransomware Aquitaine » `gn-ransom-aquitaine` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Hermes Agent — bot de veille radar-cyber `hermes_radar_cyber` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Inria Bordeaux (RSS) `inria-bordeaux` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| DataBreaches.net — flux des fuites de données `leak:databreaches:feed` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 | 24 | 2026-11-21 |
| DDoS Secrets — publications récentes `leak:ddosecrets:rss` | active | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2026-09-05 |
| Have I Been Pwned — index des violations `leak:hibp:breaches` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Have I Been Pwned — index des violations (JSON public) `leak:hibp:breaches-index` | active | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 2026-11-02 |
| Have I Been Pwned — dernières violations (RSS) `leak:hibp:latest-breaches` | active | 4 | 4 | 0 | 4 | 2 | 8 | 6 | 2 | 2 | 2 | 4 | 2 | 2026-11-20 |
| HIPAA Journal — incidents et fuites (RSS) `leak:hipaajournal:feed` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 9 | 2026-11-20 |
| RansomLook — victimes récentes (API JSON) `leak:ransomlook:recent-api` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 162 | 185 | 2026-11-21 |
| ransomware.live — revendications récentes (RSS) `leak:ransomware-live:recent-rss` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 102 | 49 | 2026-11-21 |
| Ransomwatch — publications (JSON public) `leak:ransomwatch:posts` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| NVD CVE 2.0 `nvd_cve` | active | 0 | 0 | 0 | 0 | 0 | 0 | 1740 | 4207 | 3645 | 3575 | 4597 | 4150 | 2026-11-20 |
| anubis `onion:ccw:anubis` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| aoqin `onion:ccw:aoqin` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| aoqin-leaks `onion:ccw:aoqin-leaks` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| apt73 `onion:ccw:apt73` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| arcusmedia `onion:ccw:arcusmedia` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| atomsilo `onion:ccw:atomsilo` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| auditteam `onion:ccw:auditteam` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| aurora `onion:ccw:aurora` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| barracuda `onion:ccw:barracuda` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| bavacai `onion:ccw:bavacai` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| blacknevas `onion:ccw:blacknevas` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| blackout `onion:ccw:blackout` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| booba-project `onion:ccw:booba-project` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| byod `onion:ccw:byod` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| ciphbit `onion:ccw:ciphbit` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| climax `onion:ccw:climax` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| dark-project `onion:ccw:dark-project` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| destello `onion:ccw:destello` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| direwolf `onion:ccw:direwolf` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| doommageddon `onion:ccw:doommageddon` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| eclipse `onion:ccw:eclipse` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| endzone `onion:ccw:endzone` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| ethics `onion:ccw:ethics` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| everest `onion:ccw:everest` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| everstake `onion:ccw:everstake` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| exitium `onion:ccw:exitium` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| gammax `onion:ccw:gammax` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| genesis `onion:ccw:genesis` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| global-secret-group `onion:ccw:global-secret-group` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| helix `onion:ccw:helix` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| incransom `onion:ccw:incransom` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| insomnia `onion:ccw:insomnia` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| kairos `onion:ccw:kairos` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| krybit `onion:ccw:krybit` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| lamashtu `onion:ccw:lamashtu` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| leaknet `onion:ccw:leaknet` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| lockbit4 `onion:ccw:lockbit4` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| medusalocker `onion:ccw:medusalocker` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| moneymessage `onion:ccw:moneymessage` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| n0n `onion:ccw:n0n` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| netrunner `onion:ccw:netrunner` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| nightspire `onion:ccw:nightspire` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| obsoft `onion:ccw:obsoft` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| osyolorz-collective `onion:ccw:osyolorz-collective` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| panzer `onion:ccw:panzer` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| pear `onion:ccw:pear` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| pixelleaks `onion:ccw:pixelleaks` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| qilin `onion:ccw:qilin` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| ransomexx `onion:ccw:ransomexx` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| reynolds `onion:ccw:reynolds` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| runsomewares `onion:ccw:runsomewares` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| safepay `onion:ccw:safepay` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| scarlettgroup `onion:ccw:scarlettgroup` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| secp0 `onion:ccw:secp0` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| spacebears `onion:ccw:spacebears` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| team-underground `onion:ccw:team-underground` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| threeam `onion:ccw:threeam` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| titan `onion:ccw:titan` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| vortex `onion:ccw:vortex` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| vypr `onion:ccw:vypr` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| wallstreet `onion:ccw:wallstreet` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| whitearmor `onion:ccw:whitearmor` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| RansomLook — site .onion (revendications) `onion:ransomlook:site` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Ransomwatch — site .onion (revendications) `onion:ransomwatch:site` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| 3am `onion:rl:3am` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| abyss-data `onion:rl:abyss-data` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| byod `onion:rl:byod` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| eraleign (apt73) `onion:rl:eraleign-apt73` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| fulcrumsec `onion:rl:fulcrumsec` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| gammax `onion:rl:gammax` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| genesis `onion:rl:genesis` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| global secret group `onion:rl:global-secret-group` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| kazu `onion:rl:kazu` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| netrunner `onion:rl:netrunner` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| orova `onion:rl:orova` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| ransomhouse `onion:rl:ransomhouse` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| sarcoma `onion:rl:sarcoma` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| OpenPhish community feed `openphish` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| abuse.ch (site) `osint-abusech` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Have I Been Pwned (site) `osint-hibp` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| AlienVault OTX (site) `osint-otx` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Shodan (site) `osint-shodan` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| ThreatFox (site) `osint-threatfox` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| URLhaus (site) `osint-urlhaus` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| VirusTotal (site) `osint-virustotal` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| GitHub — gists publics (flux) `paste:github:gists-public` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| GitHub — gists publics (flux narratif) `paste:github:gists-public-feed` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 5 | 2026-11-21 |
| PoC publics GitHub (nomi-sec/PoC-in-GitHub) `poc_github` | active | 0 | 0 | 0 | 3 | 9 | 3 | 7 | 5 | 3 | 1 | 4 | 11 | 2026-11-21 |
| Prefecture de la Correze — actualites (RSS) `pref19-actualites-rss` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Prefecture de la Creuse — actualites `pref23-actualites` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Prefecture des Landes — communiques de presse 2026 `pref40-communiques-2026` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Prefecture du Lot-et-Garonne — dernieres informations `pref47-dernieres-infos` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| 01net (RSS) `presse-01net` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Aquitaine OnLine — Landes (RSS) `presse-aquitaineonline-landes` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Charente Libre (RSS) `presse-charentelibre` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2026-11-20 |
| France 3 NA — Correze (RSS) `presse-france3-correze` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| France 3 NA — Creuse (RSS) `presse-france3-creuse` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2026-10-21 |
| France 3 NA — Landes (RSS) `presse-france3-landes` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2026-10-20 |
| France 3 Nouvelle-Aquitaine (RSS) `presse-france3-na` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 5 | 2026-11-21 |
| France Bleu (RSS) `presse-francebleu-rss` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Franceinfo (RSS titres) `presse-francetvinfo` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Generation NT (RSS) `presse-generationnt` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| ICI Creuse — a la une (RSS) `presse-ici-creuse` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| ICI Limousin — infos (RSS) `presse-ici-limousin-infos` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| La Depeche — Lot-et-Garonne (RSS) `presse-ladepeche-47` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| La Montagne — Correze (page actualites) `presse-lamontagne-correze` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Le Figaro (RSS actu) `presse-lefigaro-actu` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Le Monde Technologies (RSS) `presse-lemonde-tech` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Le Monde (RSS une) `presse-lemonde-une` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Le Monde Informatique (Feedburner) `presse-lmi-feedburner` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Le Monde Informatique (RSS) `presse-lmi-rss` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| La Nouvelle République — Deux-Sèvres (RSS) `presse-lnr-deuxsevres` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| La Nouvelle République — Vienne (RSS) `presse-lnr-vienne` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2026-11-20 |
| Médiacités (feed national, enquêtes locales) `presse-mediacites` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Numerama (feed) `presse-numerama` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Ouest-France (RSS) `presse-ouestfrance-rss` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Le Republicain Lot-et-Garonne — actu.fr (RSS) `presse-republicain-47` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2026-11-21 |
| Rue89 Bordeaux (feed) `presse-rue89bordeaux` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 2026-11-17 |
| Silicon (feed) `presse-silicon` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Sud Ouest (RSS) `presse-sudouest` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 5 | 2026-11-21 |
| Sud Ouest — Charente (RSS) `presse-sudouest-charente` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2026-11-21 |
| Sud Ouest — Charente-Maritime (RSS) `presse-sudouest-charente-maritime` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2026-11-21 |
| Sud Ouest — Deux-Sèvres (RSS) `presse-sudouest-deux-sevres` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Sud Ouest — Dordogne (RSS) `presse-sudouest-dordogne` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Sud Ouest — Gironde (RSS) `presse-sudouest-gironde` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2026-11-15 |
| Sud Ouest — Landes (RSS) `presse-sudouest-landes` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Sud Ouest — Lot-et-Garonne (RSS) `presse-sudouest-lot-et-garonne` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2026-11-21 |
| Sud Ouest — Mont-de-Marsan (RSS) `presse-sudouest-mont-de-marsan` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Sud Ouest — Pyrénées-Atlantiques (RSS) `presse-sudouest-pyrenees` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 2026-11-21 |
| Sud Ouest (RSS) `presse-sudouest-rss` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| UnderNews (feed) `presse-undernews` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Zataz (feed) `presse-zataz` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Radar detection cursor `radar-detection` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Binary Response Ransomware Groups Tracker `ransom-binaryresponse` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 2026-11-15 |
| Coveware ransomware feed `ransom-coveware-feed` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 2026-10-28 |
| Emsisoft ransomware decryption `ransom-emsisoft-decrypt` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| ICHI Adversary Ecosystem `ransom-ichi-ecosystem` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| AntiBrok3rs `ransomleak-antibrok3rs` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| FulcrumSec `ransomleak-fulcrumsec` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| LAPSUS$ `ransomleak-lapsus` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Leaked Data `ransomleak-leakeddata` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| NetLeaks (Bjorka) `ransomleak-netleaks` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Soul Group `ransomleak-soulgroup` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Cyber Toufan `ransomleak-toufan` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| RansomLook `ransomlook` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 148 | 267 | 2026-11-21 |
| RansomLook Leaks `ransom-look-leaks` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| No More Ransom `ransom-nomoreransom` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| RansomLook (site) `ransom-ransomlook` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2026-11-15 |
| Ransomware.live (site) `ransom-ransomwarelive` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 48 | 55 | 2026-11-21 |
| SecurityAlert.ai Ransomware Tracker `ransom-securityalert` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 35 | 0 | 2026-11-15 |
| RENATER (feed) `secteur-renater` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2026-11-16 |
| Sante.fr (RSS) `secteur-sante-fr` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Spamhaus DROP list `spamhaus-drop` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram APT Analysis `tg-aptanalysis` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2026-11-15 |
| Telegram BaseLeak `tg-baseleeak` | active | 0 | 0 | 0 | 0 | 5 | 4 | 4 | 3 | 3 | 0 | 0 | 1 | 2026-11-17 |
| Telegram CERT_EU (web) `tg-cert-eu` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram CERT_FR (web) `tg-certfr` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram CTI (web) `tg-cti` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram CVE Notify `tg-cvenotify` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 42 | 350 | 2026-11-21 |
| Telegram cyberdefence (web) `tg-cyberdefence` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram cybersecurity (web) `tg-cybersecurity` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram DarkFeedNews `tg-darkfeednews` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 22 | 43 | 2026-11-21 |
| Telegram IntelFeed (web) `tg-intelfeed` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram IntelOwl (web) `tg-intelowl` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram IT Security Alerts `tg-itsecalert` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 1 | 1 | 2026-11-20 |
| Telegram Leaked Databases `tg-leaked-databases` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2026-11-17 |
| Telegram malware_traffic (web) `tg-malware-traffic` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram Marketo Leaks `tg-marketo-leaks` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2026-11-17 |
| Telegram OSINT (web) `tg-osint` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram OSINTdefender (web) `tg-osintdefender` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 5 | 2026-11-21 |
| Telegram OSINT_Techniques (web) `tg-osint-techniques` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram ransomware (web) `tg-ransomware` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram BLACKNET-00 Ransomware `tg-ransomwareg` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 5 | 2026-11-19 |
| Telegram Snatch Team `tg-snatch-news` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2026-11-17 |
| Telegram TechPwnews `tg-techpwnews` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2026-11-15 |
| Telegram threatintel (web) `tg-threatintel` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Telegram threatintel_daily (web) `tg-threatintel-daily` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Tor Project bulk exit list `tor-bulk-exit` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Université de La Rochelle (RSS) `univ-larochelle` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| Université de Limoges (RSS) `univ-limoges` | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2026-10-20 |
| MISP warninglist — plages Amazon AWS `wl:misp:amazon-aws` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| MISP warninglist — Cisco Umbrella top 1M `wl:misp:cisco-top1m` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| MISP warninglist — plages Cloudflare `wl:misp:cloudflare` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| MISP warninglist — Cloudflare Radar top 1M `wl:misp:cloudflare-top1m` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| MISP warninglist — faux positifs IOC courants `wl:misp:common-ioc-false-positive` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| MISP warninglist — datacenter IPv4 `wl:misp:datacenter-ipv4` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| MISP warninglist — datacenter IPv6 `wl:misp:datacenter-ipv6` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| MISP warninglist — Majestic Million `wl:misp:majestic-million` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| MISP warninglist — Tranco top 1M `wl:misp:tranco` | désactivée | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |

Pour régénérer : `pnpm exec tsx scripts/sante-sources-historique.mts`.
