# Sources d'information — secteur transport, département 23 (Creuse)

OBJECTIF : atteint — 21 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 23 (Creuse).

## Livrable

- `bench/corpus/sources-transport-23.jsonl` — 21 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-transport-23.json` — 74 URL contrôlées le 2026-11-22 (`curl -L`, redirections suivies, User-Agent navigateur), 74 × 200 ; 21/21 sources valides.
- `db/migrate-199-sources-transport-23.sql` — 21 sources `corpus:transport23-*` en `department='23'` et 67 couples source/url tracés dans `source_verification` en `ok200`. Migration appliquée à la base locale (`127.0.0.1:5433`) et rejouée sans doublon (21 sources et 67 traces avant et après le rejeu).
- `scripts/verif-corpus-transport-23.py` — rejeu de la vérification HTTP du corpus.
- `bench/corpus/HASH` régénéré après ajout du corpus.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Cars régionaux Nouvelle-Aquitaine — Creuse | cars interurbains du 23 (16 lignes) | toute l'actualité des transports | `/liste-rss/naq_actualite` |
| 2 | Agglo'Bus — Grand Guéret | bus urbains et TAD (23) | `/lagglo/actualites/` | `/feed/` |
| 3 | Nouvelle-Aquitaine Mobilités | autorité organisatrice régionale | `/actualites` | — |
| 4 | Aéroclub de la Creuse — Guéret Saint-Laurent | aérodrome / aéroclub (23) | accueil | `/feed/` |
| 5 | Ville d'Aubusson — transports en car | gare routière et lignes régionales (23) | `/actualites/` | — |
| 6 | Creuse Ambulances (Guéret) | transport sanitaire et taxi (23) | accueil | — |
| 7 | Montagne Ambulances (Aubusson, Felletin) | transport sanitaire et taxi (23) | accueil | — |
| 8 | Emaland Transports (Guéret) | fret routier et convois exceptionnels (23) | accueil | — |
| 9 | Annuaire e-pro — transport routier en Creuse | annuaire professionnel (11 sociétés à Guéret) | fiche Guéret | — |
| 10 | CMA Nouvelle-Aquitaine — Creuse | chambre consulaire des artisans (23) | page Creuse | — |
| 11 | Conseil départemental de la Creuse | infrastructures et mobilité (23) | `/A-la-une` | — |
| 12 | FNTR | fédération des transports routiers | `/espace-presse/actualites-agenda` | — |
| 13 | FNTV | fédération des transports de voyageurs | `/actualites-de-la-federation` | — |
| 14 | OTRE | fédération des transporteurs routiers (antenne Limousin) | `/actualites/` | `/feed/` |
| 15 | Union TLF Sud-Ouest | fédération régionale transport/logistique | `/nos-actualites/` | `/feed/` |
| 16 | Transport Info | presse professionnelle transport | accueil | `/feed/` |
| 17 | L'Officiel des transporteurs | presse professionnelle transport | `/actualites/` | `/rss.xml` |
| 18 | La Montagne — Creuse | presse locale (23) | info en continu Creuse | `/MT-tempsforts-tous.xml` |
| 19 | actu.fr — Actu Creuse | presse locale (23) | `/nouvelle-aquitaine/creuse_23/` | `/rss.xml` |
| 20 | ICI Creuse — Radio France | radio publique locale (23) | `/nouvelle-aquitaine/creuse-23` | `/rss/creuse/a-la-une.xml` |
| 21 | France 3 Nouvelle-Aquitaine — Creuse | télévision publique locale (23) | `/nouvelle-aquitaine/creuse` | `/rss` |
Quatorze sources sont strictement départementales ou locales (1, 2, 4–11, 18–21) ; les autres sont des fédérations ou médias professionnels dont la couverture inclut la Creuse. Chaque ligne porte un exemple cyber vérifié en 200 : cyberattaque de l'agglo du Grand Guéret, rançongiciel de Picoty SA à La Souterraine, attaques contre les transporteurs Guyamier/Transdev, coûts du risque cyber dans le TRM.

## Limites du contrôle

- La CCI de la Creuse (`creuse.cci.fr`) et le site TER SNCF (`ter.sncf.com`) renvoient 403 au sondage HTTP : exclus malgré leur pertinence.
- Aucun flux RSS dédié n'a été trouvé pour les transporteurs et structures sanitaires locaux, la CMA Creuse, la FNTR, la FNTV, Nouvelle-Aquitaine Mobilités ou la Ville d'Aubusson : leurs pages d'actualités sont suivies en HTML.
- Le flux de La Montagne est inter-départements ; la page « info en continu Creuse » fournit le filtrage départemental.
