# Progression du corpus — 2026-11-21

Date : 2026-11-21 (Europe/Paris) · rapport précédent : 2026-11-21 · écart : 0 j

<!-- corpus-progression: {"date":"2026-11-21","depts":{"16":{"declarees":5,"productives":4,"rouges":1,"orgsAvecDomaine":0,"incidents":10},"17":{"declarees":3,"productives":2,"rouges":1,"orgsAvecDomaine":0,"incidents":12},"19":{"declarees":7,"productives":1,"rouges":7,"orgsAvecDomaine":0,"incidents":9},"23":{"declarees":5,"productives":2,"rouges":4,"orgsAvecDomaine":1,"incidents":0},"24":{"declarees":4,"productives":3,"rouges":3,"orgsAvecDomaine":0,"incidents":13},"33":{"declarees":6,"productives":3,"rouges":3,"orgsAvecDomaine":1,"incidents":0},"40":{"declarees":6,"productives":2,"rouges":6,"orgsAvecDomaine":0,"incidents":9},"47":{"declarees":7,"productives":3,"rouges":4,"orgsAvecDomaine":0,"incidents":0},"64":{"declarees":2,"productives":2,"rouges":0,"orgsAvecDomaine":0,"incidents":10},"79":{"declarees":3,"productives":1,"rouges":2,"orgsAvecDomaine":0,"incidents":9},"86":{"declarees":3,"productives":2,"rouges":1,"orgsAvecDomaine":0,"incidents":8},"87":{"declarees":3,"productives":2,"rouges":2,"orgsAvecDomaine":0,"incidents":8},"hors-na":{"declarees":0,"productives":0,"rouges":0,"orgsAvecDomaine":0,"incidents":0}},"total":{"declarees":54,"productives":27,"rouges":34,"orgsAvecDomaine":2,"incidents":88}} -->

## Synthèse

| Indicateur | Total | Depuis le 2026-11-21 |
| --- | ---: | ---: |
| Sources déclarées | 54 (0) | 0 |
| Sources productives | 27 (0) | 0 |
| Sources rouges | 34 (0) | 0 |
| Organisations avec domaine | 2 (0) | 0 |
| Incidents du corpus | 88 (0) | 0 |

## Par département

| Département | Sources déclarées | Sources productives | Sources rouges | Org. avec domaine | Incidents du corpus |
| --- | ---: | ---: | ---: | ---: | ---: |
| 16 — charente | 5 (0) | 4 (0) | 1 (0) | 0 (0) | 10 (0) |
| 17 — charente-maritime | 3 (0) | 2 (0) | 1 (0) | 0 (0) | 12 (0) |
| 19 — correze | 7 (0) | 1 (0) | 7 (0) | 0 (0) | 9 (0) |
| 23 — creuse | 5 (0) | 2 (0) | 4 (0) | 1 (0) | 0 (0) |
| 24 — dordogne | 4 (0) | 3 (0) | 3 (0) | 0 (0) | 13 (0) |
| 33 — gironde | 6 (0) | 3 (0) | 3 (0) | 1 (0) | 0 (0) |
| 40 — landes | 6 (0) | 2 (0) | 6 (0) | 0 (0) | 9 (0) |
| 47 — lot-et-garonne | 7 (0) | 3 (0) | 4 (0) | 0 (0) | 0 (0) |
| 64 — pyrenees-atlantiques | 2 (0) | 2 (0) | 0 (0) | 0 (0) | 10 (0) |
| 79 — deux-sevres | 3 (0) | 1 (0) | 2 (0) | 0 (0) | 9 (0) |
| 86 — vienne | 3 (0) | 2 (0) | 1 (0) | 0 (0) | 8 (0) |
| 87 — haute-vienne | 3 (0) | 2 (0) | 2 (0) | 0 (0) | 8 (0) |
| **Total** | **54** | **27** | **34** | **2** | **88** |

## Définitions

- **Déclarées** : une ligne de `source` dont le département est inféré par `/stats/departements` (`departementDeLaSource`).
- **Productives** : au moins un événement collecté, toutes dates confondues.
- **Rouges** : aucun événement, ou dernier fait antérieur à 7 jours (axe distinct de « productives » : une source peut être productive et rouge).
- **Organisations avec domaine** : `org.dept` du département et `domain` non vide.
- **Incidents du corpus** : lignes de `bench/corpus/*.jsonl` avec un `departement` reconnu.
- Les sources sans périmètre départemental explicite ne comptent nulle part : les totaux de sources sont des minimums.
- Les nombres entre parenthèses sont les écarts signés avec le rapport précédent ; un chiffre seul signifie qu'il n'y avait pas de rapport antérieur.
