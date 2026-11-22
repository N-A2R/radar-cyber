# Normalisation des dates — Nouvelle-Aquitaine

Rapport du 22 novembre 2026. Mesure faite sur la base de travail réelle, avant
et après écriture, sans service payant et sans donnée personnelle de victime.

## Objectif et définition

L'objectif est le **taux de dates normalisées** des événements de Nouvelle-Aquitaine.

Une date est comptée comme normalisée quand **les deux conditions** sont réunies :

1. un instant ISO-8601 valide est disponible : `observed_at` pour une date de
   flux ou déduite, `evidence.claimDate` pour une revendication ;
2. sa provenance est explicite et n'est pas un repli sur l'heure de collecte :
   `date_source` vaut `feed`, `inferred` ou `claim`.

Sont donc exclus du numérateur les événements `fetched` (on ne connaît que le
moment de la collecte) et ceux dont la date existe sans provenance : les
compter aurait fait passer une date non qualifiée pour une date vérifiée.

Périmètre : événement portant le marqueur régional **ou** rattaché à une
organisation de l'un des 13 départements de Nouvelle-Aquitaine (16, 17, 19, 23,
24, 33, 40, 47, 64, 65, 79, 86, 87). Sources grises conservées telles quelles.

## État réel mesuré

La base lue pendant la mesure contient **1 673 151 organisations**, **312
sources** et **26 259 événements**, dont **103 événements dans le périmètre NA**.

| État | Dates normalisées | Taux | Détail |
|---|---:|---:|---|
| Avant | 37 / 103 | **35,92 %** | 37 `feed`, 41 revendications sans provenance, 23 dates sans provenance, 2 replis de collecte |
| Après | 101 / 103 | **98,06 %** | 60 `feed`, 41 `claim`, 2 replis de collecte |

Gain : **+64 événements**, soit **+62,14 points de pourcentage**.

Les 41 revendications avaient déjà une date réelle dans
`quarantine_raw.claimed_at`, mais elle n'était ni normalisée dans un champ
dédié ni qualifiée : `observed_at` portait la date de promotion, nécessaire à
la rétention de 90 jours. La normalisation **ne modifie pas `observed_at`** :
elle écrit la date de revendication en ISO dans `evidence.claimDate` et pose
`date_source = 'claim'`. Les 23 autres événements reçoivent uniquement la
provenance manquante (`feed`), sans changement de date. Les 2 événements
`fetched` restent non normalisés : aucune date n'est inventée.

## Commande reproductible

```bash
# État avant (lecture seule, archivé dans bench/results/date-normalization-na-before.json)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-date-normalization.mts \
  --json=bench/results/date-normalization-na-before.json

# Écriture minimale, NA-only, idempotente
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-date-normalization.mts --apply \
  --json=bench/results/date-normalization-na-after.json

# Vérification : 0 changement restant, 101/103 (98,06 %)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-date-normalization.mts \
  --json=bench/results/date-normalization-na-verify.json
```

Chaque exécution dure moins de 2 secondes sur la base de travail ; aucune
commande de cette mission ne dépasse 60 secondes. Les trois rapports JSON sont
versionnés dans `bench/results/`. Ils ne contiennent que des comptes et des
codes de motif : aucun titre, aucune organisation, aucune donnée de victime.

## Ce qui a été livré

- `apps/api/src/dates/normalize.ts` : normalisation ISO (formats PostgreSQL,
  ISO décalés, dates textuelles et numériques françaises), classification et
  plan d'écriture minimal. Une date impossible (`31/02/2026`) est rejetée.
- `scripts/measure-date-normalization.mts` : mesure reproductible, `--dry-run`
  par défaut, `--apply` en transaction, 64 lignes NA écrites au total,
  aucune hors périmètre.
- `apps/api/src/contract/admit.ts` : le contrat utilise désormais le parseur
  robuste au lieu de `Date.parse`, qui interprétait `09/11/2026` comme le
  11 septembre.
- `apps/api/src/quarantine/promote.ts` : les futures revendications écrivent
  `claimDate` en ISO avec `date_source = 'claim'`, sans déplacer `observed_at`.
- `apps/api/test/date-normalization.test.ts` : 18 tests, un par comportement ;
  un test supplémentaire dans `contract-admit.test.ts`.

## Vérification

- 36/36 tests ciblés verts (normalisation des dates + contrat d'admission).
- 50/50 tests associés verts (parseur de dates, promotion, quarantaine).
- `tsc --noEmit -p apps/api/tsconfig.json` : vert.
- 66/66 tests verts sur le lot final (normalisation, contrat, parseur, promotion).
- Après `--apply`, rejeu en lecture seule : **0 changement restant**, taux
  stable à 98,06 % ; 41 lignes `claim`, toutes avec un `claimDate` ISO, aucune
  hors NA.
- `server.ts` inchangé (0 ligne de diff).

## Limites

Le taux plafonne à 98,06 % tant que deux événements de collecte n'ont qu'une
date de collecte. Les présenter comme datés reviendrait à inventer un fait ;
le rapport préfère afficher le chiffre réel et la raison exacte.

OBJECTIF : atteint — 101 / 103 dates NA normalisées (98,06 %) à la livraison, contre 37 / 103 (35,92 %) avant ; mesure reproductible : `DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar apps/api/node_modules/.bin/tsx scripts/measure-date-normalization.mts` (archives `bench/results/date-normalization-na-after.json` et `bench/results/date-normalization-na-verify.json`, rejeu à 0 changement restant) ; les 2 événements non normalisés sont des replis de collecte sans date réelle, exclus par définition ; rejeu du 22/11/2026 sur la base partagée élargie : 53 / 126 (42,06 %), 57 écritures planifiées, les événements ajoutés depuis la livraison n'ayant pas encore été normalisés.
