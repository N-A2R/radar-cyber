# Vérification HTTP des sources

Mesure du 2026-11-22T01:54:12.963Z — 494/494 sources vérifiées (100 %).
User-Agent : `radar-cyber-source-verification/1.0 (+https://github.com/j0ltdevv/radar-cyber; ops@radar-cyber.local)`. Un GET par source ; .onion via Tor.

| État | Sources |
| --- | ---: |
| 200 (item parsé, ≤ 5 s) | 356 |
| muettes (200, 0 item parsé) | 99 |
| mortes (erreur réseau ou HTTP ≥ 400) | 34 |
| lentes (> 5 s, items parsés) | 5 |
| **total vérifié** | **494** |

Règles disjointes : morte > muette > lente > 200. Une source muette répond mais ne produit aucun item exploitable ; une source morte ne répond pas ou répond par une erreur HTTP.

## Sources à débrancher (133)

| Source | Nom | URL | État | Motif |
| --- | --- | --- | --- | --- |
| actu-cybernews | CyberNews | https://cybernews.com/feed/ | morte | HTTP 403 |
| actu-itsecurityguru | IT Security Guru | https://www.itsecurityguru.org/feed/ | morte | HTTP 403 |
| cat-elastic-security-labs | Elastic Security Labs | https://www.elastic.co/security-labs/rss/feed.xml | muette | HTTP 200 mais 0 item parsé |
| cisa_kev | CISA Known Exploited Vulnerabilities | https://www.cisa.gov/known-exploited-vulnerabilities-catalog | muette | HTTP 200 mais 0 item parsé |
| corpus:delta-fm-actualites | Delta FM — actualités | https://www.deltafm.fr/category/radios/zik-et-news | muette | HTTP 200 mais 0 item parsé |
| corpus:grand-chatellerault-communaute-d-agglomeration | Grand Châtellerault (communauté d'agglomération) | https://www.grand-chatellerault.fr/vivre/actualites | muette | HTTP 200 mais 0 item parsé |
| corpus:la-nouvelle-republique-vienne-flux-rss | La Nouvelle République — Vienne (flux RSS) | https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c | muette | HTTP 200 mais 0 item parsé |
| corpus:la-vienne-rurale-caracterres | La Vienne Rurale (Caracterres) | https://www.caracterres.fr/vienne-rurale | muette | HTTP 200 mais 0 item parsé |
| corpus:landes-40-actu-fr-actu-landes | actu.fr — Actu Landes | https://actu.fr/landes/rss.xml | morte | HTTP 403 |
| corpus:landes-40-actu-fr-mont-de-marsan | actu.fr — Mont-de-Marsan | https://actu.fr/nouvelle-aquitaine/mont-de-marsan_40192/ | morte | HTTP 403 |
| corpus:landes-40-mairie-de-soustons | Mairie de Soustons | https://www.mairie-soustons.fr/feed/ | muette | HTTP 200 mais 0 item parsé |
| corpus:landes-40-mont-de-marsan-agglo | Mont de Marsan Agglo | https://www.montdemarsan.fr/feed/ | muette | HTTP 200 mais 0 item parsé |
| corpus:landes-40-radio-mdm-mont-de-marsan-radio-associative | Radio MDM (Mont-de-Marsan, radio associative) | https://www.radio-mdm.fr/feed/ | muette | HTTP 200 mais 0 item parsé |
| corpus:landes-40-tarnos-contact-journal-municipal-de-tarnos | Tarnos Contact — journal municipal de Tarnos | https://www.ville-tarnos.fr/ | morte | erreur réseau : ECONNREFUSED: TypeError: fetch failed |
| corpus:landes-40-tvpi-television-locale-pays-basque-et-sud-landes | TVPI (télévision locale Pays basque et Sud-Landes) | https://tvpi.fr/feed/ | muette | HTTP 200 mais 0 item parsé |
| corpus:landes-40-ville-de-mont-de-marsan | Ville de Mont-de-Marsan | https://www.montdemarsan.fr/feed/ | muette | HTTP 200 mais 0 item parsé |
| corpus:landes-40-ville-de-tarnos | Ville de Tarnos | https://www.ville-tarnos.fr/feed/ | morte | erreur réseau : ECONNREFUSED: TypeError: fetch failed |
| corpus:le-populaire-du-centre-poitiers | Le Populaire du Centre — Poitiers | https://www.lepopulaire.fr/poitiers-86000/ | muette | HTTP 200 mais 0 item parsé |
| corpus:le7-info-7-a-poitiers | Le7.info — 7 à Poitiers | https://www.7apoitiers.fr/ | morte | timeout (10463 ms) |
| corpus:prefecture-de-la-vienne | Préfecture de la Vienne | https://www.vienne.gouv.fr/Actualites | morte | erreur réseau : ERR_HTTP2_STREAM_ERROR: TypeError: fetch failed |
| corpus:ville-de-chatellerault | Ville de Châtellerault | https://www.chatellerault.fr/feed/ | muette | HTTP 200 mais 0 item parsé |
| corpus:ville-de-loudun | Ville de Loudun | https://www.ville-loudun.fr/actualites | muette | HTTP 200 mais 0 item parsé |
| corpus:ville-de-saint-benoit | Ville de Saint-Benoît | https://www.ville-saint-benoit.fr/zoom-sur-l-actu.html | muette | HTTP 200 mais 0 item parsé |
| ctlog | Certificate Transparency (crt.sh) | https://crt.sh/ | muette | HTTP 200 mais 0 item parsé |
| danmeuk-torlist | dan.me.uk Tor node list | https://www.dan.me.uk/torlist/ | morte | HTTP 403 |
| epss | FIRST EPSS | https://www.first.org/epss/ | muette | HTTP 200 mais 0 item parsé |
| feed:firehol:botvrij_src | FireHOL botvrij_src | https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/botvrij_src.ipset | muette | HTTP 200 mais 0 item parsé |
| gn-ransom-aquitaine | Google News — « ransomware Aquitaine » | https://news.google.com/rss/search?q=ran%C3%A7ongiciel+(Gironde+OR+Dordogne+OR+Landes+OR+Pyr%C3%A9n%C3%A9es-Atlantiques)+when:7d&hl=fr&gl=FR&ceid=FR:fr | muette | HTTP 200 mais 0 item parsé |
| hermes_radar_cyber | Hermes Agent — bot de veille radar-cyber | box hermes / profil radar-cyber | morte | URL non HTTP(S) |
| inria-bordeaux | Inria Bordeaux (RSS) | https://www.inria.fr/rss | morte | HTTP 404 — ressource disparue |
| na-tech-site-001 | CVE records mentioning Bordeaux | https://www.cve.org/CVERecord/SearchResults?query=Bordeaux | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-002 | CVE records mentioning Limoges | https://www.cve.org/CVERecord/SearchResults?query=Limoges | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-003 | CVE records mentioning Poitiers | https://www.cve.org/CVERecord/SearchResults?query=Poitiers | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-004 | CVE records mentioning Pau | https://www.cve.org/CVERecord/SearchResults?query=Pau | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-005 | NVD CVE keyword Bordeaux | https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=Bordeaux&resultsPerPage=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-006 | NVD CVE keyword CHU de Bordeaux | https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=CHU%20de%20Bordeaux&resultsPerPage=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-007 | NVD CVE keyword Universite de Poitiers | https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=Universite%20de%20Poitiers&resultsPerPage=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-008 | NVD CVE keyword UPPA Pau | https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=UPPA%20Pau&resultsPerPage=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-009 | NVD CVE keyword La Rochelle | https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=La%20Rochelle&resultsPerPage=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-010 | Exploit-DB search Bordeaux | https://www.exploit-db.com/search?q=Bordeaux | morte | timeout (10207 ms) |
| na-tech-site-011 | Exploit-DB search Limoges | https://www.exploit-db.com/search?q=Limoges | morte | timeout (15001 ms) |
| na-tech-site-012 | Exploit-DB search Poitiers | https://www.exploit-db.com/search?q=Poitiers | morte | timeout (15001 ms) |
| na-tech-site-013 | Exploit-DB search Pau | https://www.exploit-db.com/search?q=Pau | morte | timeout (15001 ms) |
| na-tech-site-015 | GitHub repositories for Limoges security | https://api.github.com/search/repositories?q=Limoges%20securite&per_page=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-016 | GitHub repositories for Poitiers vulnerabilities | https://api.github.com/search/repositories?q=Poitiers%20vulnerabilite&per_page=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-017 | GitHub repositories for Pau Pays de l'Adour | https://api.github.com/search/repositories?q=%22Pau%20Pays%20de%20l%27Adour%22&per_page=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-019 | GitHub repositories with Poitiers exploit material | https://api.github.com/search/repositories?q=Poitiers%20exploit&per_page=5 | muette | HTTP 200 mais 0 item parsé |
| na-tech-site-020 | GitHub repositories with Creuse CVE material | https://api.github.com/search/repositories?q=Creuse%20CVE&per_page=5 | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:anubis | anubis | http://6g3aoky5hft4mvzcqt2bugo4r465woaorjhd7em2k2v24sr2exaro5id.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:aoqin | aoqin | http://aoqinwwrizxbrwm3qb6l4jzgujgmcetp4jaug7fqylbf3xcwqwzvbuid.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:aoqin-leaks | aoqin-leaks | http://aoqinwwrizxbrwm3qb6l4jzgujgmcetp4jaug7fqylbf3xcwqwzvbuid.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:atomsilo | atomsilo | http://npmh5ahrgakbniuntyc7io4adm6ietbdbuejrfonowqtyqn24or556qd.onion | morte | erreur réseau : Error: Proxy connection timed out |
| onion:ccw:aurora | aurora | http://u6lieui2dakbctcjea2bz4r4q32r7t36nwljovqbv7mxs6o2smgxixid.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:barracuda | barracuda | http://qr6uopkqxmq254osyct3oibil32xp3qsimkkbqdscsrsb4zqbagnifad.onion | morte | HTTP 403 |
| onion:ccw:bavacai | bavacai | http://t33zoj4qwv455fog7qnb2azi5xcdxkixughmmduzbw2rtdgryqfbh6id.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:blacknevas | blacknevas | http://ctyfftrjgtwdjzlgqh4avbd35sqrs6tde4oyam2ufbjch6oqpqtkdtid.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:blackout | blackout | http://rqqn25k3hgmfkh7ykjbmakjgidwweomr7cbpy6pfecpxs57r5iwzwtyd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:booba-project | booba-project | http://7t3zi3e7ki6iseun77ofqtr6wmbpgnpc2ada6gstcxp54lw6q2zb7jad.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:ciphbit | ciphbit | http://kryzon3qa22ib23qwka2wcr2yfxhtrfxgurup7bzbtxmnvilu7iagfqd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:dark-project | dark-project | http://3i5px2hibsyityv6jixnqba35yz25jekbwwumjdxjqzt3euqsygjx5id.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:destello | destello | http://destell6tk2la7w4d7d4apfzsywbt2lsdpui7i2rsfyrike7pxolrbyd.onion/ | morte | erreur réseau : Error: Socks5 proxy rejected connection - HostUnreachable |
| onion:ccw:direwolf | direwolf | http://direwolfcdkv5whaz2spehizdg22jsuf5aeje4asmetpbt6ri4jnd4qd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:doommageddon | doommageddon | http://iacjvmxjb2ivqkxxzmde4w6g53gn6ym7c3g6mfifvejyhqtp4wrkypyd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:endzone | endzone | http://endzonezgz3sqzmtqg4acp4z7ao7xc6vunfhezjsnfqrm2ksudsredyd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:ethics | ethics | http://ethics67vxjomvlcugjovv4fc3g6ru5tpwotg533d4j3uf2btmnndead.onion | morte | erreur réseau : Error: Socks5 proxy rejected connection - HostUnreachable |
| onion:ccw:everest | everest | http://everestndkvzcibcje2cqxhre2hmmybl3rn2gwzwsblz7gx6uryn5rad.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:exitium | exitium | http://m3ksukzn2glzfdvlusohril7n3iyk4z4fudf6mm22lwhpbpt5aiee5qd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:genesis | genesis | http://genesis6ixpb5mcy4kudybtw5op2wqlrkocfogbnenz3c647ibqixiad.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:helix | helix | http://helixr2sncrd3ndsz5oho6mzqw3x5u7mvox5zcsngc5wm7v4l5k7oryd.onion/leaks/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:incransom | incransom | http://incbacg6bfwtrlzwdbqc55gsfl763s3twdtwhp27dzuik6s6rwdcityd.onion/api/v1/blog/get/announcements?page=1&amp;perPage=15 | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:krybit | krybit | http://krybitqsdzwmhnitvwuhvsntfgf2wrhxveyxroxpc44c6gkft2cqldyd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:lamashtu | lamashtu | http://lamashtux5j74mcm7lwwgn5yrvuwtrpxjoyendif3v3hrztjesfoyayd.onion/api/posts?page=1&amp;filter=all | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:leaknet | leaknet | http://nleakk6sejx45jxtk7x6iyt65hwvfrkifc5v7ertdlwm3gttbpvlvxqd.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:lockbit4 | lockbit4 | http://lockbitapp24bvbi43n3qmtfcasf2veaeagjxatgbwtxnsh5w32mljad.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:medusalocker | medusalocker | http://t33zoj4qwv455fog7qnb2azi5xcdxkixughmmduzbw2rtdgryqfbh6id.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:moneymessage | moneymessage | http://jyp5yg7mh4siqkroxa3mydildkdw4qddbya7v6kamtd25ugdsob7voad.onion/ | morte | erreur réseau : Error: Socks5 proxy rejected connection - HostUnreachable |
| onion:ccw:nightspire | nightspire | http://nspirep7orjq73k2x2fwh2mxgh74vm2now6cdbnnxjk2f5wn34bmdxad.onion | morte | HTTP 502 |
| onion:ccw:osyolorz-collective | osyolorz-collective | http://hackerosyolorz77y7vwj57zobwdeuzydhctz3kuuzr52ylzayvxuqyd.onion | morte | erreur réseau : Error: Proxy connection timed out |
| onion:ccw:panzer | panzer | http://sl3iwbho7zdqjc3phm24pcd2xnko3nympkiplp6xthkc4775lb6nmxqd.onion/ | morte | erreur réseau : Error: Proxy connection timed out |
| onion:ccw:pixelleaks | pixelleaks | http://pixelra2qbx7zhvb6mxdzxlo6rxm2mtouhbabqmdzyd4fesicvbz7bqd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:qilin | qilin | http://kg2pf5nokg5xg2ahzbhzf5kucr5bc4y4ojordiebakopioqkk4vgz6ad.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:ransomexx | ransomexx | http://zubllg7o774lgc4rdxmfcfpjewfkqa7ml7gxwl5fetogc7hbkvaprhid.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:reynolds | reynolds | http://bs2tlg32pfjwmclm22cyngqmoo24cdlhfxzbruwrdaxumisfeory32qd.onion | morte | erreur réseau : Error: Socks5 proxy rejected connection - HostUnreachable |
| onion:ccw:runsomewares | runsomewares | http://rnsmwareartse3m4hjsumjf222pnka6gad26cqxqmbjvevhbnym5p6ad.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:safepay | safepay | http://safepaypfxntwixwjrlcscft433ggemlhgkkdupi2ynhtcmvdgubmoyd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:scarlettgroup | scarlettgroup | http://scarlettgutttdlyxz6rdqfslpdvdqnnzuxvzfsqavys2hvtnd3aidyd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:threeam | threeam | http://threeamkelxicjsaf2czjyz2lc4q3ngqkxhhlexyfcp2o6raw4rphyad.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:vypr | vypr | http://vyprblogkhfdeyrzgrdnnsrxv2bbuchcirrykkzw6upu2r5bydn3c3yd.onion/api/v1/posts | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:wallstreet | wallstreet | http://4dwiv37h7hhuhjpvtn72hme4ylcv3qoe65arfc6mbweal7als6ma7pyd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:ccw:whitearmor | whitearmor | http://whitearz6uvtfdefgsc4r3mzmyswtte65k5umcmv6cu6zhi4l5k4irad.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:ransomwatch:site | Ransomwatch — site .onion (revendications) | http://ransomwr3tsydeii4q43vazm7wofla5ujdajquitomtd47cxjtfgwyyd.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:rl:3am | 3am | http://threeamkelxicjsaf2czjyz2lc4q3ngqkxhhlexyfcp2o6raw4rphyad.onion | muette | HTTP 200 mais 0 item parsé |
| onion:rl:abyss-data | abyss-data | http://3ev4metjirohtdpshsqlkrqcmxq6zu3d7obrdhglpy5jpbr7whmlfgqd.onion | muette | HTTP 200 mais 0 item parsé |
| onion:rl:genesis | genesis | http://genesis6ixpb5mcy4kudybtw5op2wqlrkocfogbnenz3c647ibqixiad.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:rl:orova | orova | http://maa2yprc5pldyr5hjn246hw7i66wdhglnostqgqkcbuh4vyyeos4xxyd.onion/ | muette | HTTP 200 mais 0 item parsé |
| onion:rl:ransomhouse | ransomhouse | http://da763kyxwe3mf67gui5tb5igvpnt4w6cps5svrw2wkizyrzqgamdxtid.onion/ | morte | erreur réseau : Error: Proxy connection timed out |
| onion:rl:sarcoma | sarcoma | http://zp6bziy6wljpkg6i3uxzzcxyajodxzoc7acf5egb2vhzzrot23y3mpyd.onion/ | muette | HTTP 200 mais 0 item parsé |
| osint-otx | AlienVault OTX (site) | https://otx.alienvault.com/ | muette | HTTP 200 mais 0 item parsé |
| osint-virustotal | VirusTotal (site) | https://www.virustotal.com/ | muette | HTTP 200 mais 0 item parsé |
| poc_github | PoC publics GitHub (nomi-sec/PoC-in-GitHub) | https://github.com/nomi-sec/PoC-in-GitHub | muette | HTTP 200 mais 0 item parsé |
| pref19-actualites-rss | Prefecture de la Correze — actualites (RSS) | https://www.correze.gouv.fr/syndication/flux/rss_feed_62 | morte | erreur réseau : ERR_HTTP2_STREAM_ERROR: TypeError: fetch failed |
| pref23-actualites | Prefecture de la Creuse — actualites | https://www.creuse.gouv.fr/Actualites | morte | erreur réseau : ERR_HTTP2_STREAM_ERROR: TypeError: fetch failed |
| pref40-communiques-2026 | Prefecture des Landes — communiques de presse 2026 | https://www.landes.gouv.fr/Actualites/Salle-de-presse/Communiques-de-presse/2026 | morte | erreur réseau : ERR_HTTP2_STREAM_ERROR: TypeError: fetch failed |
| pref47-dernieres-infos | Prefecture du Lot-et-Garonne — dernieres informations | https://www.lot-et-garonne.gouv.fr/Actualites/Dernieres-informations | morte | erreur réseau : ERR_HTTP2_STREAM_ERROR: TypeError: fetch failed |
| presse-francebleu-rss | France Bleu (RSS) | https://www.francebleu.fr/rss | muette | HTTP 200 mais 0 item parsé |
| presse-republicain-47 | Le Republicain Lot-et-Garonne — actu.fr (RSS) | https://actu.fr/le-republicain-lot-et-garonne/rss.xml | morte | HTTP 403 |
| radar-detection | Radar detection cursor | internal://detection | morte | URL non HTTP(S) |
| ransomleak-antibrok3rs | AntiBrok3rs | https://antibrok3rs.bearblog.dev/ | muette | HTTP 200 mais 0 item parsé |
| ransomleak-leakeddata | Leaked Data | https://business-data-leaks.com | muette | HTTP 200 mais 0 item parsé |
| ransomlook | RansomLook | https://www.ransomlook.io/api/recent | muette | HTTP 200 mais 0 item parsé |
| secteur-sante-fr | Sante.fr (RSS) | https://www.sante.fr/rss | muette | HTTP 200 mais 0 item parsé |
| source-feed:actu-fr:QIV6XHOpzCCb | Discovered feed — actu.fr | https://actu.fr/rss.xml | morte | HTTP 403 |
| source-feed:ville-tarnos-fr:icSlSQAeBxij | Discovered feed — ville-tarnos.fr | https://www.ville-tarnos.fr/rss | morte | erreur réseau : ECONNREFUSED: TypeError: fetch failed |
| source-feed:ville-tarnos-fr:JS78HwRXDcBi | Discovered feed — ville-tarnos.fr | https://www.ville-tarnos.fr/feed/atom | morte | erreur réseau : ECONNREFUSED: TypeError: fetch failed |
| tg-cert-eu | Telegram CERT_EU (web) | https://t.me/s/CERT_EU | muette | HTTP 200 mais 0 item parsé |
| tg-certfr | Telegram CERT_FR (web) | https://t.me/s/CERT_FR | muette | HTTP 200 mais 0 item parsé |
| tg-cyberdefence | Telegram cyberdefence (web) | https://t.me/s/cyberdefence | muette | HTTP 200 mais 0 item parsé |
| tg-cybersecurity | Telegram cybersecurity (web) | https://t.me/s/cybersecurity | muette | HTTP 200 mais 0 item parsé |
| tg-intelowl | Telegram IntelOwl (web) | https://t.me/s/IntelOwl | muette | HTTP 200 mais 0 item parsé |
| tg-osint | Telegram OSINT (web) | https://t.me/s/OSINT | muette | HTTP 200 mais 0 item parsé |
| tg-osint-techniques | Telegram OSINT_Techniques (web) | https://t.me/s/OSINT_Techniques | muette | HTTP 200 mais 0 item parsé |
| tg-ransomware | Telegram ransomware (web) | https://t.me/s/ransomware | muette | HTTP 200 mais 0 item parsé |
| tg-threatintel | Telegram threatintel (web) | https://t.me/s/threatintel | muette | HTTP 200 mais 0 item parsé |
| tg-threatintel-daily | Telegram threatintel_daily (web) | https://t.me/s/threatintel_daily | muette | HTTP 200 mais 0 item parsé |
| wl:misp:amazon-aws | MISP warninglist — plages Amazon AWS | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/amazon-aws/list.json | muette | HTTP 200 mais 0 item parsé |
| wl:misp:cisco-top1m | MISP warninglist — Cisco Umbrella top 1M | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/cisco_top1m/list.json | muette | HTTP 200 mais 0 item parsé |
| wl:misp:cloudflare | MISP warninglist — plages Cloudflare | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/cloudflare/list.json | muette | HTTP 200 mais 0 item parsé |
| wl:misp:cloudflare-top1m | MISP warninglist — Cloudflare Radar top 1M | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/cloudflare-top1m/list.json | muette | HTTP 200 mais 0 item parsé |
| wl:misp:common-ioc-false-positive | MISP warninglist — faux positifs IOC courants | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/common-ioc-false-positive/list.json | muette | HTTP 200 mais 0 item parsé |
| wl:misp:datacenter-ipv4 | MISP warninglist — datacenter IPv4 | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/datacenter-ipv4/list.json | muette | HTTP 200 mais 0 item parsé |
| wl:misp:datacenter-ipv6 | MISP warninglist — datacenter IPv6 | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/datacenter-ipv6/list.json | muette | HTTP 200 mais 0 item parsé |
| wl:misp:majestic-million | MISP warninglist — Majestic Million | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/majestic_million/list.json | muette | HTTP 200 mais 0 item parsé |
| wl:misp:tranco | MISP warninglist — Tranco top 1M | https://raw.githubusercontent.com/MISP/misp-warninglists/main/lists/tranco/list.json | muette | HTTP 200 mais 0 item parsé |

La liste couvre les sources mortes et les sources muettes : elles consomment une cadence de collecte sans produire d'item vérifiable. Les sources lentes sont conservées et signalées dans le JSON.
OBJECTIF : atteint — 494 / 494
