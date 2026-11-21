# Le trou du référentiel — mesure du 2026-11-21

Script : `apps/api/node_modules/.bin/tsx scripts/mesure-referentiel.mts`.
Source : PostgreSQL `localhost:5433`, base `radar_d0` (instantané du
référentiel d'origine). Rejouer avec `--db=radar` pour mesurer l'état courant.
Lecture seule. **Chaque chiffre ci-dessous est le résultat d'une requête SQL**
exécutée par le script ; aucun n'est écrit en dur.

## Ce que le référentiel couvre

| Indicateur | Valeur |
| --- | --- |
| Organisations en base | 34 335 |
| Entreprises | 13 336 |
| Entreprises avec secteur renseigné | 13 332 (99,97 %) |
| Entreprises avec tranche d'effectif | 1 940 (14,55 %) |
| Salariés couverts (borne basse des tranches SIRENE) | 77 963 |

## Couverture par secteur

| Secteur | Entreprises | Part | Salariés (borne basse) |
| --- | ---: | ---: | ---: |
| numerique | 13 035 | 97,74 % | 12 463 |
| transport-logistique | 149 | 1,12 % | 25 500 |
| sante-social | 88 | 0,66 % | 24 600 |
| energie-eau-dechets | 37 | 0,28 % | 9 100 |
| finance-assurance | 23 | 0,17 % | 6 300 |
| agroalimentaire | 0 | 0,00 % | 0 |
| commerce | 0 | 0,00 % | 0 |
| construction | 0 | 0,00 % | 0 |
| industrie | 0 | 0,00 % | 0 |

## Couverture par taille d'entreprise

| Tranche d'effectif (borne basse SIRENE) | Entreprises | Part |
| --- | ---: | ---: |
| Non renseigné | 11 396 | 85,45 % |
| 1–9 | 1 283 | 9,62 % |
| 10–49 | 235 | 1,76 % |
| 50–249 | 277 | 2,08 % |
| 250 et + | 68 | 0,51 % |

## Le tableau nominatif du trou

| Secteur | Lignes | Dont ≥ 50 salariés | Verdict |
| --- | ---: | ---: | --- |
| agroalimentaire | 0 | 0 | trou confirmé |
| industrie | 0 | 0 | trou confirmé |
| construction | 0 | 0 | trou confirmé |
| commerce | 0 | 0 | trou confirmé |

Les quatre secteurs cités dans le chantier « référentiel entreprises complet »
sont ici nommés un par un, avec leur volume réel. À zéro ligne, ils ne peuvent
rattacher aucun incident : le taux de couverture global serait flatteur à tort.

### Croisement secteur × taille

| Secteur | Non renseigné | 1–9 | 10–49 | 50–249 | 250 et + |
| --- | ---: | ---: | ---: | ---: | ---: |
| agroalimentaire | 0 | 0 | 0 | 0 | 0 |
| industrie | 0 | 0 | 0 | 0 | 0 |
| construction | 0 | 0 | 0 | 0 | 0 |
| commerce | 0 | 0 | 0 | 0 | 0 |

Chaque cellule est un `count(*)` SQL sur le croisement secteur/tranche, y
compris les zéros : un secteur absent n'est pas un secteur couvert.

## Méthode

- Périmètre compté : `org.kind = 'entreprise'` ; le secteur vient de
  `org.sector` et la taille de la borne basse `org.effectif_min` (tranches
  SIRENE 1, 3, 6, 10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000).
- Un secteur sans aucune ligne est produit par un `LEFT JOIN` depuis une liste
  explicite, pas déduit de l'absence d'une ligne de résultat.
- Le total des salariés additionne des bornes basses : c'est un minorant, pas
  un effectif réel.
