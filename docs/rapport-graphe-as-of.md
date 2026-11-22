# Rapport — Graphe interrogeable à toute date

## Prévol

Recherche effectuée avant toute modification :

- `gh pr list --state all --search '<mots-clés>'` sur « graphe temporel »,
  « temporal », « interrogeable », « 3 ans », « latence graphe » et variantes ;
- `git log --oneline --all | grep -iE 'temporel|temporal|graphe|graph|100 ?ms|latence'`.

PR trouvées, aucune avec l'objectif « requête temporelle sur 3 ans en moins de
100 ms » :

- #290 « graphe de connaissance temporel » (fusionnée) : projection de base,
  sans objectif de latence ;
- #361 « graphe temporel complet — 81 171 relations horodatées » (fusionnée) :
  objectif de complétude, pas de latence ;
- #368 « 11 817 569 arêtes interrogeables » (ouverte) : objectif de nombre
  d'arêtes ;
- #428 « historisation bitemporelle 100 % » (ouverte) : objectif de couverture
  des organisations.

Le travail part donc de `origin/main`, sur la branche `ext/chantier-o7`.

## État réel de départ

Mesuré sur la base régionale réelle (PostgreSQL local, port 5433) :

- **1 673 151** organisations ;
- **312** sources ;
- **26 259** événements ;
- **27 557** entités et **81 171** relations dans la projection temporelle ;
- une requête as-of sans index parcourait les 81 171 relations en **28,8 ms**
  (`EXPLAIN ANALYZE`, balayage séquentiel).

## Livré, par étapes testables

1. **`db/migrate-071-graphe-as-of.sql`** : colonne générée `period` (intervalle
   semi-ouvert `[valid_from, valid_to)`) et index GiST
   `graph_relation_period_idx`. Migration additive et idempotente : aucune
   donnée n'est réécrite.
2. **`apps/api/src/graph/as-of.ts`** : une requête unique répond à deux
   questions — relations valides à une date `at`, et ouvertures/fermetures
   mois par mois sur les trois années précédentes. Le snapshot utilise
   `period @> at` et l'index GiST ; la fenêtre utilise les index sur
   `valid_from` / `valid_to`. Les identifiants d'organisations hors
   Nouvelle-Aquitaine, s'ils apparaissaient, sont exclus par un petit tableau
   de paramètres, sans sous-requête par ligne.
3. **`GET /api/graph/as-of`** : paramètres `at` (obligatoire, ISO), `window=3y`
   (optionnel), `type`, `node`, `limit`. Enregistrée dans `routes/index.ts` et
   déclarée dans `POLITIQUE_ACCES` (`rbac.ts`).
4. **`scripts/mesure-graphe-as-of.mts`** et la commande
   `pnpm mesure:graphe-as-of` : 37 requêtes identiques à celles de la route,
   à 37 dates réparties sur trois ans, avec spécimen préalable exclu de la
   mesure. Résultat brut versionné dans `bench/results/graphe-as-of.json`.

## Chiffre obtenu

Commande reproductible :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm mesure:graphe-as-of
```

Mesure du 22 novembre 2026, fenêtre du 22/11/2023 au 22/11/2026, 37 dates,
sur la base réelle décrite plus haut :

| Mesure | Résultat |
| --- | --- |
| p50 | **38,67 ms** |
| p95 | **60,18 ms** |
| maximum | **67,31 ms** |

**Objectif atteint : p95 60,18 ms < 100 ms**, et même le maximum observé
(67,31 ms) reste sous la barre. La commande complète s'exécute en moins de
2 secondes.

## Vérification

- `tsc --noEmit` sur `apps/api` : vert.
- `tsx test/run.ts test/graphe-as-of.test.ts test/graphe-temporal-complete.test.ts
  test/graphe-temporal.test.ts` sur une base éphémère : **19 tests réussis**
  (7 nouveaux, un par comportement : date exacte, fin de validité, fenêtre de
  trois ans, périmètre NA, absence de données de victimes, filtres, refus des
  paramètres invalides ; 12 tests de non-régression).
- Le test de couverture des règles d'accès signale uniquement la route
  `/api/stream`, déjà sans règle avant ce chantier ; `/api/graph/as-of` est
  bien couverte par sa règle.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : la projection 064 limite les
  organisations aux douze départements de la région ; la lecture exclut en
  plus toute organisation explicitement taguée hors région.
- **Sources grises** : aucune source ajoutée, aucune API externe appelée.
- **Aucune donnée personnelle de victime** : la réponse ne contient que des
  identifiants opaques, des types de relations et des horodatages ; ni titre
  d'événement, ni nom d'organisation, ni champ `victim` ne sont lus. Un test
  dédié vérifie l'absence de ces données.
- **Aucun service payant** : PostgreSQL local uniquement.
- **Code et interface en anglais**, rapport en français.
- **Diff de `server.ts` : 0 ligne** (≤ 10 exigées).
- **Aucune commande de plus de 60 s** : migration 1,3 s, tests ciblés 3 s,
  mesure 1,9 s.
