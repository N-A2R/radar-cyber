# Admission à l'écriture — custody sans réparation

**Résultat mesuré : 12/12 événements Nouvelle-Aquitaine nouvellement inscrits (100 %)
journalisent leur admission au moment de l'INSERT**, contre **0/112 (0 %)** sur l'état
historique livré par la tranche précédente. Mesure du 22 novembre 2026,
`bench/results/admission-at-write.json`.

## Ce qui restait à faire

La tranche précédente (`112/112`, PR #340) réparait l'historique avec
`backfill:custody@1`, mais son rapport consignait une limite explicite : les
événements `na-gap` sont écrits par une voie **extérieure à ce dépôt**, sans fait
d'admission. Chaque nouvel événement régional retombait donc dans le trou et
attendait un backfill. L'enregistrement n'était pas joint à l'écriture : il
était différé, donc réparable mais pas garanti.

## Définition vérifiable

Un événement régional a une admission **à l'écriture** quand son `INSERT` pose
lui-même, dans la même transaction, un fait `event.admitted` avec :

- un acteur non vide (`custody:write-boundary@1`) ;
- une horloge d'enregistrement (`recorded_at`, porté par le journal) ;
- une preuve stockée (`sourceId`, `sourceUrl`, `observedAt`, `family`,
  `assertionType`, `admissionRule`) ;
- aucun titre, résumé, organisation citée ou identifiant de victime.

La règle de complétude réutilisée est `evaluateCustody` (`apps/api/src/custody/chain.ts`),
la même que celle de l'API et du backfill. Le trigger ne court-circuite pas cette
règle : il produit le fait que la règle exige.

## Livraison

- `db/migrate-064-custody-admission.sql` — fonction PL/pgSQL et trigger
  `AFTER INSERT ON event`, actif seulement quand `NEW.regional` est vrai. Un
  garde-fou `NOT EXISTS` évite de doubler une admission déjà complète et
  n'exige aucun privilège spécial.
- `apps/api/test/custody.test.ts` — deux tests de comportement : un `INSERT`
  régional brut journalise une admission avec preuve et sans donnée de victime ;
  un `INSERT` hors région n'écrit aucun fait. Les deux fixtures historiques du
  fichier sont désormais insérées hors région puis reclassées, ce qui conserve
  exactement le scénario que le backfill répare.
- `scripts/measure-admission-at-write.mts` — mesure sur une base jetable créée
  par `test/helpers/testdb.ts` : 12 insertions SQL brutes (aucune consigne
  applicative), ce qui reproduit la voie d'un writer externe ; lecture du
  journal et évaluation par `evaluateCustody`.
- `bench/results/admission-at-write.json` — avant `0/112` (rapport archivé du
  backfill), après `12/12`, `backfilled: 0`, `noVictimData: true`.
- `package.json` — script `custody:write-boundary`.

`apps/api/src/server.ts` : **0 ligne modifiée**.

## Commandes reproductibles

```sh
# Mesure livrée (base jetable, aucune écriture en production)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-admission-at-write.mts \
  --json=bench/results/admission-at-write.json

# Comportements
cd apps/api && DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  ./node_modules/.bin/tsx test/run.ts test/custody.test.ts
```

Résultat observé : `12/12 ... (100 %)`, `Backfilled: 0` ; tests ciblés **9/9 verts**.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : le trigger teste `NEW.regional`, jamais un
  périmètre national.
- **Sources grises autorisées** : aucune règle de licence ajoutée.
- **Aucune donnée personnelle** : le payload ne contient que des colonnes
  techniques ; la mesure vérifie qu'aucun titre synthétique n'atteint le journal.
- **Aucun service payant** : PostgreSQL local et dépendances déjà versionnées.
- **Un test par comportement** : deux tests, deux comportements distincts.
- **Diff de `server.ts` ≤ 10 lignes** : 0 ligne.

## Limite connue, hors périmètre du chiffre

Les 112 événements historiques restent couverts par le backfill : un trigger
`AFTER INSERT` ne réécrit pas le passé, et le journal est append-only par
conception. La garantie apportée ici porte sur les **nouvelles** écritures. Les
writers applicatifs qui consignent déjà leur propre `event.admitted` produisent
désormais deux faits d'admission pour le même sujet (le leur et celui du
trigger) ; la règle de custody en accepte plusieurs, et le doublon reste lisible
comme deux acteurs distincts attestant la même admission.
