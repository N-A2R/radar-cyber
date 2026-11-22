# Sources d'information — secteur « numerique » — Haute-Vienne (87)

OBJECTIF : atteint — 15 / 5

Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur « numerique » / département 87 (Haute-Vienne). Résultat : **15 sources en HTTP 200**, 53 URL contrôlées le 2026-11-22 (53 en HTTP 200, pages HTML et flux RSS exploitables).

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| ALIPTIC — cluster TIC du Limousin | cluster numérique régional | https://www.aliptic.net/ | https://www.aliptic.net/actualites.html | — |
| La French Tech Limousin | réseau de startups | https://www.lafrenchtech-limousin.com/accueil.html | https://www.lafrenchtech-limousin.com/actualites.html | — |
| ESTER Technopole — filière numérique et cybersécurité | technopole et incubateur | https://www.ester-technopole.org/ | https://www.ester-technopole.org/le-mag-dester/ | — |
| CPME 87 | organisation patronale départementale | https://www.cpme87.fr/ | https://www.cpme87.fr/actualites/ | — |
| Université de Limoges | établissement d'enseignement supérieur | https://www.unilim.fr/ | https://www.unilim.fr/category/actualites/ | https://www.unilim.fr/category/actualites/feed/ |
| ENSIL-ENSCI | école d'ingénieurs (ELT) | https://www.ensil-ensci.unilim.fr/ | idem | https://www.ensil-ensci.unilim.fr/feed/ |
| Work'in 87 | coworking et domiciliation | https://www.wi87.fr/ | https://www.wi87.fr/actualites/ | https://www.wi87.fr/feed/ |
| Ecomsoft | éditeur de logiciels métier | https://www.ecomsoft.fr/ | https://www.ecomsoft.fr/blog | https://www.ecomsoft.fr/feed |
| Héméra | coworking et réseau d'entrepreneurs | https://www.hemera.camp/ | https://www.hemera.camp/notre-actualite/ | https://www.hemera.camp/feed/ |
| 3W Stratégie | agence digitale (Verneuil-sur-Vienne) | https://3wstrategie.fr/ | https://3wstrategie.fr/le-blog-du-marketing-digital/ | https://3wstrategie.fr/feed/ |
| Fluffy Agency | agence web à Limoges | https://fluffy-agency.com/ | https://fluffy-agency.com/blog/ | https://fluffy-agency.com/feed/ |
| Ville de Limoges | collectivité — service public numérique | https://www.limoges.fr/ | https://www.limoges.fr/actualites | https://www.limoges.fr/rss.xml |
| Limoges Métropole | collectivité — filière numérique et cyber | https://www.limoges-metropole.fr/ | https://www.limoges-metropole.fr/informations-transversales/actualites | — |
| France 3 Haute-Vienne | média public local | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/ | idem | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss |
| ici Limousin | radio publique locale | https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87 | https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87/limoges | https://www.ici.fr/rss/limousin/rubrique/infos.xml |

## Ancrage territorial et exemples cyber

Les organisations retenues sont établies en Haute-Vienne (ALIPTIC et French Tech Limousin à Limoges, ESTER Technopole, CPME 87, Université de Limoges, ENSIL-ENSCI, Work'in 87, Ecomsoft, Héméra, 3W Stratégie à Verneuil-sur-Vienne, Fluffy Agency, Ville de Limoges, Limoges Métropole) ou couvrent explicitement le département (France 3 Haute-Vienne, ici Limousin).

Exemples d'actualités numériques/cyber vérifiées en HTTP 200 : RDV Cyber à l'Université de Limoges (ALIPTIC), gouvernance de l'IA et protection des actifs numériques (French Tech Limousin), SecNumEco 2026 (ESTER), conférence cybersécurité avec la CPME 87, DU Santé Numérique (Université de Limoges), conférence sur la cybercriminalité (ENSIL-ENSCI), équipement numérique des bureaux (Work'in 87), choix d'un logiciel métier (Ecomsoft), vie de l'écosystème entrepreneurial (Héméra), SEO et GEO à l'ère de l'IA (3W Stratégie), agence web fondée à Limoges (Fluffy Agency), cybersécurité à la Ville de Limoges, filière numérique et cybersécurité de Limoges Métropole, cyberattaque contre le ministère de l'Intérieur (France 3 et ici Limousin).

## Méthode, preuves et intégration

Découverte par recherche web ciblée (Exa) sur les annuaires professionnels, chambres consulaires, fédérations, clusters, technopoles, établissements d'enseignement et presse locale. Chaque URL a été contrôlée par un GET réel avec suivi des redirections, User-Agent navigateur, délai de 20 s et concurrence 8 : 53 URL, toutes en HTTP 200, avec type de contenu, URL finale, octets et nombre d'items RSS enregistrés.

Candidats écartés après contrôle HTTP : CCI de Limoges (403 Cloudflare), MEDEF Limousin (503), Les Échos Limousins (DNS), mesinfos.fr (403), Sud Ouest Limoges (404), flux ESTER `/feed/` (500 et aucun item), flux ALIPTIC et French Tech (404), page `/actualites` du Département (404). Le flux `/le-mag-dester/feed/` répond 200 mais sans item exploitable : il n'est pas enregistré comme flux dans le corpus.

Corpus : `bench/corpus/sources-numerique-87.jsonl` (15 lignes, empreinte recalculée dans `bench/corpus/HASH`).
Rapport : `bench/results/verification-sources-numerique-87.json` (53 URL, code HTTP, type de contenu, URL finale et items RSS).
Base : `db/migrate-181-sources-numerique-87.sql` (15 sources insérées dans `source`, 53 traces dans `source_verification`, `department = '87'`). Contrôle après application : `sources=15`, `verifications=53`, `http200=53`.
