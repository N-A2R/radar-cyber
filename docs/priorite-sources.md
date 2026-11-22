# Prioriser les sources par valeur — règle et mesure

> Objectif : **au moins 20 % de temps de cycle en moins à couverture égale**.
> Résultat mesuré le 2026-11-22 : **62,41 % de gain**, 41 items pertinents
> couverts dans les deux scénarios. Rapport rejouable :
> `bench/results/priorite-sources.json`.

## La mesure

Pour chaque source active, sur une fenêtre glissante de 30 jours :

```
valeur = items pertinents de Nouvelle-Aquitaine / temps de collecte
```

Un item pertinent est un événement régional admis par le moteur de pertinence
courant (score ou règle de couverture `org` / `epss` / `dept`). Le temps de
collecte est la somme des durées des `collector_run`. Aucune durée n'étant
journalisée dans la base de développement, l'unité est explicitement le
**nombre de runs** et elle est publiée avec le classement (`runs`, pas
`secondes`) : le rapport est alors des items par collecte. Aucune source sans
run ni item pertinent ne reçoit un zéro fabriqué : elle reste à sa cadence
déclarée.

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
| Sources mesurées | 275 | 275 |
| Collectes sur 30 jours | 214 710 | 80 715 |
| Temps cumulé de collecte | 783 691,5 s | 294 609,8 s |
| Items pertinents couverts | 41 | 41 |

**Gain : 62,41 %** du temps de collecte cumulé, à couverture égale (41/41).
Sur les 275 sources mesurées, 27 rapportent au moins un item et 248 n'en
rapportent aucun ; 87 sources actives sans mesure gardent leur cadence
déclarée. Le coût d'une collecte est celui de la mesure publiée
`bench/results/cadence.json` : **3,65 s**, dérivée de 1 007,2 s de lots pour
276 collectes appariées. Un item est couvert dès la première collecte qui suit
sa date, dans la fenêtre de 30 jours.

Tête du classement (valeur = items / runs) :

| Rang | Source | Items / 30 j | Runs | Valeur | Cadence avant → après |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | `gn-17` | 6 | 37 | 0,162162 | 3 600 s → 900 s |
| 2 | `cat-circl-news` | 2 | 23 | 0,086957 | 7 200 s → 1 800 s |
| 3 | `gn-16` | 3 | 37 | 0,081081 | 3 600 s → 900 s |
| 4 | `ransomlook` | 3 | 49 | 0,061224 | 3 600 s → 900 s |
| 5 | `gn-47` | 2 | 37 | 0,054054 | 3 600 s → 900 s |
| 6 | `presse-france3-na` | 3 | 76 | 0,039474 | 1 800 s → 450 s |

Le classement complet des 362 sources actives est dans
`bench/results/priorite-sources.json`.

## Rejouer

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-priorite-sources.mts
cd apps/api && ./node_modules/.bin/tsx test/run.ts test/valeur-sources.test.ts
```

Le script échoue si la couverture n'est pas égale ou si le gain passe sous
20 %. Les tests synthétiques vérifient la règle, le classement, la simulation
et la décision du planificateur sans base ni réseau.

## Limite honnête

Aucune durée par source n'est journalisée : le coût uniforme de 3,65 s est une
moyenne mesurée sur des lots, pas un chronomètre par source. Le gain porte sur
le temps de collecte cumulé du catalogue, pas sur le temps mur d'un tick
parallèle. Si des durées par source deviennent disponibles, la même règle les
utilisera automatiquement comme unité de temps et la mesure devra être rejouée.
