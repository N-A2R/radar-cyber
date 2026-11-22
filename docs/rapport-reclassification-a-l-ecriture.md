# Reclassification à l'écriture — custody sans nouvelle réparation

**Résultat mesuré : 12/12 événements reclassés en Nouvelle-Aquitaine (100 %)
journalisent leur admission dans le même `UPDATE`, contre 0/12 (0 %) avant la tranche.**
Témoin du 22 novembre 2026 : `bench/results/reclassification-before.json` ;
après : `bench/results/reclassification-boundary.json`. Le taux publié dérive du
compte d'admissions vivantes (`liveWritten`), pas du compte de chaînes complètes.

## Ce qui restait à faire

La tranche précédente (`12/12`, admission à l'INSERT) couvrait les événements
inscrits directement régionaux. Or une ligne peut être admise hors région puis
reclassée plus tard — c'est le chemin de `scripts/backfill-regional.mts`, et
c'était déjà le scénario des fixtures historiques du test de custody. Ce
changement de périmètre est une écriture distincte, invisible pour le trigger
`AFTER INSERT` de la migration 064 : la chaîne restait incomplète jusqu'à un
nouveau backfill. La garantie « à l'écriture » n'était donc pas jointive.

## Définition vérifiable

Un événement a une admission **à la frontière de reclassification** quand le
`UPDATE` qui porte `regional: false → true` pose lui-même, dans la même
transaction, un fait `event.admitted` avec :

- un acteur non vide (`custody:write-boundary@1`) ;
- une horloge d'enregistrement (`recorded_at`, porté par le journal) ;
- une preuve stockée (`sourceId`, `sourceUrl`, `observedAt`, `family`,
  `assertionType`, `admissionRule`) ;
- aucun titre, résumé, organisation citée ou identifiant de victime.

La mesure réutilise `evaluateCustody` (`apps/api/src/custody/chain.ts`), la même
règle que l'API et le backfill. Elle vérifie aussi que 0 admission existait au
moment de l'INSERT (`liveAtInsert: 0`) : le fait mesuré vient bien de l'UPDATE.

## Livraison

- `db/migrate-065-custody-reclassification.sql` — trigger `AFTER UPDATE OF
  regional`, conditionné au passage réel `non-régional → régional`. Il réutilise
  la fonction de la migration 064, donc la même preuve et le même garde-fou
  contre les doublons. Le journal reste append-only.
- `apps/api/test/custody.test.ts` — deux tests de comportement : la
  reclassification journalise une admission avec preuve et sans donnée de
  victime ; une mise à jour qui reste hors région n'écrit aucun fait. Les deux
  fixtures historiques sont désormais créées trigger suspendu (réactivé en
  `finally`) pour conserver exactement le scénario que le backfill répare.
- `scripts/measure-reclassification-boundary.mts` — mesure sur une base
  jetable créée par `test/helpers/testdb.ts` : 12 `INSERT` hors région en SQL
  brut, puis le `UPDATE` de reclassification ; lecture du journal et
  évaluation par `evaluateCustody`. Aucune écriture en production.
- `bench/results/reclassification-before.json` (0/12) et
  `bench/results/reclassification-boundary.json` (12/12, `backfilled: 0`,
  `noVictimData: true`).
- `package.json` — script `custody:reclassification`.

`apps/api/src/server.ts` : **0 ligne modifiée**.

## Commandes reproductibles

```sh
# Témoin avant trigger (base jetable)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-reclassification-boundary.mts \
  --json=bench/results/reclassification-before.json

# Mesure livrée, avec le témoin archivé
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-reclassification-boundary.mts \
  --json=bench/results/reclassification-boundary.json \
  --baseline=bench/results/reclassification-before.json

# Comportements
cd apps/api && DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  ./node_modules/.bin/tsx test/run.ts test/custody.test.ts
```

Résultat observé : `12/12 ... (100 %)`, avant `0/12 (0 %)`, `At insert: 0 ;
backfilled: 0 ; complete: 12 ; no victim data: true` ; tests ciblés **11/11 verts**.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : la condition du trigger exige le passage
  à `regional = true` ; un UPDATE hors région n'écrit rien.
- **Sources grises autorisées** : aucune règle de licence ajoutée.
- **Aucune donnée personnelle** : seul le titre synthétique contient un identifiant
  de tirage ; la mesure vérifie qu'aucun fait du journal ne le contient.
- **Aucun service payant** : PostgreSQL local et dépendances déjà versionnées.
- **Un test par comportement** : deux tests, deux comportements distincts.
- **Diff de `server.ts` ≤ 10 lignes** : 0 ligne.

## Limite connue, hors périmètre du chiffre

Les 112 événements historiques restent couverts par le backfill : le journal est
append-only par conception, et un trigger ne réécrit pas le passé. Un événement
déjà régional dont on ne change pas la régionalité ne produit pas de second
fait — c'est précisément le garde-fou du trigger 064 réutilisé ici.

OBJECTIF : atteint — 12 / 12
