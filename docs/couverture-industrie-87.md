# Couverture « industrie » — Haute-Vienne (87)

13 sources vérifiées, 30 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-industrie-87.jsonl` — preuve HTTP :
`bench/results/verification-sources-industrie-87.json` — intégration :
`db/migrate-121-sources-industrie-87.sql` (ids `corpus:industrie-87-*`,
`department='87'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CPME 87 | organisation patronale départementale (PME, commerce, services et industrie) | https://www.cpme87.fr/actualites/ | — |
| MEDEF Limousin (territorial 87) | organisation patronale régionale couvrant la Haute-Vienne | https://limousin.territoriaux.medef.com/fr/actualites | — |
| Pôle Formation UIMM Limousin | centre de formation des industries métallurgiques et mécaniques | https://www.formations-industrieslimousin.fr/actualites/ | https://www.formations-industrieslimousin.fr/feed/ |
| UIMM Nouvelle-Aquitaine | syndicat professionnel des industries métallurgiques | https://www.uimmnouvelleaquitaine.com/actualite/news.html | — |
| CMA Limoges — Chambre des Métiers et de l'Artisanat de la Haute-Vienne | chambre consulaire des métiers et de l'artisanat industriel | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/ | — |
| Limoges Métropole — filière industrie | collectivité territoriale : filière industrie et parc technologique | https://www.limoges-metropole.fr/informations-transversales/actualites | https://www.limoges-metropole.fr/informations-transversales/actualites/rss |
| Le Populaire du Centre — Haute-Vienne | presse quotidienne régionale (87) | https://www.lepopulaire.fr/haute-vienne/ | — |
| franceinfo : France 3 Haute-Vienne | média public régional (87) | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss |
| 7 à Limoges — actualité et économie | télévision locale (Limoges et Haute-Vienne) | https://www.7alimoges.tv/Actualite_r16.html | https://www.7alimoges.tv/xml/syndication.rss |
| Societe.Tech — actualité des entreprises de Haute-Vienne | presse économique et technologique locale (87) | https://www.societe.tech/actualite-entreprises-nouvelle-aquitaine/actualite-entreprises-haute-vienne/ | — |
| Le Journal des Entreprises — Nouvelle-Aquitaine / Haute-Vienne | presse économique régionale | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/haute-vienne | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |
| Portail des entreprises de Nouvelle-Aquitaine | portail institutionnel régional d'aide aux entreprises | https://entreprises.nouvelle-aquitaine.fr/actualites | — |
| MEDEF Nouvelle-Aquitaine | organisation patronale régionale couvrant la Haute-Vienne | https://www.medef-nouvelle-aquitaine.fr/actualites | — |

## Méthode

Recherche d'organisations consulaires, patronales et sectorielles (CPME 87,
MEDEF Limousin et Nouvelle-Aquitaine, UIMM Limousin et Nouvelle-Aquitaine, CMA
Limoges), de collectivités et portails économiques (Limoges Métropole, portail
des entreprises de Nouvelle-Aquitaine), d'annuaires et de médias locaux couvrant
la Haute-Vienne (Le Populaire du Centre, France 3, 7 à Limoges, Societe.Tech,
Le Journal des Entreprises). Chaque URL du corpus a été téléchargée en GET avec
un User-Agent navigateur, redirections suivies, statut final, type MIME et
nombre d'octets relevés ; seules les URLs en HTTP 200 ont été intégrées.

 Écartées faute de HTTP 200 : site de la CCI de Limoges (403 Cloudflare),
`invest-in-nouvelle-aquitaine.fr` (403), `mesinfos.fr` (403 sur le site, seul le
flux RSS répond en 200), `www.uimm-limousin.fr` et `www.ester-technopole.fr`
(nom non résolu), flux de Societe.Tech (410).

## Exemples cyber

- France 3 Haute-Vienne : « Cyberattaque : le service d'identification des
  bovins et ovins touché, le travail des éleveurs limousins perturbé »
  (31/12/2024) —
  https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/le-service-d-identification-des-bovins-et-ovins-victime-d-une-cyberattaque-le-travail-des-eleveurs-limousins-perturbe-3084484.html
- Mémento ANSSI « Impact CYBER » (2024) : témoignage d'une imprimerie de 40
  salariés à Limoges dont le serveur a été chiffré à plusieurs reprises par des
  malwares, avec restauration par sauvegardes quotidiennes —
  https://www.cybermalveillance.gouv.fr/medias/2024/09/20240926Memento_ImpactCYBER_SCREEN.pdf
- Aucun incident cyber observé dans les autres pages et flux le 2026-11-22 ;
  les risques d'usurpation propres à chaque source sont décrits dans le corpus.

OBJECTIF : atteint — 13 / 5
