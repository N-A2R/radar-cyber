# Couverture « enseignement » — Landes (40)

26 sources vérifiées, 95 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités, flux RSS/Atom et articles d'exemple). Toutes les URL
du corpus répondent 200 ; une candidate (`XLandes-Info`) a été écartée parce
qu'elle renvoie une page « botstopper » malgré son code 200.

Corpus : `bench/corpus/sources-enseignement-40.jsonl` — preuve HTTP :
`bench/results/verification-enseignement-40.json` — intégration :
`db/migrate-122-sources-enseignement-40.sql` (ids `corpus:ens40-*`,
`department='40'`, `region='Nouvelle-Aquitaine'`). Vérification en base :
26 sources, dont 20 flux RSS, 95 traces `source_verification` en `ok200`.

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Lycée Victor Duruy (Mont-de-Marsan) | lycée | /actualites/ | /feed/ |
| Lycée Charles Despiau (Mont-de-Marsan) | lycée | /category/actualites-generales/ | /feed/ |
| Lycée Borda (Dax) | lycée | /actualites/ | /feed/ |
| Lycée professionnel Robert Wlérick (Mont-de-Marsan) | lycée professionnel | /actualites/ | /feed/ |
| Collège Jacques Prévert (Mimizan) | collège | /actualites/ | /feed/ |
| Collège René Soubaigné (Mugron) | collège | site | /feed/ |
| Collège Nelson Mandela (Biscarrosse) | collège | /actualites/ | /feed/ |
| Collège Jean Rostand (Tartas) | collège | /index.php?id_menu=44 | /rss.xml |
| Université de Pau et des Pays de l'Adour — campus de Mont-de-Marsan | université / IUT | /fr/actualites.html | /events/rss.xml |
| FSU-SNUipp | syndicat enseignant | accueil | /rss.xml |
| Fédération Syndicale Unitaire (FSU) | fédération syndicale | accueil | /feed/ |
| SNES-FSU | syndicat enseignant | /toute-lactualite/ | /feed/ |
| SNES-FSU Académie de Bordeaux (section Landes) | section académique | /Actualites.html | /spip.php?page=backend |
| UNSEN CGT Éduc'action | fédération syndicale | /nos-expressions/ | /feed/ |
| FCPE | fédération de parents d'élèves | /actualites | — |
| CCI Landes | chambre consulaire | /agenda-evenements/ | — |
| CMA Landes / CMA Nouvelle-Aquitaine | chambre consulaire | /a-cote-de-chez-vous/actualites | — |
| FNEC FP-FO | fédération syndicale | /actualites/ | /feed/ |
| SE-UNSA | syndicat enseignant | /actualites/ | /feed/ |
| ici Gascogne / ici Landes 40 | radio locale publique | /nouvelle-aquitaine/landes-40 | /rss/gascogne/rubrique/infos.xml |
| Fréquence Grands Lacs | radio locale | /actu.html | — |
| France 3 Nouvelle-Aquitaine — Landes | télévision locale | /societe/education | — |
| La Semaine des Pyrénées (rubrique Landes) | hebdomadaire régional | /category/landes/ | /feed/ |
| PresseLib (zone Landes) | pure player régional | /actualites/zone/Landes | — |
| Grand Dax — Actualités | média local | /connaitre-lagglo/actualite-agenda/ | /feed/ |
| Côte Sud FM | radio locale | /actualites/ | /feed/ |

Chaque ligne du corpus porte un `exemple_cyber` : un article réel, daté et
vérifié en HTTP 200 (cyberattaque de l'Éducation nationale, fiasco numérique,
cybersécurité, harcèlement et usages numériques scolaires, Cybermois, BTS
cybersécurité). Les sites `ac-bordeaux.fr` (rectorat, DSDEN) et `sudouest.fr`
ont été écartés : Cloudflare (403) ou boucle de redirection (307) empêchent un
contrôle HTTP 200 reproductible.
OBJECTIF : atteint — 26 / 5
