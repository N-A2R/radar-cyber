# Progression du corpus — 2026-11-21

Date : 2026-11-21 (Europe/Paris) · rapport précédent : 2026-11-21 · écart : 0 j

Historique JSON : `docs/corpus-progression-historique.json`.

## Synthèse

| Indicateur | Total | Depuis le 2026-11-21 |
| --- | ---: | ---: |
| Sources déclarées | 54 (0) | 0 |
| Sources productives | 27 (0) | 0 |
| Sources rouges | 34 (0) | 0 |
| Organisations avec domaine | 9 (0) | 0 |
| Incidents du corpus | 122 (0) | 0 |

## Par département

| Département | Sources déclarées | Sources productives | Sources rouges | Organisations avec domaine | Incidents du corpus |
| --- | ---: | ---: | ---: | ---: | ---: |
| 16 — charente | 5 (0) | 4 (0) | 1 (0) | 7 (0) | 10 (0) |
| 17 — charente-maritime | 3 (0) | 2 (0) | 1 (0) | 0 (0) | 12 (0) |
| 19 — correze | 7 (0) | 1 (0) | 7 (0) | 0 (0) | 9 (0) |
| 23 — creuse | 5 (0) | 2 (0) | 4 (0) | 1 (0) | 9 (0) |
| 24 — dordogne | 4 (0) | 3 (0) | 3 (0) | 0 (0) | 13 (0) |
| 33 — gironde | 6 (0) | 3 (0) | 3 (0) | 1 (0) | 14 (0) |
| 40 — landes | 6 (0) | 2 (0) | 6 (0) | 0 (0) | 9 (0) |
| 47 — lot-et-garonne | 7 (0) | 3 (0) | 4 (0) | 0 (0) | 11 (0) |
| 64 — pyrenees-atlantiques | 2 (0) | 2 (0) | 0 (0) | 0 (0) | 10 (0) |
| 79 — deux-sevres | 3 (0) | 1 (0) | 2 (0) | 0 (0) | 9 (0) |
| 86 — vienne | 3 (0) | 2 (0) | 1 (0) | 0 (0) | 8 (0) |
| 87 — haute-vienne | 3 (0) | 2 (0) | 2 (0) | 0 (0) | 8 (0) |
| Hors Nouvelle-Aquitaine | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |

## Par famille

| Famille | Sources déclarées | Sources productives | Sources rouges | Organisations avec domaine | Incidents du corpus |
| --- | ---: | ---: | ---: | ---: | ---: |
| autre | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 2 (0) |
| compromission | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 36 (0) |
| cti | 50 (0) | 27 (0) | 30 (0) | 0 (0) | 0 (0) |
| cyberattaque | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 1 (0) |
| ddos | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 2 (0) |
| defacement | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 1 (0) |
| deni-de-service | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 1 (0) |
| escroquerie | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 1 (0) |
| fuite | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 39 (0) |
| hameçonnage | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 1 (0) |
| leaks | 1 (0) | 0 (0) | 1 (0) | 0 (0) | 0 (0) |
| phishing | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 20 (0) |
| presse | 1 (0) | 0 (0) | 1 (0) | 0 (0) | 0 (0) |
| presse_cyber | 1 (0) | 0 (0) | 1 (0) | 0 (0) | 0 (0) |
| ransomware | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 18 (0) |
| reputation | 1 (0) | 0 (0) | 1 (0) | 0 (0) | 0 (0) |
| sans-famille | 0 (0) | 0 (0) | 0 (0) | 9 (0) | 0 (0) |

## Définitions

- **Déclarées** : une ligne de `source` dont le département est inféré par `departementDeLaSource` (même règle que `/stats/departements`).
- **Productives** : au moins un événement collecté, toutes dates confondues.
- **Rouges** : aucun événement, ou dernier fait antérieur à 7 jours (axe distinct de « productives » : une source peut être productive et rouge).
- **Organisations avec domaine** : `org.dept` reconnu et `domain` non vide, rangées dans la famille de leur dernier événement, ou `sans-famille` sans événement.
- **Incidents du corpus** : lignes de `bench/corpus/incidents-*.jsonl` avec un `departement` reconnu ; leur famille est le champ `type` en minuscules.
- Les familles des sources viennent de `source.family` ; les familles des incidents viennent du corpus. Les deux vocabulaires se recouvrent sans se confondre.
- Les sources sans périmètre départemental explicite ne comptent nulle part : les totaux de sources sont des minimums.
- `valeur (écart)` donne le chiffre et sa variation signée depuis le rapport précédent ; `—` signifie qu'il n'y avait pas de rapport antérieur.

**Conclusion** : sources déclarées 54, sources productives 27, sources rouges 34, organisations avec domaine 9, incidents du corpus 122 ; depuis le 2026-11-21, sources déclarées 0, sources productives 0, sources rouges 0, organisations avec domaine 0, incidents du corpus 0.

Mesure reproductible : `pnpm mesure:corpus-progression --check` (lecture seule, aucune donnée personnelle).

OBJECTIF : atteint — 12 / 12 départements de Nouvelle-Aquitaine couverts par 5 indicateurs (60 / 60 cellules)

