# Couverture des sources « enseignement » — Charente (16)

17 sources vérifiées le 2026-11-22, 42 URL uniques contrôlées en HTTP 200
(sites, pages d'actualités et flux RSS/Atom). Aucune URL retenue en échec.

Périmètre : établissements et opérateurs de l'enseignement de la Charente
(IUT, campus universitaire, Cnam, GRETA-CFA, CROUS, écoles, lycées, collèges),
pôle image / formation aux métiers de l'image, presse locale de Charente,
syndicats et fédérations du secteur.

| Source | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| IUT d'Angoulême | IUT | https://iut-angouleme.univ-poitiers.fr/ | /actualites/ | /feed/ |
| Campus universitaire d'Angoulême | campus universitaire | https://angouleme.univ-poitiers.fr/ | /actualites/ | /feed/ |
| Cnam-Enjmin Angoulême | école supérieure (CNAM) | https://enjmin.cnam.fr/ | /cnam-enjmin/agenda/ | — |
| GRETA-CFA Aquitaine (Charente) | formation continue | https://greta-cfa-aquitaine.fr/ | /actualites/ | — |
| CROUS de Poitiers — Angoulême | CROUS | https://www.crous-poitiers.fr/ | /actualites/ | /feed/ |
| ÉESI Angoulême | école supérieure | https://eesi.eu/site/index.php | accueil | spip.php?page=backend |
| LISA Angoulême | lycée professionnel | https://www.lycee-image-son-angouleme.fr/ | /category/activites-vie-du-lycee/journal-du-lycee-lisactu/ | /feed/ |
| Magelis Angoulême | pôle image | https://magelis.org/ | /infos/actualites/ | /feed/ |
| Lycée Louise Michel (Ruffec) | lycée professionnel | https://lycee-louise-michel.fr/ | accueil | /feed/ |
| Lycée Chabanne (Angoulême) | lycée | https://www.lycee-chabanne16.fr/ | accueil | /feed |
| Saint-Joseph / Beaulieu (Cognac) | lycée professionnel | https://www.saintjoseph-cognac.fr/ | /actualites/ | /feed/ |
| Collège Félix Gaillard (Cognac) | collège | https://etab.ac-poitiers.fr/coll-felix-gaillard-cognac/ | accueil | — |
| Charente Libre — éducation | presse locale | https://www.charentelibre.fr/ | /education/ | /education/rss.xml |
| Sud Ouest — Charente | presse locale | https://www.sudouest.fr/charente/ | accueil | /charente/rss.xml |
| actu.fr — Charente | presse locale | https://actu.fr/nouvelle-aquitaine/charente_16/ | accueil | /rss.xml |
| SNES-FSU | syndicat enseignement | https://www.snes.edu/ | /article/ | /feed/ |
| UNSA Éducation | fédération enseignement | https://www.unsa-education.com/ | /actualites/ | /feed/ |

Exemples cyber vérifiés HTTP 200 : crise cyber de l'Université de Poitiers
(RéSISTeCC), mini-usine de cybersécurité industrielle et CTF Root-Me PRO 2026
au lycée Louise Michel de Ruffec, cyberattaque de la Cité de la BD d'Angoulême
(Charente Libre).

Méthode : recherche web (annuaires d'établissements, sites d'académie,
presse locale, fédérations), puis contrôle de chaque URL avec `curl -L`
(User-Agent navigateur, redirections suivies) le 2026-11-22. Les candidats
bloqués ont été écartés : inspection académique de Charente et académie de
Poitiers (403 Cloudflare sur `ac-poitiers.fr`), CCI de Charente et
PagesJaunes (403), PEEP (échec réseau).

Intégration : `bench/corpus/sources-enseignement-16.jsonl`,
`bench/results/verification-sources-enseignement-16.json`,
`db/migrate-070-sources-enseignement-16.sql` (ids `corpus:ens16-*`,
`department='16'`, 42 traces `source_verification` en `ok200`), appliquée à la
base locale le 2026-11-22. Empreinte du corpus : `bench/corpus/HASH`.

OBJECTIF : atteint — 17 / 5
