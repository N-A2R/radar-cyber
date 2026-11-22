# Couverture des sources « juridique » — Charente (16)

14 sources vérifiées le 2026-11-22, 39 URL uniques contrôlées en HTTP 200
(sites, pages d'actualités, flux RSS/Atom et articles d'exemple cyber).
Aucune URL retenue en échec.

Périmètre : juridictions et greffes de Charente, chambre des notaires de la
Charente, chambre nationale et annuaire des commissaires de justice,
fédération notariale et presse locale (rubrique justice dédiée ou actualités
générales de Charente), annuaires professionnels et fédération patronale.

| Source | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Cour d'appel d'Angoulême | cour d'appel | https://www.cours-appel.justice.fr/angouleme/ | /actualites (justice.gouv.fr) | accueil |
| Tribunal judiciaire d'Angoulême | tribunal judiciaire | https://www.cours-appel.justice.fr/angouleme/tribunal-judiciaire-de-angouleme | /actualites (justice.gouv.fr) | accueil |
| Chambre des notaires de la Charente | chambre des notaires | https://chambre-charente.notaires.fr/ | /actualite | /actualite |
| Greffe du tribunal de commerce d'Angoulême | tribunal de commerce | https://www.greffe-tc-angouleme.fr/ | /actualites/ | /actualites/ |
| Charente Libre — rubrique Justice | presse locale | https://www.charentelibre.fr/societe/justice/ | accueil | /rss.xml |
| Sud Ouest — Charente | presse locale | https://www.sudouest.fr/charente/ | accueil | /rss.xml |
| actu.fr — Charente | presse locale | https://actu.fr/nouvelle-aquitaine/charente_16/ | accueil | /rss.xml |
| Chambre nationale des commissaires de justice | chambre professionnelle | https://commissaire-justice.fr/ | /actualites/ | /feed/ |
| Annuaire officiel des commissaires de justice | annuaire professionnel | https://annuaire.commissaire-justice.fr/ | /publications-dinformations/ | accueil |
| Notaires de France — actualites | fédération professionnelle | https://www.notaires.fr/fr | /fr/actualites | /fr/actualites |
| Notaires de France — annuaire de la Charente | annuaire professionnel | https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/charente | /fr/actualites | /fr/actualites |
| Avocat.fr — annuaire des avocats | annuaire professionnel | https://www.avocat.fr/ | /actualites | /rss.xml |
| CPME16 — Les Entrepreneurs Charente | fédération professionnelle | https://cpme16.fr/ | /actualites | /feed/ |
| Sud Ouest — rubrique Justice | presse locale | https://www.sudouest.fr/justice/ | accueil | /rss.xml |

Exemples cyber vérifiés HTTP 200 : piratage du fisc et groupe Zerobytes
(Charente Libre, 2026-09-04), hameçonnage de cabinets d'avocats (La Presse,
2026-10-29), fraudes et cyberattaques notariales (Notaires de France,
2026-05-26), piratage d'un couple de Saint-Angeau (Charente Libre,
2024-08-01), cyberattaques visant des frigos connectés (Charente Libre,
2026-11-09), fuite de données du PCF (Sud Ouest, 2026-10-23), fraudes à la
carte bancaire près d'Angoulême (actu.fr, 2026-11-19), piratage informatique
en Charente (Charente Libre, 2026-08-23).

Méthode : recherche web (annuaires professionnels, sites des juridictions,
chambres consulaires, presse locale, fédérations), puis contrôle de chaque URL
avec `curl -L` (User-Agent navigateur, redirections suivies) le 2026-11-22.
Les candidats morts ou sans contenu ont été écartés : plusieurs domaines de
barreaux (`barreauangouleme.fr`, `barreau-angouleme.fr`,
`ordre-avocats-angouleme.fr`) ne répondent pas, la rubrique justice de Sud
Ouest Charente et celle d'actu.fr Charente renvoient 404, la CCI de la Charente
renvoie 403 sous `curl` (protection anti-bot), le flux RSS de la chambre des
notaires de la Charente renvoie 404, et les pages des juridictions du ministère
de la Justice affichent un écran de maintenance (toujours en 200) : leurs
actualités réelles sont prises sur `justice.gouv.fr/actualites`.

Intégration : `bench/corpus/sources-juridique-16.jsonl`,
`bench/results/verification-sources-juridique-16.yaml`,
`db/migrate-074-sources-juridique-16.sql` (ids `corpus:jur16-*`,
`department='16'`, 44 traces `source_verification` en `ok200` dont 39 URL
uniques), appliquée à la base locale le 2026-11-22. Empreinte du corpus : `bench/corpus/HASH`.

OBJECTIF : atteint — 14 / 5
