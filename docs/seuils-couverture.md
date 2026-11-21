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

Un corpus de 5 lignes ne permet aucune affirmation générale : avec 0 incident
vu sur 5, la borne supérieure de l'intervalle de Wilson à 95 % est 43,5 % ;
elle tombe à 11,4 % pour 30 incidents et 7,1 % pour 50. À taux de 50 %, la
demi-largeur passe d'environ ±33 points (n=5) à ±17 points (n=30).
Il s'applique au dénominateur réel — les incidents hors fenêtre restent
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
source, mais restent dans le dénominateur du corpus. Le corpus mesuré porte 17
éditeurs distincts et une part maximale de 30 % (Sud Ouest, 15 incidents sur
50) : il passe. Le refus nomme le nombre d'éditeurs et la part maximale observée.

### Fenêtre : au moins 90 jours

Une fenêtre de quelques jours mesure une semaine de collecte, pas une
couverture. Sur les 42 incidents du corpus de référence tombant dans sa fenêtre
de 365 jours, le nombre mensuel varie de 1 (janvier, mai et juin) à 9 (octobre
2026) : un mois isolé peut donc multiplier le taux par neuf selon la période.
Le plancher de 90 jours couvre un trimestre, assez pour ne pas résumer la
période à un seul pic. La fenêtre du corpus mesuré va du 2024-04-19 au
2026-10-14, soit 909 jours : elle passe largement.


## Repères mesurés (21 novembre 2026)

Chaque seuil a été confronté aux corpus versionnés et à la base de travail :

| Garde-fou | Mesure relevée | Seuil |
| --- | --- | --- |
| Corpus | 42 incidents de fenêtre sur 60 dans le corpus de référence ; 50 dans le corpus consolidé servi | ≥ 30 |
| Référentiel | 4/4 secteurs : agroalimentaire 11 209, industrie 48 895, construction 115 581, commerce 175 250 (`org`, base de travail) | ≥ 3/4 |
| Sources | 27 éditeurs sur 42 dans le corpus de référence ; 17 éditeurs, part max 30 % (Sud Ouest 15/50) dans le corpus servi | ≥ 5 et ≤ 50 % |
| Fenêtre | 1 à 9 incidents par mois sur les 12 mois du corpus de référence ; 909 jours dans le corpus servi | ≥ 90 |

```bash
# 42 / 27 / 1–9 : corpus de référence, fenêtre 2025-11-01 → 2026-10-31
jq -r '.incidents | map(select(.datePublique >= "2025-11-01" and .datePublique <= "2026-10-31")) as $w |
  "dans fenetre: \($w|length) ; editeurs: \($w|map(.preuve.editeur // empty)|unique|length) ; " +
  "mois min-max: \([$w|group_by(.datePublique[0:7])[]|length]|min)-\([$w|group_by(.datePublique[0:7])[]|length]|max)"' \
  bench/fixtures/corpus-reference-na.json

# 11 209 / 48 895 / 115 581 / 175 250 : base de travail, port 5433
psql 'postgres://radar:radar@localhost:5433/radar' -Atc \
  "SELECT COALESCE(sector,kind), count(*) FROM org WHERE kind='entreprise'
    AND COALESCE(sector,kind) IN ('agroalimentaire','industrie','construction','commerce') GROUP BY 1 ORDER BY 1"
```

Un corpus sans aucune date ne lève plus d'exception : la fenêtre vaut
`{ debut: "", fin: "" }`, `corpus.jours` vaut 0 et trois refus sont renvoyés,
dont « aucune fenêtre mesurable ».

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

**0 % (0 incident vu sur 50) est publiable.** Les quatre garde-fous passent :
50 incidents dans la fenêtre sur les 30 exigés, 4/4 secteurs, 17 éditeurs dont
aucun au-dessus de 30 %, 909 jours. `GET /api/couverture` renvoie
`publiable: true`, `mention: null`, `raison: null` et `refus: []`. Le chiffre
reste 0 % : la publication est autorisée, pas embellie.

## Usage et vérification

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-couverture-systeme.mts
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts --json=bench/results/couverture-globale.json
apps/api/node_modules/.bin/tsx scripts/couverture-globale.mts --corpus=bench/fixtures/corpus-temoin-na.json
```

`apps/api/test/couverture-publication.test.ts` rejoue la mesure sur 5 lignes
(refus avec raison chiffrée), sur 50 lignes (publication), sur une fenêtre de
30 jours et sur un corpus vide (refus sans exception).
`apps/api/test/couverture-api.test.ts` vérifie le verdict tel que servi par
`GET /api/couverture`, y compris le passage à `publiable: false` avec sa raison
quand le rapport passe sous le seuil ; `apps/api/test/couverture-globale.test.ts`
couvre la porte du script global (référentiel, éditeurs, fenêtre).

```bash
cd apps/api && RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres' \
  node_modules/.bin/tsx test/run.ts test/couverture-publication.test.ts \
  test/couverture-api.test.ts test/couverture-globale.test.ts
```
