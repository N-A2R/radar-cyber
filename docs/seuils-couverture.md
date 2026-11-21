# Seuils de publication du taux de couverture global

Un taux de couverture n'est pas publiable dès qu'il est calculable. Trois
garde-fous s'appliquent **avant** toute publication du chiffre global produit
par `scripts/couverture-globale.mts` : corpus trop petit, référentiel trop troué,
sources trop peu productives. Si l'un d'eux échoue, le chiffre n'est pas publié :
le script écrit `refus de publication : …` sur stderr, sort avec le code 1 et ne
produit **aucun** fichier JSON, même quand `--json=` est demandé. Les raisons du
refus sont toujours énumérées en clair, jamais réduites à une case vide.

Les seuils sont des constantes exportées par le script ; ce document les
commente, il ne les duplique pas. Leur valeur s'applique aux incidents de la
fenêtre de mesure (`meta.fenetre` du corpus), pas à la taille brute du fichier.

## Les trois seuils

| Garde-fou | Mesure | Seuil (publiable si…) | Constante |
| --- | --- | --- | --- |
| Corpus | incidents dont `datePublique` est dans la fenêtre | ≥ 30 | `SEUIL_CORPUS_MIN` |
| Référentiel | part des 4 secteurs attendus présents dans `org` | ≥ 75 % (3 secteurs sur 4) | `SEUIL_SECTEURS_PUBLIABLES` |
| Sources | éditeurs distincts parmi les incidents de la fenêtre, et part maximale d'un éditeur | ≥ 5 éditeurs **et** part max ≤ 50 % | `SEUIL_SOURCES_DISTINCTES_MIN`, `SEUIL_PART_SOURCE_MAX` |

### Corpus : au moins 30 incidents dans la fenêtre

Un corpus de 5 lignes ne permet aucune affirmation générale : à effectif égal,
l'intervalle de confiance à 95 % d'un taux observe ±30 points autour du chiffre.
Le seuil de 30 le ramène à environ ±17 points au pire endroit (taux de 50 %).
Il s'applique au dénominateur réel — les incidents hors fenêtre restent du
contexte et ne comptent pas pour franchir le seuil.

### Référentiel : au moins trois secteurs attendus sur quatre

Le garde-fou existe déjà dans `apps/api/src/analyse/publiabilite.ts` et est
réutilisé tel quel, sans second seuil parallèle. Les secteurs attendus sont
`agroalimentaire`, `industrie`, `construction`, `commerce`. Avec zéro ligne hors
numérique, un taux arithmétiquement juste ne mesure que le numérique : il est
refusé avec la liste des secteurs absents.

### Sources : au moins cinq éditeurs, aucun au-dessus de la moitié du corpus

Un chiffre tiré d'un seul quotidien mesure la couverture de ce quotidien, pas
celle de la Nouvelle-Aquitaine. La source d'un incident est `preuve.editeur`
(lecture insensible à la casse) ; les incidents sans éditeur ne comptent pas
comme source, mais restent dans le dénominateur du corpus. Deux conditions :
au moins 5 éditeurs distincts, et aucun éditeur ne fournit plus de 50 % des
incidents *avec éditeur* de la fenêtre. Le refus nomme le nombre d'éditeurs et
la part maximale observée.

## Ce que le refus dit, et ce qu'il ne dit pas

- Le refus porte sur la **publication du chiffre global**, pas sur la mesure :
  les incidents restent documentés et la mesure détaillée peut continuer à être
  publiée avec ses motifs (`docs/couverture-mesuree.md`).
- Plusieurs garde-fous peuvent échouer en même temps : toutes les raisons sont
  renvoyées, pour ne pas découvrir le deuxième trou après avoir corrigé le premier.
- Le seuil est un plancher de publicabilité, pas un objectif de qualité. Un
  corpus de 42 incidents et 27 éditeurs distincts franchit la porte sans que
  cela assure l'exhaustivité des incidents réels.
- Le taux produit une fois la porte franchie est un taux brut de reconnaissance
  (rejeu du corpus contre le moteur) : il ne mesure ni le délai réel de collecte
  ni la qualité du rattachement, qui restent dans `scripts/mesure-couverture.mts`.

## Usage et vérification

```bash
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts --json=bench/results/couverture-globale.json
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts --corpus=bench/fixtures/corpus-temoin-na.json
```

Le test unitaire `apps/api/test/couverture-globale.test.ts` fournit un corpus de
**5 lignes** et vérifie que la publication est refusée avec le motif
`corpus_trop_petit` : aucune connexion à la base, aucun réseau, aucun fichier
écrit.

```bash
cd apps/api && node_modules/.bin/tsx test/run.ts test/couverture-globale.test.ts
```
