# Référentiel des mandataires publics — Nouvelle-Aquitaine

Mesure du 21 novembre 2026, sur la branche `ext/chantier-a9`.

## Objectif et résultat

L'objectif était un référentiel des dirigeants publics de Nouvelle-Aquitaine, sans
donnée sensible. Le chiffre retenu est **4 462 mandats publics**, répartis sur
l'ensemble des autorités territoriales de la région, avec **0 champ personnel et
0 donnée de victime**.

| Rôle | Mandats |
| --- | --- |
| Maire (`mayor`) | 4 293 |
| Président d'EPCI (`epci_president`) | 156 |
| Président de département (`department_president`) | 12 |
| Président de région (`region_president`) | 1 |
| **Total** | **4 462** |

Chaque mandat est une fonction publique rattachée à une autorité, pas une
personne : aucun nom, prénom, courriel, téléphone, identifiant personnel ni
donnée de victime n'est conservé. La source est publique et gratuite
(`@etalab/decoupage-administratif@6.0.0`, licence MIT) ; aucune source payante
n'est utilisée. Les sources grises autorisées par le chantier n'étaient pas
nécessaires.

## État réel de départ

La base de travail réelle (`localhost:5433/radar`, lecture seule) portait, au
moment de la mesure, **1 673 221 organisations, 376 sources et 27 882
événements**. Les ordres de grandeur annoncés dans le chantier
(1 673 151 organisations, 312 sources, ~28 000 événements) décrivent un état
antérieur de cette même base ; les chiffres ci-dessus sont ceux relevés, pas
des valeurs recopiées.

Le jeu territorial versionné fournit 4 293 communes (après rattachement des
224 communes déléguées/associées), 156 EPCI, 12 départements et 1 région :
**4 462 autorités**, soit exactement un mandat par autorité. Les 4 EPCI à cheval
sur deux départements conservent leur mandat avec `dept = null` plutôt qu'un
département inventé. Le périmètre est celui des 12 départements de
Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87) et de la
région 75 ; le code 65, extérieur à la région, n'est pas inclus.

## Commande reproductible

```bash
apps/api/node_modules/.bin/tsx scripts/mesure-public-mandates.mts --with-db
```

Sortie observée :
```text
dataset: Référentiel territorial Nouvelle-Aquitaine (2026-11-12)
source: @etalab/decoupage-administratif (MIT)
public_offices: 4462
  mayor: 4293
  epci_president: 156
  department_president: 12
  region_president: 1
personal_data_findings: 0
plan_warnings: 0
baseline_orgs: 1673221
baseline_sources: 376
baseline_events: 27882
```

Le script lit le jeu versionné `db/data/referentiel-na.json` et n'écrit rien.
Avec `--with-db`, les trois compteurs de départ sont lus dans une transaction
`READ ONLY` ; sans cette option, la mesure fonctionne hors base.

## Ce qui est livré

- `apps/api/src/public-mandates/plan.ts` : dérivation d'un mandat par autorité,
  contrôle du périmètre, déduplication et détection de champs personnels ;
- `db/migrate-063-public-mandates.sql` : table `public_mandate` limitée aux
  colonnes de fonction, de juridiction et de provenance ;
- `apps/api/src/public-mandates/load.ts` et `scripts/load-public-mandates.mts` :
  chargement idempotent, avec `--plan-only` (sans base), dry-run puis `--apply` ;
- `GET /api/public-mandates` : lecture publique, projection fixe de huit champs,
  filtres `role` et `dept`, pagination bornée à 500 ;
- trois fichiers de test, un comportement par test ;
- `server.ts` est inchangé (0 ligne de diff) : la route passe par le registre
  unique `registerApiRoutes`.

## Vérification

```bash
RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres' \
  apps/api/node_modules/.bin/tsx apps/api/test/run.ts \
  apps/api/test/public-mandates-plan.test.ts \
  apps/api/test/public-mandates-load.test.ts \
  apps/api/test/public-mandates-route.test.ts \
  apps/api/test/securite-couverture.test.ts
```

Résultat : 14 tests, 14 réussis, 0 échec. `pnpm -r typecheck` passe également.
Les tests couvrent le jeu réel, la conservation des EPCI transfrontaliers, le
périmètre, la déduplication, l'absence de données personnelles, le dry-run,
l'idempotence du chargement, la liste exacte des colonnes de la table, la
projection de la route, ses filtres et la règle d'accès de la nouvelle route.

## Limites

Le référentiel décrit des **fonctions publiques**, pas l'identité de leurs
titulaires : c'est le choix qui permet de garantir l'absence de données
personnelles. Il ne prétend donc pas répondre à une recherche par personne, ni
couvrir des fonctions hors du découpage territorial (préfets, par exemple).
Le chargement en base n'a pas été appliqué à la base de travail : la commande
`--apply` est fournie pour un déploiement explicite.

## Clôture — 21 novembre 2026

**CHANTIER TERMINÉ.** Objectif mesurable atteint et re-mesuré à la clôture :
**4 462 mandats publics** (4 293 maires, 156 présidents d'EPCI, 12 présidents de
département, 1 président de région), **0 champ personnel, 0 donnée de victime,
0 avertissement** — un mandat par autorité du périmètre Nouvelle-Aquitaine.

Re-vérifié le 21 novembre 2026 : mesure reproductible
`scripts/mesure-public-mandates.mts --with-db` (4 462 / 0 / 0 ; 418 sources actives
dans la base de travail contre 376 au relevé initial, d'autres chantiers ayant
ajouté des sources depuis) et 14 tests / 14 réussis, un comportement par test.
`server.ts` inchangé (0 ligne de diff vs `origin/main`). Livré via la PR #314.
