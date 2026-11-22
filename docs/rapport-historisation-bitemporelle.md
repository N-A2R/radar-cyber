# Rapport — Historisation bitemporelle : couverture complète

**Date :** 22 novembre 2026. **Branche :** `ext/chantier-h6`.
**Périmètre :** les 12 départements de Nouvelle-Aquitaine (16, 17, 19, 23, 24,
33, 40, 47, 64, 79, 86, 87). Rapport en français ; code, interface et tests en
anglais.

## Chiffre livré

**100 % de couverture bitemporelle en Nouvelle-Aquitaine :
1 671 907 organisations sur 1 671 907**, et **1 678 041 alias sur 1 678 041**.
La base entière porte 1 673 151 versions d'organisations et 1 678 185 versions
d'alias : exactement une version ouverte par ligne source, avec les deux horloges
renseignées.

Commande reproductible, depuis la racine du dépôt :

```sh
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
apps/api/node_modules/.bin/tsx scripts/measure-bitemporal-coverage.mts \
  --check --out=bench/results/bitemporal-coverage.json
# coverage: 100% (1671907/1671907 organisations NA), aliases 100% (1678041/1678041)
```

La commande est en lecture seule (hors fichier JSON de sortie), sans réseau, et
s'est exécutée en **27,6 s**. Le résultat versionné est dans
`bench/results/bitemporal-coverage.json` ; `--check` sort en erreur si la
couverture ou l'une des structures de garantie vient à manquer.

## État réel de départ

| Compteur | Valeur mesurée avant le chantier |
|---|---:|
| Organisations | 1 673 151 |
| Alias | 1 678 185 |
| Départements NA (organisations) | 1 671 907 |
| Sources | 312 |
| Événements | 26 259 |
| Versions dans `org_history` | 0 |
| Table `org_alias_history` | absente |

La PR #4 avait livré le socle bi-temporel (migration 030, `muterOrganisation`,
`GET /orgs?asOf`), mais son critère était « un incident de 2024 se rattache à ce
qui existait en 2024 », pas la couverture complète. Dans l'état observé, aucune
organisation n'avait de version : seule la voie `muterOrganisation` écrivait
`org_history`, alors que plus de vingt autres chemins (`geocode.ts`,
`communes.ts`, `filiation/store.ts`, `enrichissement-db.ts`, `load.ts`, SQL
direct…) modifiaient `org` sans trace, et qu'aucune histoire d'alias n'existait.
Une mesure « 100 % » avant travaux aurait donc été fausse.

## Définition mesurée

La couverture est la part des organisations de Nouvelle-Aquitaine possédant au
moins une version dans `org_history` avec `valid_from` et `recorded_at` non nuls,
et exactement une assertion ouverte (`superseded_at IS NULL`). La même définition
s'applique aux alias via `org_alias_history`. Le compteur exige en outre que les
deux déclencheurs d'écriture soient présents : la couverture est donc à la fois
**de fond** (aucune ligne oubliée) et **structurelle** (aucun chemin d'écriture
futur ne peut contourner l'historique).

## Implémentation par étapes

1. **Migration 070** (`db/migrate-070-bitemporal-coverage.sql`) : fonction et
   déclencheurs `AFTER INSERT OR UPDATE OR DELETE` sur `org` et `org_alias`,
   création de `org_alias_history`. Chaque version garde `valid_from`/`valid_to`
   (temps valide) et `recorded_at`/`superseded_at` (temps enregistré) ; l'acteur
   est fourni par `radar.actor`, réglé par `muterOrganisation`.
2. **Lecture bi-temporelle** (`apps/api/src/referentiel/bitemporal.ts`) : les
   deux lectures (`orgsValidesAu`, `aliasValidesAu`) interrogent l'histoire. Sans
   temps enregistré explicite, on garde l'assertion la plus récente par ligne :
   lire le monde de 2024 aujourd'hui doit refléter ce que le radar en sait
   aujourd'hui.
3. **Route `GET /api/orgs?asOf=`** : la CTE lit désormais l'histoire et non la
   projection (`apps/api/src/routes/orgs.ts`, 9 lignes modifiées). `server.ts`
   n'a **aucune** ligne modifiée.
4. **Comblement du passé** (`scripts/backfill-bitemporal-coverage.mts`) : 10
   tranches d'identifiants pour les organisations, 6 pour les alias, 300 000
   identifiants au plus par commande. Chaque tranche est idempotente et a été
   exécutée en moins de 10 s ; le second passage insère 0 ligne.
5. **Mesure** (`scripts/measure-bitemporal-coverage.mts`) : compteurs NA,
   vérification des deux horloges, de l'assertion ouverte et des deux
   déclencheurs.

Le comblement ne crée aucune organisation, aucun alias et aucun événement : il
reconstitue uniquement les versions des lignes déjà présentes, en reprenant
`created_at` comme temps enregistré (à défaut, `valid_from`).

## Tests — un test par comportement

```sh
export RADAR_TEST_ADMIN_URL=postgres://radar:radar@localhost:5433/postgres
cd apps/api && node_modules/.bin/tsx test/run.ts \
  test/bitemporal-coverage.test.ts test/bitemporal.test.ts test/orgs.test.ts
# 13 tests, 13 réussis, 0 échec (31 s)
```

Les huit nouveaux tests de `bitemporal-coverage.test.ts` couvrent : version
ouverte à l'insertion, `UPDATE` SQL brut archivé, insertion et mise à jour
d'alias archivées, lecture dans le temps valide, lecture dans le temps
enregistré, unicité de l'assertion ouverte après plusieurs changements,
comblement idempotent d'une ligne antérieure aux déclencheurs, lecture d'alias
selon les deux horloges. Les cinq tests préexistants ont été adaptés à la
nouvelle convention « l'histoire contient aussi la version courante ».

## Contraintes

- **Nouvelle-Aquitaine uniquement** : la mesure porte sur les 12 départements de
  la région ; aucun organisation ni source hors région n'est créée.
- **Sources grises autorisées** : aucun ajout de source, aucun appel réseau.
- **Aucune donnée personnelle de victime** : la mesure ne lit que des
  compteurs ; aucun nom, alias ni extrait n'est écrit dans le rapport.
- **Aucun service payant** : PostgreSQL local uniquement, aucun appel externe.
- **Code et interface en anglais, rapport en français** : migrateurs, scripts,
  module et tests en anglais ; le présent document est en français. Deux
  messages d'erreur historiques restent en français pour ne pas rompre le
  contrat des tests existants.
- **Diff de `server.ts`** : 0 ligne.
- **Commande la plus longue** : 31 s (suite de tests), sous la limite de 60 s.
