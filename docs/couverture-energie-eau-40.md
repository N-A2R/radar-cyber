# Couverture « energie-eau » — Landes (40)

18 sources vérifiées, 52 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-energie-eau-40.jsonl` — preuve HTTP :
`bench/results/verification-energie-eau-40.json` — intégration :
`db/migrate-086-sources-energie-eau-40.sql` (ids `corpus:e40-*`,
`department='40'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| SYDEC 40 | syndicat mixte départemental | /actualites/ | /feed/ (10 items) |
| Grand Dax Agglomération | intercommunalité | actualite-agenda/ | Google Actualités « Grand Dax eau assainissement » |
| Ville de Mont-de-Marsan | commune | /connaitre-le-territoire/actualites/ | /feed/ |
| Chambre d'agriculture des Landes | chambre consulaire | /actualites-1 | Google Actualités « Chambre d'agriculture Landes eau » |
| Enedis | distributeur d'électricité | /presse | Google Actualités « Enedis Landes » |
| EDF | producteur d'électricité | Google Actualités « EDF Landes » | Google Actualités « EDF Landes energie » |
| ENGIE | opérateur énergétique | /explore/actualites/ | Google Actualités « ENGIE Landes » |
| GRDF | distributeur de gaz | /actualites | Google Actualités « GRDF Landes » |
| SUEZ | opérateur privé de l'eau | /fr/actualites | Google Actualités « SUEZ eau Landes » |
| SAUR | opérateur privé de l'eau | /fr/actualites/ | Google Actualités « SAUR Landes eau » |
| FP2E | fédération professionnelle | accueil | /feed/ (2 items) |
| CIEAU | organisation professionnelle | /categorie/actualite-de-eau/ | /feed/ (10 items) |
| DREAL Nouvelle-Aquitaine | administration régionale | filtre « Énergie » | backend-actu (176 items) |
| CCI des Landes | chambre consulaire | /presse/ | Google Actualités site:landes.cci.fr energie |
| Annuaire RGE (Landes 40) | annuaire professionnel | entreprises/landes-40 | Google Actualités « RGE Landes energie » |
| actu.fr — Actu Landes | presse en ligne | /landes/dernieres-actus | /landes/rss.xml (20 items) |
| Landes Info | presse en ligne | /edition | /feed/ (10 items) |
| ICI Gascogne | radio locale | /nouvelle-aquitaine/landes-40 | /rss/gascogne/rubrique/infos.xml |

## Méthode

Chaque URL a été chargée en GET avec un User-Agent de navigateur, en suivant
les redirections (délai 25 s) ; le code HTTP, le type de contenu et le nombre
d'items RSS/Atom ont été enregistrés. Les candidats suivants ont été écartés :
`www.landes.gouv.fr` (échec DNS/TLS), `www.landes.fr` et `www.veolia.com/fr`
(HTTP 403), `www.xlandes-info.fr` (HTTP 200 mais page anti-bot « Kenua
botstopper », sans contenu exploitable). Les flux Google Actualités ciblent
explicitement les Landes afin de rattacher les opérateurs nationaux au
département.

Exemple cyber réel relevé : fraude au compteur Linky et démarchages
frauduleux, alerte Enedis du 18/09/2026
(`https://news.google.com/rss/search?q=Enedis%20Landes%20arnaque&hl=fr&gl=FR&ceid=FR:fr`).
OBJECTIF : atteint — 18 / 5
