# Fusion des doublons d'organisations — chantier A6

Date : 2026-11-21. Branche `ext/chantier-a6`. Rapport en français ; code et interface en anglais.

## Réponse chiffrée

**18 doublons d'organisations fusionnés, sans perte.**

La mesure reproductible ci-dessous a trouvé 18 groupes de 2 organisations (18
lignes surnuméraires), les a fusionnés en une seule transaction, puis a vérifié
les 18 groupes un par un : **18/18 contrôles de non-perte réussis**. Le second
balayage ne trouve plus aucun doublon (0 groupe, 0 doublon). Le nombre total
d'organisations est passé de **1 673 221 à 1 673 203**, soit exactement
18 lignes en moins, et 18 faits d'audit `org.fusion` ont été écrit dans le journal.

## État réel de départ

Mesuré en lecture seule sur `postgres://radar:radar@localhost:5433/radar` :

| Grandeur | Valeur mesurée | Remarque |
|---|---:|---|
| Organisations | 1 673 221 | balayage complet par curseur |
| Sources | 439 | dont les sources grises (`relevance = 'context'`) autorisées |
| Événements | 27 889 | inchangés après fusion |
| Groupes candidats | 18 | règle d'identité ci-dessous |
| Doublons | 18 | une ligne surnuméraire par groupe |

Le chiffre de 312 sources cite un relevé antérieur ; la mesure d'exécution est
celle qui fait foi, comme demandé. Aucune donnée personnelle de victime n'a été
lue : le balayage ne porte que sur `id`, `name`, `slug`, `dept`, `siren`,
`entity_code` et `entity_source` de `org`.

## Règle de fusion

La règle est définie une seule fois, dans `apps/api/src/dedup/org-duplicates.ts`,
et réutilisée par l'outil en ligne de commande. Deux lignes ne sont fusionnées
que si elles ont **le même SIREN à 9 chiffres, le même nom normalisé et le même
département de Nouvelle-Aquitaine**, et si elles proviennent de deux formes
d'ingestion indépendantes : une ligne avec un `org.siren` explicite et une ligne
dont le slug porte un SIRET/SIREN issu d'une source Sirene. Les homonymes, les
établissements distincts d'un même SIRET et les codes FINESS ne sont jamais
fusionnés. Les 12 départements sont ceux de `DEPT_LABELS` ; aucune source n'est
exclue (sources grises comprises), aucun service payant n'est utilisé.

Le survivant est le plus petit `org.id` du groupe : c'est la ligne la plus
ancienne et ce choix est stable d'une exécution à l'autre. Toutes les dépendances
(alias, événements, alertes, actifs, historique, organisations filles) sont
réaffectées dans la même transaction. Les alias conservent l'union de leurs
provenances et les slugs retirés restent cherchables. Chaque groupe est vérifié
avant validation : identifiants d'événements, d'alertes, d'historique et
d'organisations filles conservés, valeurs d'actifs conservées, alias jamais
retirés. Une seule incohérence déclenche le rollback de toute la fusion.

## Mesure reproductible

Trois commandes, chacune sous 20 secondes mesurées sur la base de travail :

```bash
# 1. État avant : 18 doublons, aucune écriture
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/doublons-orgs.mts \
  --json=bench/results/doublons-orgs-before.json

# 2. Fusion explicite de tous les groupes + contrôle de non-perte
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/doublons-orgs.mts \
  --apply --all --json=bench/results/doublons-orgs-after.json

# 3. Vérification : 0 doublon restant
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/doublons-orgs.mts \
  --json=bench/results/doublons-orgs-verify.json
```

Résultats enregistrés :

| Rapport JSON | `groupsFound` | `duplicatesFound` | `duplicatesMerged` |
|---|---:|---:|---:|
| `bench/results/doublons-orgs-before.json` | 18 | 18 | 0 |
| `bench/results/doublons-orgs-after.json` | 18 | 18 | **18** |
| `bench/results/doublons-orgs-verify.json` | 0 | 0 | 0 |

Le rapport d'application contient 18 entrées `verification`, toutes `ok: true`.
La durée mesurée de la commande de fusion est de 16,5 s ; aucune commande de ce
chantier n'a dépassé 60 s.

## Effet observable en base

Vérifié après la fusion sur la base de travail :

| Contrôle | Résultat |
|---|---|
| Organisations | 1 673 221 → 1 673 203 (−18) |
| Faits `journal.kind = 'org.fusion'` | 18 |
| Anciens identifiants surnuméraires | 0 restant |
| Groupes détectés au second balayage | 0 |
| Événements / alertes / actifs / parents orphelins | 0 / 0 / 0 / 0 |
| Événements | 27 889 avant et après |

## Tests

Cinq tests, un par comportement, exécutés sur une base de test jetable créée par
le lanceur du dépôt (jamais la base de travail) :

```bash
cd apps/api
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  ./node_modules/.bin/tsx test/run.ts test/dedup-orgs.test.ts
```

Résultat : 5 tests, 5 réussis. Ils couvrent la détection dans les règles, la
fusion avec conservation des dépendances et des provenances d'alias, le rejet
des établissements SIRET, le rejet des départements hors Nouvelle-Aquitaine et
le rejet des homonymes de SIREN différent. Le typecheck de l'API passe également.

## Périmètre et contraintes

- Nouvelle-Aquitaine uniquement : filtre sur les 12 codes départementaux.
- Sources grises autorisées : aucun filtre de réputation de source.
- Aucune donnée personnelle de victime : lecture uniquement de champs d'organisation.
- Aucun service payant : PostgreSQL local et outils du dépôt uniquement.
- Code et interface en anglais : module, outil CLI et tests en anglais.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff** (limite : 10).
- Le chantier précédent `loop/data-doublons-orgs` (PR #107) n'avait livré que
  l'outil, sans appliquer ni mesurer de fusion (0/18). Ce chantier poursuit ce
  travail sur la branche courante, qui contient déjà son commit via `main` ;
  aucune seconde PR n'est ouverte pour #107.
