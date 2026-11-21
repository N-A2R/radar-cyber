# Seuils de publication du chiffre de couverture

Un taux de couverture n'est pas publiable dès qu'il est calculable. Quatre
garde-fous s'appliquent **avant** toute publication du chiffre global : corpus
trop petit, référentiel trop troué, sources trop peu productives, fenêtre trop
courte. S'il échoue, le chiffre n'est pas publié : `GET /api/couverture` renvoie
`publiable: false`, une `raison` explicite et le détail sous `publication` ;
`scripts/couverture-globale.mts` écrit `refus de publication : …` sur stderr,
sort avec le code 1 et ne produit aucun JSON, même avec `--json=`. Les raisons
sont toujours énumérées en clair, jamais réduites à une case vide.

Les seuils sont des constantes exportées par
`apps/api/src/analyse/seuils-couverture.ts` ; ce document les commente, il ne
les duplique pas. Ils s'appliquent aux incidents de la fenêtre de mesure, pas à
la taille brute du fichier. Le référentiel réutilise le garde-fou déjà défini
dans `apps/api/src/analyse/publiabilite.ts`, sans second seuil parallèle.

## Les quatre seuils

| Garde-fou | Mesure | Seuil (publiable si…) | Constante |
| --- | --- | --- | --- |
| Corpus | incidents dont `date_publication` est dans la fenêtre | ≥ 30 | `SEUIL_CORPUS_MIN` |
| Référentiel | part des 4 secteurs attendus présents dans `org` | ≥ 75 % (3 secteurs sur 4) | `SEUIL_SECTEURS_PUBLIABLES` |
| Sources | éditeurs distincts parmi les incidents de la fenêtre, et part maximale d'un éditeur | ≥ 5 éditeurs **et** part max ≤ 50 % | `SEUIL_SOURCES_DISTINCTES_MIN`, `SEUIL_PART_SOURCE_MAX` |
| Fenêtre | jours calendaires entre la première et la dernière publication, bornes incluses | ≥ 90 jours | `SEUIL_FENETRE_JOURS_MIN` |

### Corpus : au moins 30 incidents dans la fenêtre

Un corpus de 5 lignes ne permet aucune affirmation générale : à effectif égal,
l'intervalle de confiance à 95 % d'un taux observé fait ±30 points autour du
chiffre. Le seuil de 30 le ramène à environ ±17 points au pire endroit (taux de
50 %). Il s'applique au dénominateur réel — les incidents hors fenêtre restent
du contexte et ne comptent pas pour franchir le seuil.

### Référentiel : au moins trois secteurs attendus sur quatre

Les secteurs attendus sont `agroalimentaire`, `industrie`, `construction`,
`commerce`. Avec zéro ligne hors numérique, un taux arithmétiquement juste ne
mesure que le numérique : il est refusé avec la liste des secteurs absents. La
mesure du 21 novembre 2026 portait justement 0 ligne dans ces quatre secteurs
(`docs/reproduction-couverture.md`) ; la base de travail en porte désormais
11 209 en agroalimentaire, 48 895 en industrie, 115 581 en construction et
175 250 en commerce, soit 4/4 : ce garde-fou ne refuse plus le chiffre actuel.

### Sources : au moins cinq éditeurs, aucun au-dessus de la moitié du corpus

Un chiffre tiré d'un seul quotidien mesure la couverture de ce quotidien, pas
celle de la Nouvelle-Aquitaine. La source d'un incident est `source` dans le
corpus de couverture, `preuve.editeur` dans le corpus du script global (lecture
insensible à la casse) ; les incidents sans éditeur ne comptent pas comme
source, mais restent dans le dénominateur du corpus. Le corpus mesuré porte 14
éditeurs distincts et une part maximale de 25 % (Sud Ouest, 5 incidents sur 20)
: il passe. Le refus nomme le nombre d'éditeurs et la part maximale observée.

### Fenêtre : au moins 90 jours

Une fenêtre de quelques jours mesure une semaine de collecte, pas une
couverture. Sur les 42 incidents du corpus de référence tombant dans sa fenêtre
de 365 jours, le nombre mensuel varie de 1 (janvier, mai et juin) à 9 (octobre
2026) : un mois isolé peut donc multiplier le taux par neuf selon la période.
Le plancher de 90 jours couvre un trimestre, assez pour ne pas résumer la
période à un seul pic. La fenêtre du corpus mesuré va du 2024-04-19 au
2026-09-15, soit 880 jours : elle passe largement.

## Ce que le refus dit, et ce qu'il ne dit pas

- Le refus porte sur la **publication du chiffre global**, pas sur la mesure :
  les incidents restent documentés et la mesure détaillée continue d'être
  publiée avec ses motifs (`docs/couverture-mesuree.md`). Le rapport
  `bench/results/couverture-mesuree.json` porte le verdict de publication à
  côté du chiffre et de ses preuves.
- `GET /api/couverture` renvoie `publiable`, `mention`, `raison` (`null` quand
  tout passe) et le verdict détaillé sous `publication`, avec les motifs
  `corpus_trop_petit`, `referentiel_trop_troue`, `sources_trop_peu_productives`,
  `fenetre_courte`.
- Plusieurs garde-fous peuvent échouer en même temps : toutes les raisons sont
  renvoyées, séparées par « ; », pour ne pas découvrir le deuxième trou après
  avoir corrigé le premier.
- Le seuil est un plancher de publicabilité, pas un objectif de qualité. Un
  corpus de 42 incidents et 27 éditeurs distincts franchit la porte sans que
  cela assure l'exhaustivité des incidents réels.
- Le taux produit une fois la porte franchie est un taux brut de reconnaissance
  (rejeu du corpus contre le moteur) : il ne mesure ni le délai réel de collecte
  ni la qualité du rattachement, qui restent dans `scripts/mesure-couverture.mts`.

## Le chiffre actuel

**0 % (0 incident vu sur 20) n'est pas publiable.** Les trois autres garde-fous
passent (4/4 secteurs, 14 éditeurs dont aucun au-dessus de 25 %, 880 jours),
mais le corpus ne compte que 20 incidents sur les 30 exigés. La raison servie
est : « Corpus trop petit : 20 incident(s) dans la fenêtre 2024-04-19 →
2026-09-15, seuil minimal 30. »

## Usage et vérification

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-couverture-systeme.mts
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts --json=bench/results/couverture-globale.json
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts --corpus=bench/fixtures/corpus-temoin-na.json
```

`apps/api/test/couverture-publication.test.ts` rejoue la mesure sur 5 lignes
(refus avec raison chiffrée) et sur 50 lignes (publication) ; un troisième cas
vérifie le refus d'une fenêtre de 30 jours.
`apps/api/test/couverture-api.test.ts` vérifie le verdict tel que servi par
`GET /api/couverture`, et `apps/api/test/couverture-globale.test.ts` couvre la
porte du script global.

```bash
cd apps/api && RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres' \
  node_modules/.bin/tsx test/run.ts test/couverture-publication.test.ts \
  test/couverture-api.test.ts test/couverture-globale.test.ts
```
