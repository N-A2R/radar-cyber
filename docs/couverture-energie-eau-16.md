# Couverture des sources énergie / eau — Charente (16)

9 sources vérifiées le 2026-11-22, 24 URL uniques contrôlées en HTTP 200
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Périmètre : collectivités et services de Charente ayant compétence eau,
assainissement, énergie ou climat, presse locale de Charente, administration
régionale et fédérations professionnelles de l'eau couvrant le département.

| Source | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| GrandAngoulême | collectivité territoriale | https://www.grandangouleme.fr/ | https://www.grandangouleme.fr/actualites/ | https://www.grandangouleme.fr/feed/ |
| Grand Cognac | communauté d'agglomération | https://www.grand-cognac.fr/ | https://www.grand-cognac.fr/comprendre-lagglo/les-actualites | https://www.grand-cognac.fr/rss.xml |
| Conseil départemental de la Charente | institution départementale | https://www.lacharente.fr/ | https://www.lacharente.fr/actualite/a-la-une | — |
| Charente Libre — environnement | presse locale | https://www.charentelibre.fr/ | https://www.charentelibre.fr/environnement/ | https://www.charentelibre.fr/environnement/rss.xml |
| Sud Ouest — édition Charente | presse locale | https://www.sudouest.fr/charente/ | https://www.sudouest.fr/charente/ | https://www.sudouest.fr/charente/rss.xml |
| DREAL Nouvelle-Aquitaine | administration régionale | https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/ | spip.php?page=liste-actualites&lang=fr | spip.php?page=backend |
| Enedis | opérateur de réseau électrique | https://www.enedis.fr/ | https://www.enedis.fr/presse | — |
| FP2E | fédération professionnelle | https://www.fp2e.org/ | https://www.fp2e.org/actualites/ | https://www.fp2e.org/feed/ |
| CIEau | centre de ressources sur l'eau | https://www.cieau.com/ | https://www.cieau.com/actualites/ | https://www.cieau.com/feed/ |

Méthode : recherche web (presse locale, annuaires professionnels, SIRENE via
recherche-entreprises.api.gouv.fr, Google Actualités), puis contrôle HTTP de
chaque URL avec `curl -L` et vérification du type de contenu des flux
(`application/rss+xml`, `application/xml`, `text/xml`). Les candidats en 403
(CCI de Charente, ADEME Nouvelle-Aquitaine, Veolia, GRDF) et les homonymes
(`sde16.fr`, location de remorques à Cognac) ont été écartés.

Intégration : `bench/corpus/sources-energie-eau-16.jsonl`,
`db/migrate-065-sources-energie-eau-16.sql` (ids `corpus:ee16-*`,
`department='16'`, traces `source_verification` en `ok200`).

OBJECTIF : atteint — 9 / 5
