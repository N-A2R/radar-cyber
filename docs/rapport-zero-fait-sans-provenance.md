# Zéro fait sans provenance — contrôle CI bloquant

**Résultat mesuré : 0 fait sur 71 événements Nouvelle-Aquitaine sans provenance (0 %).**
Le contrôle est **bloquant en CI** : `pnpm provenance:check` échoue avec le code 1 dès qu'un fait
est sans provenance. Mesure du 22 novembre 2026 sur l'état réel de la base :
**1 673 151 organisations, 312 sources, 26 259 événements**, dont **71 événements régionaux**.

État de départ mesuré sur cette même base : **71/71 faits sans provenance (100 %)**, tous pour
absence de fait d'admission dans le journal. Après réparation : **0/71 (0 %)**, chaîne complète
pour 71/71 (100 %).

## Définition vérifiable

Un fait régional est « avec provenance » seulement si toutes les conditions sont vraies :

1. `source_id` et `source_url` renseignés ;
2. date d'observation `observed_at` renseignée ;
3. un fait d'admission `event.admitted` ou `custody.seen` dans le journal append-only, avec un
   acteur non vide, une horloge `recorded_at` et au moins une clé de preuve autorisée ;
4. `event.regional = true` — un fait hors Nouvelle-Aquitaine ne peut pas être compté comme prouvé.

La règle n'est implémentée qu'une fois dans `apps/api/src/custody/chain.ts`. Le gate
`apps/api/src/custody/gate.ts` réévalue chaque entrée du ledger avec cette même règle : il ne se
fie pas au chiffre stocké dans l'artifact, il le recalcule. Un artifact vide, tronqué, périmé,
hors périmètre ou falsifié est refusé par un code de motif explicite (`empty-scope`,
`ledger-truncated`, `context-mismatch`, `wrong-scope`, `summary-mismatch`,
`unsanitized-ledger`).

## Livraison

- `scripts/provenance.mts` — deux commandes : `measure` interroge la base réelle et écrit un
  ledger (sujets techniques, métadonnées de source, acteurs, horloges, clés de preuve) ;
  `check` relit l'artifact et sort avec le code 1 si le gate échoue.
- `bench/results/provenance-na-before.json` — mesure avant réparation (71/71 sans provenance).
- `scripts/backfill-custody.mts` — réparation idempotente déjà présente dans le dépôt : 71 faits
  d'admission écrits (`backfill:custody@1`), rejeu à 0 écriture, 0 échec.
- `bench/results/provenance-na.json` — mesure livrée (0/71 sans provenance), artifact versionné
  que le CI vérifie à chaque Pull Request.
- `.github/workflows/ci.yml` — étape **Provenance gate (blocking)** après les tests API.
- `apps/api/test/provenance-gate.test.ts` — 11 tests, un par comportement : ledger complet,
  admission manquante, hors région, ledger vide, ledger tronqué, contexte périmé, périmètre
  erroné, somme falsifiée, texte de victime, codes de sortie du CLI, absence de donnée
  personnelle dans le ledger mesuré.
- **`apps/api/src/server.ts` : 0 ligne modifiée.**

## Preuve du caractère bloquant

```text
$ tsx scripts/provenance.mts check --json=bench/results/provenance-na-before.json
Provenance gate FAIL: 71/71 Nouvelle-Aquitaine facts without provenance. Reasons: fact:admission-fact-missing.
→ code de sortie 1

$ tsx scripts/provenance.mts check --json=bench/results/provenance-na.json
Provenance gate PASS: 0/71 Nouvelle-Aquitaine facts without provenance.
→ code de sortie 0
```

Le test `the check command exits 1 on an incomplete ledger and 0 on a complete one` reproduit
cette paire de codes de sortie dans la suite API, donc dans le même job CI que l'étape bloquante.

## Commandes reproductibles

```sh
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar

# État réel avant réparation (artifact archivé)
apps/api/node_modules/.bin/tsx scripts/provenance.mts measure \
  --json=bench/results/provenance-na-before.json
apps/api/node_modules/.bin/tsx scripts/provenance.mts check \
  --json=bench/results/provenance-na-before.json   # doit échouer (code 1)

# Réparation, puis rejeu (0 écriture attendue)
apps/api/node_modules/.bin/tsx scripts/backfill-custody.mts --apply \
  --json=bench/results/provenance-backfill.json
apps/api/node_modules/.bin/tsx scripts/backfill-custody.mts --apply \
  --json=bench/results/provenance-backfill-replay.json

# Mesure livrée : 0/71 sans provenance
apps/api/node_modules/.bin/tsx scripts/provenance.mts measure \
  --json=bench/results/provenance-na.json
apps/api/node_modules/.bin/tsx scripts/provenance.mts check \
  --json=bench/results/provenance-na.json         # passe (code 0)

# Tests ciblés (18/18 verts) et typecheck API
cd apps/api && DATABASE_URL=$DATABASE_URL ./node_modules/.bin/tsx test/run.ts \
  test/custody.test.ts test/provenance-gate.test.ts
cd apps/api && ./node_modules/.bin/tsc --noEmit
```

Le ledger livré contient 71 entrées, `complete: 71`, `withoutProvenance: 0`, `rate: 100`, `gaps: {}`.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : la mesure filtre `event.regional` ; un fait hors région est
  un motif d'échec (`outside-nouvelle-aquitaine`), jamais un fait prouvé.
- **Sources grises autorisées** : aucune règle de licence n'a été ajoutée ; le `source_id` est
  copié tel quel dans les clés de preuve.
- **Aucune donnée personnelle de victime** : le ledger force `title: null` et `summary: ""` et
  n'autorise que les clés de preuve déclarées ; un artifact contenant du texte de victime est
  refusé par le gate. Le test de mesure l'a vérifié sur un événement portant un titre piégé.
- **Aucun service payant** : PostgreSQL local et dépendances déjà versionnées uniquement.
- **Code et interface en anglais**, rapport en français.
- **Diff de `server.ts` ≤ 10 lignes** : 0 ligne.
- **Aucune commande de plus de 60 s** : toutes les commandes ci-dessus ont été exécutées avec une
  borne de 20 à 55 s ; la suite ciblée a duré 34 s.

## Limite connue

Les attentes de contexte (1 673 151 / 312 / 26 259) sont des constantes de `gate.ts` : si l'état
réel de la base change, il faut relancer `measure` et mettre à jour ces constantes dans le même
commit. C'est volontaire — un artifact périmé ne doit pas faire passer le contrôle — mais cela
rend la remesure obligatoire à chaque évolution du volume de données.

OBJECTIF : atteint — 0 / 71 faits Nouvelle-Aquitaine sans provenance (cible 0 / 71, soit 71 / 71 faits avec provenance et contrôle CI bloquant ; mesure reproductible du 22/11/2026 : `pnpm provenance:check` → `Provenance gate PASS: 0/71 Nouvelle-Aquitaine facts without provenance.`, code 0 ; l'artifact archivé d'avant réparation donne `71/71` et code 1).
