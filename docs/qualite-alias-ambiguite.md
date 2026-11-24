# Doublons d'alias et ambiguïté du gazetteer — 2026-11-24

Mesure **en lecture seule** sur `radar` (rôle `radar_app`), reproductible avec :

```sh
DATABASE_URL=<lecture seule> apps/api/node_modules/.bin/tsx scripts/mesure-alias-ambiguite.mts
```

La transaction est `BEGIN READ ONLY` … `ROLLBACK` ; aucune écriture en base, aucun
alias brut publié. Le script imprime un JSON daté. Les chiffres ci-dessous sont
ceux de l'exécution du 2026-11-24 à 22:08 UTC. `docs/qualite-donnees.md`
publiait, le 2026-11-21, 91 259 alias normalisés dupliqués et 287 959 valeurs
partagées entre organisations ; la mesure courante donne 91 255 et 287 947,
l'écart venant de l'évolution du référentiel, pas d'un changement de définition.

## 1. Classes de doublons

| Classe | Mesure | Lecture |
| --- | ---: | --- |
| Doublons `lower(btrim(alias))` (référence) | 91 255 valeurs / 287 951 lignes | 196 696 lignes surnuméraires |
| Valeurs multi-org de la référence | 287 947 | quasi-totalité des valeurs dupliquées |
| Doublons de la clé indexée `nom_normalise` | 95 450 clés / 301 577 lignes | 206 127 lignes surnuméraires |
| Doublons **intra-organisation** | 133 clés / 133 lignes surnuméraires | 0,14 % des clés dupliquées |
| Doublons **multi-organisation** | 95 317 clés / 301 311 lignes | collisions réelles, à conserver |
| Clés dupliquées d'un seul jeton | 17 707 | population exposée aux faux positifs |
| Variantes de casse (même minuscule) | 1 239 valeurs / 4 443 lignes | doublons de forme, même clé indexée |
| Variantes de forme (`nom_normalise` identique) | 8 487 clés / 17 089 lignes surnuméraires | 131 intra-org, 8 356 multi-org |
| — dont accents seuls | 809 clés | `unaccent()` ne distingue plus les formes |
| — dont ponctuation ou autres signes | 7 678 clés | tirets, apostrophes, espaces |

Conclusion de mesure : une déduplication **globale** par clé normalisée
écraserait 95 317 collisions entre organisations distinctes (par exemple
plusieurs établissements portant le même nom) et 8 356 collisions de forme
entre organisations. Seules 133 clés sont de vrais doublons intra-org, déjà
réduits à un id par clé dans `construireIndex`. Le levier correct n'est donc
pas la suppression de lignes, mais la qualification de l'ambiguïté.

## 2. Défaut ciblé : fausse ambiguïté par fragment

`buildGazetteer` déclarait ambiguë toute clé portée par deux ids, quelle que
soit la source. Or `sirene-nom` (1 461 897 alias) est dérivé en masse de la
raison sociale : un fragment n'est pas un alias posé sur l'organisation.

| Mesure | Avant | Après garde affinée |
| --- | ---: | ---: |
| Clés `nom_normalise` déclarées ambiguës | 95 317 | 16 163 |
| Fausses ambiguïtés dues à un fragment seul | — | 79 154 |
| — d'un seul jeton | — | 15 064 |
| Marques d'un jeton (≥ 4 caractères) rétablies | — | 3 478 |
| Alias d'usage (`usage` / `annuaire-entreprises`) rétablis | — | 2 |
| Clés restant ambiguës entre sources nommantes | — | 16 163 (dont 2 641 d'un jeton) |

En excluant aussi la source `sirene`, 3 565 clés supplémentaires seraient
rétablies (12 598 clés ambiguës au lieu de 16 163) ; elles n'ont **pas** été
touchées : cette source alimente aussi des alias nommants du référentiel
enrichi. La correction reste limitée à `sirene-nom`, seule source documentée
comme fragment de raison sociale.

## 3. Correction et comportement

Dans `apps/api/src/match/gazetteer.ts`, la pré-passe ne compte plus les lignes
`sirene-nom` dans l'ensemble `clesAmbiguesNommantes`. Le reste de la règle est
inchangé : seuil de quatre caractères, rôle, toponymie, mots génériques,
départage par département/commune/alias d'usage, et exigence d'indice explicite
(`hasBrandCue`) pour qu'une marque d'un seul jeton tranche.

Aucun alias n'est supprimé, ni de la base, ni de l'index de décision : seule
la qualification d'ambiguïté change. `apps/api/test/gazetteer-alias-ambiguite.test.ts`
fixe les cas de comportement sur fixtures (sans base) :

| Fixture | Avant | Après |
| --- | --- | --- |
| `usage` « Novalis » + fragment `sirene-nom` du même jeton | aucun rattachement | organisation 1, `alias-distinctif` |
| `usage` + `sirene-usuelle` sur deux ids + fragment | aucun rattachement | aucun rattachement (invariant) |
| fragments `sirene-nom` seuls sur deux ids | aucun rattachement | aucun rattachement (invariant) |
| « Növalis » + « NOVALIS » sur le même id + fragment | aucun rattachement (clé déclarée ambiguë) | organisation 1, variantes conservées |
| « Növalis » et « novalis » sur deux ids `usage` | aucun rattachement (clé ambiguë) | aucun rattachement (invariant) |

Les tests de comportement n'ont pas été exécutés dans ce worktree, conformément
à la règle du chantier : le parent les rejoue avec
`cd apps/api && node_modules/.bin/tsx test/run.ts test/gazetteer-alias-ambiguite.test.ts`.
La preuve exécutée ici est la mesure SQL avant/après ci-dessus, obtenue en
lecture seule et sans écriture dans `radar`.
