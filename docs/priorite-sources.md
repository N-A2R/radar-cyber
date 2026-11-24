# Prioriser les sources par valeur — règle et mesure

> Objectif : **au moins 20 % de temps de cycle en moins à couverture égale**.
> Résultat mesuré le 2026-11-24 sur `radar` : **61,87 % de gain**, 50 items
> pertinents couverts dans les deux scénarios. Rapport rejouable :
> `bench/results/priorite-sources.json` (`genereLe` : 2026-11-24T22:04:36.371Z).

## La mesure

Pour chaque source active, sur une fenêtre glissante de 30 jours :

```
valeur = items pertinents de Nouvelle-Aquitaine / temps de collecte
```

Un item pertinent est un événement régional admis par le moteur de pertinence
courant (score ou règle de couverture `org` / `epss` / `dept`). Le temps de
collecte est la somme des durées des `collector_run`. Aucune durée n'étant
journalisée pour la majorité des sources, l'unité publiée peut être le nombre
de runs (`runs`, items par collecte) ; quand des durées existent, elle est
`secondes`. L'unité est toujours publiée avec le classement, jamais devinée à
l'affiche. Aucune source sans run ni item pertinent ne reçoit un zéro fabriqué :
elle reste à sa cadence déclarée.

**Périmètre : sources réelles uniquement.** Les jeux d'or et sources
d'évaluation semés par les migrations 215, 216 et 224 sont écartés des trois
flux lus (événements, `collector_run`, catalogue) avant tout comptage, par le
motif `^(bench-|precision-eval-)`, publié dans le rapport sous
`methode.exclusionSourcesMesure`. Le registre `GET /api/sources` continue de
les afficher, mais ils ne reçoivent aucune cadence issue de la règle et
n'entrent ni dans le classement ni dans la simulation. Leurs 316 événements
sont non régionaux : ce sont des cas de mesure, pas des incidents, et ils ne
sont pas comptés comme items pertinents.

## La règle de planification

| Classe | Condition | Cadence |
| --- | --- | --- |
| `top` | premier quintile des sources productives, par valeur décroissante | 4× plus souvent que la cadence déclarée |
| `productif` | au moins un item pertinent sur 30 j | 2× plus souvent |
| `hebdomadaire` | zéro item pertinent sur 30 j, mais des runs mesurés | 604 800 s (7 jours) |
| `sans-mesure` | aucun run, aucun item | cadence déclarée, inchangée |

Égalité de valeur : départage par nombre d'items, puis par identifiant — le
classement est donc indépendant de l'ordre des lignes lues en base. Le plan
garde sa marge historique de 20 % : une cadence de 900 s déclenche une collecte
après 720 s.

La règle est calculée une seule fois dans `chargerCadencesValeur()` et la
même table de cadences alimente :

- le planificateur du cycle (`planifierCycle` et `runGenericSources`, servis
  par `server.ts`) ;
- la route `GET /api/collecte/plan` (`chargerPlanCycle`) ;
- la mesure (`simulerCycleValeur`), qui compare cadences déclarées et cadences
  priorisées sur le même jeu d'items.

Aucune source productive n'est ralentie ; les sources muettes ne sont pas
coupées, elles passent en hebdomadaire.

## Résultat mesuré

| | Avant | Après |
| --- | ---: | ---: |
| Sources mesurées | 281 | 281 |
| Collectes sur 30 jours | 219 253 | 83 596 |
| Temps cumulé de collecte | 800 273,4 s | 305 125,4 s |
| Items pertinents couverts | 50 | 50 |

**Gain : 61,87 %** du temps de collecte cumulé, à couverture égale (50/50).
Sur les 281 sources mesurées, 28 rapportent au moins un item et 253 n'en
rapportent aucun ; 2 734 sources actives sans mesure gardent leur cadence
déclarée. Le coût d'une collecte est celui de la mesure publiée
`bench/results/cadence.json` : **3,65 s**, dérivée de 1 007,2 s de lots pour
276 collectes appariées. Un item est couvert dès la première collecte qui suit
sa date, dans la fenêtre de 30 jours.

Tête du classement (valeur = items / temps de collecte) :

| Rang | Source | Items / 30 j | Temps | Valeur | Cadence avant → après |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | `eco-dordogne-libre` | 1 | 1 s * | 1 | 3 600 s → 900 s |
| 2 | `presse-sudouest-dordogne` | 1 | 1 s * | 1 | 1 800 s → 450 s |
| 3 | `presse-sudouest-charente` | 1 | 31 437,3 s | 0,000032 | 1 800 s → 450 s |
| 4 | `presse-sudouest-charente-maritime` | 1 | 47 161,6 s | 0,000021 | 1 800 s → 450 s |
| 5 | `certfr_misp` | 7 | 518 400,6 s | 0,000014 | 86 400 s → 21 600 s |
| 6 | `gn-17` | 6 | 521 542,0 s | 0,000012 | 3 600 s → 900 s |

\* temps borné à 1 s, voir la limite ci-dessous. La colonne « Items / 30 j »
compte des items pertinents de Nouvelle-Aquitaine, pas des incidents.

Le classement complet des 3 015 sources actives retenues est dans
`bench/results/priorite-sources.json`.

## Biais de périmètre corrigé

Le 2026-11-24, avant correction, la même mesure incluait 19 sources de mesure
dans le classement : `bench-leak-link` et `precision-eval-01` à
`precision-eval-18`. Elles apparaissaient comme `hebdomadaire`, avec 300
sources mesurées au lieu de 281. Elles portaient 19 runs réels (1 080 s) et
316 événements non régionaux ; surtout, leur cadence déclarée de 3 600 s
entrait dans la simulation « avant », soit **17 119 collectes simulées et
62 484,35 s de coût artificiel** (17 119 × 3,65 s). Le gain publié était
64,59 %. Après exclusion : 219 253 collectes « avant » au lieu de 236 372,
gain 61,87 %, couverture inchangée (50/50). Les 28 sources productives sont
exactement les mêmes : les sources exclues n'apportaient aucun item pertinent.
Le biais corrigé est un biais de périmètre, pas un changement de règle.

## Rejouer

La base `radar` est lue avec l'utilisateur `radar_app` (lecture seule) ; le
script n'écrit que le rapport JSON local.

```bash
set -a; source /home/jolt/.config/radar-cyber/api-security.env >/dev/null 2>&1; set +a
DATABASE_URL="$DATABASE_URL" apps/api/node_modules/.bin/tsx scripts/mesure-priorite-sources.mts
cd apps/api && ./node_modules/.bin/tsx test/run.ts test/valeur-sources.test.ts
```

Le script échoue si la couverture n'est pas égale ou si le gain passe sous
20 %. Les tests synthétiques vérifient la règle, le classement, l'exclusion
des sources de mesure, la simulation et la décision du planificateur sans base
ni réseau.

## Limite honnête

Les durées par source ne sont pas journalisées de façon exploitable : sur les
281 sources mesurées, 189 voient leur temps borné à 1 s (187 ont des runs de
durée cumulée nulle, 2 n'ont aucun run). Leur valeur affichée est donc égale
— les deux premières lignes du classement en sont l'illustration. Ce biais
d'unité est distinct du biais de périmètre corrigé ci-dessus ; il reste ouvert
et ces lignes ne doivent être lues ni comme un classement d'incidents ni
comme une productivité par seconde. Le coût uniforme de 3,65 s est une moyenne
mesurée sur des lots, pas un chronomètre par source. Le gain porte sur le
temps de collecte cumulé du catalogue, pas sur le temps mur d'un tick
parallèle. Si des durées par source deviennent disponibles, la même règle les
utilisera automatiquement comme unité de temps et la mesure devra être rejouée.
OBJECTIF : atteint — 61,87 % / 20 %
