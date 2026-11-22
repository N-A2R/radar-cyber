# Sources d'information — secteur « transport », département 86 (Vienne)

OBJECTIF : atteint — 28 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 86 (Vienne).

## Livrable

- `bench/corpus/sources-transport-86.jsonl` — 28 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-transport-86.json` — 65 URL contrôlées le 2026-11-22 (GET avec redirections suivies, User-Agent navigateur), 65 × 200, 28/28 sources valides, aucun flux vide.
- `db/migrate-200-sources-transport-86.sql` — 28 sources `corpus:transport86-*` en `department='86'` et 65 traces `ok200` dans `source_verification`. Migration appliquée le 2026-11-22 (436 → 464 sources, 182 → 247 traces) et rejouée sans doublon.
- `bench/corpus/HASH` régénéré après ajout du corpus.

## Sources retenues

| Source | Type | Actualités | Flux |
| --- | --- | --- | --- |
| La Nouvelle République — édition Vienne (86) | presse régionale | `/vienne` | `/api/v1/rss/5e20732239a34f77578b457c` (40 items) |
| ICI Poitou — actualités Vienne (86) | radio locale | `/nouvelle-aquitaine/vienne-86` | `/rss/poitou/a-la-une.xml` (40 items) |
| France 3 Nouvelle-Aquitaine — Vienne (86) | télévision locale | `/nouvelle-aquitaine/vienne` | `/nouvelle-aquitaine/vienne/rss` (30 items) |
| actu.fr — Poitiers (Vienne) | presse locale en ligne | `/nouvelle-aquitaine/poitiers_86194` | `/nouvelle-aquitaine/rss.xml` (20 items) |
| Le 7 — information de proximité dans la Vienne | presse locale en ligne | accueil | `/rss.xml` (10 items) |
| AquitaineOnLine — Poitou-Charentes | média régional | `/actualites-en-aquitaine/poitou-charentes/` | `/feed/rss/` (10 items) |
| TRM24 | presse spécialisée transport routier | accueil | `/feed/` (10 items) |
| Transport Info | presse professionnelle transport | accueil | `/feed/` (10 items) |
| Transporteurs.net | presse spécialisée transport | `/index_newA.asp` | — |
| Stratégies Logistique | presse spécialisée logistique | accueil | — |
| CCI de la Vienne — Poitiers | chambre consulaire | `/actualites/` | `/actualites/feed/` (10 items) |
| CMA Nouvelle-Aquitaine — CMA de la Vienne | chambre consulaire | `/a-cote-de-chez-vous/actualites` | — |
| Département de la Vienne — Mobi'Vienne | collectivité — mobilités | `/fil-infos/actualites` | `/fil-infos/actualites/rss?…` (15 items) |
| Grand Poitiers — actualités et mobilités | AOT des transports | `/information-transversale/actualites` | `/information-transversale/actualites/rss` (117 items) |
| Grand Châtellerault — actualités et mobilités | collectivité — transport à la demande | `/vivre/actualites` | — |
| Région Nouvelle-Aquitaine — transports | AOT TER et cars | `/toute-lactualite-des-transports` | `/liste-rss/naq_actualite` (76 items) |
| FNTV Nouvelle-Aquitaine | fédération régionale | `/region/fntv-nouvelle-aquitaine` | — |
| OTRE | syndicat du transport routier | `/actualites/` | `/feed/` (10 items) |
| FNTR | fédération nationale | accueil | — |
| FNTV | fédération nationale | `/actualites-de-la-federation` | — |
| Vitalis — Régie des Transports Poitevins | opérateur de transports en commun | `/actualites/` | — |
| Transdev Poitou-Charentes — infos trafic | opérateur interurbain | `/infos-trafic/` | — |
| Les Rapides du Poitou | autocars et transport scolaire | `/category/actualites/` | `/category/actualites/feed/` (10 items) |
| Transports Courcelle | transporteur routier et exceptionnel | `/actualites` | — |
| Technopole Futuroscope | plateforme logistique / pôle d'échanges | `/informations-transversales/actualites` | — |
| Groupe Mauffrey — établissement de Poitiers | transporteur et logisticien | `/actualites/` | `/feed/` (10 items) |
| Jeantet Ouest (groupe STJ) — Châtellerault | transporteur et logisticien | `/categorie-16979-actualites.html` | — |
| T.E.F.T. — Transport Express Fort Thubert | messagerie et marchandises | `/actualites.html` | — |

Dix-sept sources sont strictement départementales ou locales (presse Vienne/Poitiers, CCI et CMA de la Vienne, Département, Grand Poitiers, Grand Châtellerault, Vitalis, Transdev 86, Les Rapides du Poitou, Courcelle, Technopole Futuroscope, Jeantet Ouest, T.E.F.T.) ; les autres sont des fédérations ou médias régionaux/nationaux dont la couverture inclut la Vienne.

## Candidats écartés

- `vienne.cci.fr`, `cci-vienne.fr`, `cma-vienne.fr`, `uniontlf.fr`, `www.cma86.fr` : DNS inexistant ; les sites actifs `poitiers.cci.fr` et `cma-nouvelleaquitaine.fr` (page CMA Vienne) ont été retenus.
- `www.vienne.fr` : c'est la Ville de Vienne (Isère, 38), pas le département 86 ; le Département est `lavienne86.fr`. `vienne86.fr` est un site pirate sans rapport.
- `ter.sncf.com/nouvelle-aquitaine/actualites` et `sncf.com/fr/actualites` : HTTP 403 ; la page transports de la Région Nouvelle-Aquitaine (`transports.nouvelle-aquitaine.fr`, AOT TER) couvre le département.
- `poitiers.cci.fr/feed/`, `vitalis-poitiers.fr/feed/`, `transdev86.fr/feed/` : HTTP 200 mais flux vides ou périmés ; le flux réel de la CCI est `/actualites/feed/`, et Vitalis/Transdev sont suivis en HTML.
- `actu.fr/nouvelle-aquitaine/poitiers_86194/rss.xml` : 404 ; le flux Nouvelle-Aquitaine est retenu. `lejournaldelavienne.fr` : quotidien historique éteint, sans actualités en ligne.
- `kompass.com` (filtre 86) : 403 DataDome ; annuaires professionnels remplacés par les chambres consulaires et fédérations vérifiées.

## Méthode

Recherche des organisations du transport dans la Vienne (chambres consulaires, Département et EPCI, opérateurs de bus et autocars, transporteurs et plateformes logistiques, fédérations, annuaires professionnels, presse locale et spécialisée), lecture des pages publiques pour repérer les rubriques d'actualités et les flux, puis contrôle HTTP de chaque URL par GET avec redirections suivies (User-Agent navigateur, timeout 25 s). Seules les URL ayant répondu 200 ont été intégrées au corpus, au rapport et à la base.

OBJECTIF : atteint — 28 / 5
