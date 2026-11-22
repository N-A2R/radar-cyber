# Datation des infrastructures partagées entre victimes de Nouvelle-Aquitaine

OBJECTIF : atteint — 3 clusters datés / ≥ 2 clusters datés

## Chiffre mesuré

Sur les **4 clusters d'infrastructure partagée** déjà détectés en Nouvelle-Aquitaine,
**3 sont datés** : leur ancre a été observée chez plusieurs victimes sur au moins
deux jours UTC distincts. Le délai médian de réutilisation est de **288 jours**,
le plus long de **314 jours**, pour **10 observations datées** au total. La base
réelle lue au moment de la mesure contient 1 673 220 organisations, 543 sources
et 26 758 événements (elle continue d'évoluer avec les tranches fusionnées).

La cible retenue est de **deux clusters datés** : au-delà du simple comptage de
clusters de la tranche précédente, il s'agit de vérifier que la persistance d'une
ancre partagée est réellement mesurable sur la base, et sur plusieurs dossiers.

## Définition opérationnelle

- **Cluster daté** : une ancre partagée par au moins deux victimes distinctes et
  observée sur au moins deux jours UTC distincts. Une ancre vue une seule journée
  produit un cluster non daté, même si plusieurs victimes la partagent.
- **Délai de réutilisation** : nombre de jours calendaires entre le premier et le
  dernier jour d'observation de l'ancre par les victimes du cluster. Ce n'est pas
  une durée d'activité continue : c'est l'écart observé entre deux apparitions.
- **Dates lues** : `leak_claim.published_at` pour `leak_site` et `claim_evidence`,
  `event.observed_at` pour `event_source`, `dns_snapshot.observed_at` pour les
  valeurs DNS. Aucune date n'est inventée ; une observation sans date exploitable
  est ignorée.
- **Périmètre** : identifiants d'organisations, hôtes d'infrastructure et dates,
  uniquement. Aucun nom de victime, corps de revendication, e-mail ou identifiant
  personnel n'entre dans le calcul ni dans la sortie. Sources grises éligibles,
  aucun appel réseau, aucun service payant.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:shared-infrastructure-timeline \
  --json=bench/results/shared-infrastructure-timeline.json
```

Sortie observée :

```
NA shared infrastructure timeline: 3/4 clusters dated (median=288d, longest=314d, observations=10, orgs=1673220) -> bench/results/shared-infrastructure-timeline.json
```

Le JSON publié contient les compteurs, l'objectif (`target: 2`, `achieved: 3`),
les quatre datations par cluster, les requêtes SQL utilisées et l'état de la base.

## Détail des clusters

| Ancre (hôte) | Première observation | Dernière observation | Délai | Daté |
| --- | --- | --- | ---: | :---: |
| `ransomocmou6mnbquqz44ewosbkjk3o5qjsl3orawojexfook2j7esad.onion` | 2025-05-26 | 2026-03-10 | 288 j | oui |
| `z3wqggtxft7id3ibr7srivv5gjof5fwg76slewnzwwakjuf3nlhukdid.onion` | 2025-04-06 | 2026-02-14 | 314 j | oui |
| `mbrlkbtq5jonaqkurjwmxftytyn2ethqvbxfu4rgjbkkknndqwae6byd.onion` | 2026-03-30 | 2026-08-20 | 143 j | oui |
| `6g3aoky5hft4mvzcqt2bugo4r465woaorjhd7em2k2v24sr2exaro5id.onion` | 2026-11-21 | 2026-11-21 | 0 j | non |

Les identifiants de victimes restent dans le JSON, pas dans ce tableau.

## Code et tests

- `apps/api/src/analyse/shared-infrastructure-timeline.ts` — datation pure des
  clusters, médiane et délai maximal, indépendants de l'ordre des observations.
- `apps/api/src/analyse/shared-infrastructure-store.ts` — les observations
  portent désormais leur date d'origine ; la mesure initiale est inchangée
  (4 clusters, 19 observations, 9 victimes regroupées).
- `scripts/measure-shared-infrastructure-timeline.mts` — commande reproductible.
- `apps/api/test/shared-infrastructure-timeline.test.ts` — **6 tests, un par
  comportement** : première/dernière date, dates absentes ou invalides, journée
  unique, observations hors cluster, médiane sur trois clusters, indépendance
  vis-à-vis de l'ordre.

Vérifications exécutées : 14/14 tests verts (6 nouveaux + 8 de la tranche
précédente), typecheck API sans erreur, mesure reproductible ci-dessus,
non-régression de `pnpm measure:shared-infrastructure` (4 clusters). Aucune
commande n'a dépassé 10 secondes. `apps/api/src/server.ts` n'est pas modifié :
**0 ligne de diff**.

## Limites

- Le quatrième cluster n'est pas daté : ses trois observations d'événements ont
  toutes été ingérées le même jour. Le classer « non daté » évite de transformer
  un artefact d'ingestion en durée de vie.
- Une ancre ancienne constate une réutilisation dans le temps, pas une attribution
  d'attaquant ni la preuve que l'infrastructure est toujours active aujourd'hui.
- Seules les dates déjà stockées sont lues ; aucune collecte réseau ni source
  payante n'a été ajoutée.

Suite : `docs/rapport-infrastructure-geographie.md` mesure la portée
inter-départementale des clusters détectés (5 clusters inter-départementaux sur 5).
