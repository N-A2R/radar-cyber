# Couverture « bâtiment » — Landes (40)

22 sources vérifiées, 55 URLs distinctes contrôlées en HTTP 200 le 2026-11-22
(sites, pages d'actualités et flux RSS/Atom). Aucune URL en échec retenue.

Corpus : `bench/corpus/sources-batiment-40.jsonl` — preuve HTTP :
`bench/results/verification-sources-batiment-40.json` — intégration :
`db/migrate-094-sources-batiment-40.sql` (ids `corpus:batiment-40-*`,
`department='40'`).

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CAPEB Landes | syndicat du bâtiment | /landes/actualites | — |
| CMA Nouvelle-Aquitaine (Landes) | chambre consulaire | /actualites ? Landes | — |
| Pro-RGE | annuaire RGE | entreprises/landes-40 | Google Actualités RGE Landes |
| Qualibat | certification et annuaire | /actualites | — |
| Artisanat.fr (CMA) | magazine des artisans | /magazine/actus | — |
| SiteArtisan | annuaire d'artisans | /blog/ | /blog/feed.xml |
| Artisans Réunis | annuaire départemental | /blog | — |
| CCI des Landes | chambre consulaire | /presse/ | Google Actualités site:landes.cci.fr |
| Ville de Mont-de-Marsan | urbanisme, habitat | /actualites/ | /feed/ |
| Grand Dax Agglomération | urbanisme, travaux | actualite-agenda/ | Google Actualités Grand Dax |
| ICI Gascogne | radio locale | /nouvelle-aquitaine/landes-40 | /rss/gascogne/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine | télévision locale | édition Landes | /landes/rss |
| actu.fr — Actu Landes | presse en ligne | /landes/dernieres-actus | /landes/rss.xml |
| Landes Info | presse en ligne | /edition | /feed/ |
| Les Annonces Landaises | hebdomadaire | /categories/collectivites/ | /feed/ |
| Google Actualités | agrégateur | veille « bâtiment Landes 40 » | /rss/search |
| CAUE des Landes | architecture, construction | /blog | /rss.xml |
| Technopôle Domolandes | construction durable (Dax) | /actualites/ | /feed/ |
| Cluster Odéys | construction durable | /actualites | /rss.xml |
| CERC Nouvelle-Aquitaine | observatoire de la construction | /category/actualites/ | /feed/ |
| Placéco Landes | presse économique locale | /landes/ | /landes/rss.xml |
| Artizo | annuaire des artisans | /catalogue/landes/ | — |

## Méthode

Chaque URL a été chargée en GET avec un User-Agent de navigateur, en suivant
les redirections (délai 25 s) ; le code HTTP, le type de contenu, l'URL effective
et le nombre d'octets ont été enregistrés dans la preuve JSON. Les candidats
écartés : `www.ffbatiment.fr` (HTTP 500, y compris la page fédération Landes),
`www.landes.gouv.fr` (échec DNS/TLS), `www.landes.fr` (HTTP 403),
`www.sudouest.fr/landes` (redirection 302 sans destination stable),
`annuaire-des-artisans.fr/landes` (HTTP 200 mais page anti-bot sans contenu),
`www.pappers.fr` (HTTP 403). Les flux Google Actualités ciblent explicitement
les Landes afin de rattacher les acteurs régionaux au département.

Exemples cyber observés sur les pages elles-mêmes : alerte de phishing
usurpant Qualibat (20/11/2026, `https://www.qualibat.com/actualites`) et guide
de cybersécurité pour les TPE artisanales (06/07/2026,
`https://www.artisanat.fr/magazine/actus`). Les autres entrées décrivent un
vecteur sectoriel, sans incident nommé dans la page observée le 2026-11-22.
OBJECTIF : atteint — 22 / 5
