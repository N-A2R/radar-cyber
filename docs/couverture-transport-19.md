# Sources d'information — secteur transport, département 19 (Corrèze)

OBJECTIF : atteint — 20 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 19 (Corrèze).

## Livrable

- `bench/corpus/sources-transport-19.jsonl` — 20 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-transport-19.json` — 70 URL contrôlées le 2026-11-22 (`curl -L`, redirections suivies, User-Agent navigateur), 70 × 200 ; 20/20 sources valides.
- `db/migrate-180-sources-transport-19.sql` — 20 sources `corpus:transport19-*` en `department='19'`, 64 URL uniques tracées dans `source_verification` en `ok200`. Migration appliquée à la base locale et rejouée sans doublon (135 sources du 19 et 3 126 traces avant et après le rejeu).
- `bench/corpus/HASH` régénéré après ajout du corpus.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Libéo — réseau de bus de l'Agglo de Brive | réseau de transport public (19) | `/vous-nous/actualites` | — |
| 2 | Aéroport Brive-Vallée de la Dordogne | aéroport (Brive-Souillac, 19) | `/actualites` | `/rss.xml` |
| 3 | Transports René Madrias | transport frigorifique (Ussac, 19) | `/actualites` | — |
| 4 | Groupe Verlhac Logistique | transporteur/logisticien (Brive, 19) | `/actualites` | — |
| 5 | SBFM — plateforme logistique de Brive | logistique/entrepôt (19) | `/fr/nos-actualites` | — |
| 6 | AV2S — manutention et levage | transport/manutention (Sainte-Fortunade, 19) | `/actualites` | — |
| 7 | Groupe BBL Transport | transport/logistique (Brive, 19) | `/le-groupe/` | — |
| 8 | CMA Corrèze | chambre consulaire des artisans du transport (19) | page Corrèze | — |
| 9 | Union TLF Sud-Ouest | fédération transport/logistique (couvre le 19) | `/nos-actualites/` | `/feed/` |
| 10 | FNTR | fédération nationale des transports routiers | accueil | — |
| 11 | FNTV | fédération nationale des transports de voyageurs | `/actualites-de-la-federation` | — |
| 12 | Transport Info | presse professionnelle transport/logistique | accueil | `/feed/` |
| 13 | La Montagne — Corrèze | presse locale (19) | `/info-en-continu` | `/MT-tempsforts-tous.xml` |
| 14 | actu.fr — Corrèze | presse en ligne (19) | `/nouvelle-aquitaine/correze_19/` | `/rss.xml` |
| 15 | ICI Corrèze | radio publique locale (19) | `/actu` | `/rss/limousin/a-la-une.xml` |
| 16 | France 3 Nouvelle-Aquitaine — Corrèze | télévision publique locale (19) | `/nouvelle-aquitaine/correze/` | `/rss` |
| 17 | Corrèze Actu | presse locale (19) | `/actualites` | `/api/rss/events` |
| 18 | Bréniges FM 95.6 | radio locale (19) | `/actualites` | `/actualites/flux.xml` |
| 19 | La Vie Corrézienne | presse économique locale (19) | `/actualites-actualites-entreprises.html` | — |
| 20 | Le Journal des Entreprises — Nouvelle-Aquitaine | presse économique régionale | `/nouvelle-aquitaine` | `/rss-nouvelle-aquitaine` |

Dix sources sont strictement départementales ou locales (1–8, 13–19) ; les autres sont des fédérations ou médias régionaux/nationaux dont la couverture inclut la Corrèze.

## Limites du contrôle

- La CCI de la Corrèze (`correze.cci.fr`) renvoie 403 : exclue malgré sa pertinence consulaire.
- `stgb.fr` (ancien réseau de bus), `briveagglo.fr`, `aeroport-brive-souillac.fr` et `tulle.fr` ne répondent pas (erreur DNS/connexion) ; les sites actifs Libéo et Aéroport Brive-Vallée de la Dordogne les remplacent.
- `mesinfos.fr/actus-limousin/` renvoie 403 (son flux RSS reste en 200 mais la page est inaccessible) : source non retenue.
- Le flux `correzeactu.com/api/rss/events` concerne les événements ; les actualités du site sont suivies par la page `/actualites`.
- Aucun flux RSS dédié n'a été trouvé pour les transporteurs locaux, la CMA Corrèze, la FNTR ou la FNTV ; leurs pages d'actualités sont suivies en HTML.
