# Rapport — Graphe temporel complet

## Prévol et point de départ

La PR #290 (« graphe de connaissance temporel », fusionnée dans `origin/main`)
annonçait 28 605 entités et 56 812 relations typées. Sur la base réelle
interrogée le 22 novembre 2026, la projection n'existait pas : aucune table
`graph_entity` / `graph_relation`, migrations arrêtées à `migrate-045`.
L'objectif chiffré de #290 n'était donc **pas atteint en base** ; le travail a
été repris depuis `origin/main`, qui contient cette PR, sans réécrire son API.

État réel mesuré avant projection :

- 1 673 151 organisations ;
- 312 sources ;
- 26 394 événements.

## Ce qui a été livré

- `db/migrate-064-graphe-temporal-complete.sql` : projection idempotente
  `refresh_temporal_graph_complete()`, compatible avec une base n'ayant pas
  encore `event.valid_at` (elle utilise `observed_at`, puis `collected_at`,
  puis `created_at`). Elle reconstruit les liens à partir des faits, jamais
  d'un état antérieur.
- Dix types de relations horodatées : `reported_by`, `contains`,
  `targeted_by`, `claims`, `attributed_to`, `located_in`, `owns_domain`,
  `published_on`, `mentions_product`, `produced_by` (plus `resolves_to` /
  `dns_link` quand les tables DNS sont présentes).
- `scripts/mesure-graphe-temporal.mts` et la commande `pnpm mesure:graphe-temporal`.
- Sept tests API, un par comportement observable, dans
  `apps/api/test/graphe-temporal-complete.test.ts`.
- `apps/api/src/server.ts` : **aucune modification** (0 ligne).

## Commande de mesure reproductible

```bash
pnpm mesure:graphe-temporal
# ou, avec l'URL explicite :
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-graphe-temporal.mts
```

La commande est en lecture seule sur les tables du graphe ; elle écrit le
relevé daté dans `bench/results/graphe-temporal.json`. Elle ne lit aucune
donnée personnelle : seuls des comptages et des types de liens sont exportés.

## Résultat mesuré

**81 171 relations horodatées** sur 81 171 relations (100 % portent un
`valid_from` réel), pour 27 557 entités. Le chiffre est supérieur aux
56 812 relations de #290, soit +24 359.

| Type de relation | Nombre |
| --- | ---: |
| `reported_by` | 26 394 |
| `contains` | 26 394 |
| `published_on` | 25 917 |
| `mentions_product` | 1 316 |
| `produced_by` | 619 |
| `claims` | 415 |
| `targeted_by` | 51 |
| `located_in` | 44 |
| `attributed_to` | 21 |
| **Total** | **81 171** |

21 relations portent également une fin de période mesurée (`valid_to`).

## Contraintes

- **Nouvelle-Aquitaine uniquement** : les organisations projetées sont
  limitées aux douze départements de la région (codes et noms). Le relevé
  vérifie 0 organisation hors région dans le graphe.
- **Sources grises autorisées** : les hôtes de publication trouvés dans
  `event.source_url` sont des faits de publication, pas des actifs de
  victimes ; ils alimentent `published_on`.
- **Aucune donnée personnelle de victime** : les libellés d'événements sont
  construits à partir de la famille, de la date et de l'identifiant ; ni le
  titre ni le texte libre de `evidence` n'est copié dans le graphe. Un test
  dédié échoue si un nom de victime apparaît dans une entité.
- **Aucun service payant** : PostgreSQL local, aucune API externe.
- **Code et interface en anglais**, rapport en français.
- **Diff de `server.ts` ≤ 10 lignes** : 0 ligne modifiée.
- **Aucune commande > 60 s** : reconstruction en 3,6 s, mesure en ~1 s,
  suite ciblée de 12 tests en ~2 s.

## Vérification

`tsx test/run.ts test/graphe-temporal-complete.test.ts test/graphe-temporal.test.ts`
sur une base éphémère : 12 tests réussis (7 nouveaux + 5 de non-régression de
#290), dont l'idempotence de la reconstruction et l'absence de noms de
victimes.

Note d'environnement : trois requêtes DDL d'un autre chantier attendaient un
verrou sur `org` depuis plus de deux heures et bloquaient toute lecture de
cette table. Seules ces requêtes en attente (aucune écriture en cours) ont été
annulées avant la mesure ; aucune donnée n'a été supprimée.
