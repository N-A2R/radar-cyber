# Infrastructure partagée entre victimes de Nouvelle-Aquitaine

OBJECTIF : atteint — 4 clusters / ≥ 1 cluster

## Chiffre mesuré

**4 clusters d'infrastructure partagée** relient **9 organisations victimes** distinctes de Nouvelle-Aquitaine, via **4 ancres d'infrastructure** et **19 observations normalisées**. La base réelle lue au moment de la mesure contient 1 673 220 organisations, 463 sources et 27 899 événements (l'état annoncé — 1 673 151 / 312 / ~28 000 — a légèrement évolué avec les tranches déjà fusionnées).

Aucune cible chiffrée n'était donnée dans la mission : la cible opérationnelle retenue est **au moins un cluster détecté sur la base réelle**, afin que le compteur mesure une capacité de détection et non un chiffre inventé.

## Définition opérationnelle

- **Victime NA** : organisation rattachée à une revendication `leak_claim.na`, dont le département figure parmi les 12 codes de Nouvelle-Aquitaine (`DEPT_LABELS`). Seul l'identifiant numérique de l'organisation est conservé.
- **Observation d'infrastructure** : valeur publique associée à cette organisation dans `leak_site.site_url`, `leak_claim.evidence_url`, `event` + `source.url`, ou `dns_snapshot` (A, AAAA, MX, NS) via `dns_domaine.org_ids` / `org.domain`.
- **Ancre partagée** : hôte `.onion`, adresse IP ou hôte DNS observé chez **au moins deux victimes distinctes**. Les hôtes d'agrégation (`ransomlook.io`, `github.com`, etc.) sont explicitement exclus : ils ne sont pas une infrastructure des victimes et regrouperaient des dossiers sans lien.
- **Cluster** : composante connexe du graphe victime ↔ ancre (union-find). Une chaîne de deux ancres suffit pour relier trois victimes ; un hôte vu chez une seule victime ne produit aucun cluster.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:shared-infrastructure \
  --json=bench/results/shared-infrastructure.json
```

Sortie observée :

```
NA shared infrastructure clusters: 4 (victims=71, clustered=9, anchors=4, observations=19, orgs=1673220, sources=463, events=27899) -> bench/results/shared-infrastructure.json
```

Le résultat brut est `bench/results/shared-infrastructure.json` : compteurs, identifiants d'organisations, hôtes d'infrastructure et les trois requêtes SQL utilisées. Aucun appel réseau, aucun service payant. Les sources grises (ransomwatch, ransomlook) restent éligibles au même titre que les sources publiques.

## Détail des clusters

| Ancre (hôte) | Victimes | Taille |
| --- | --- | ---: |
| `ransomocmou6mnbquqz44ewosbkjk3o5qjsl3orawojexfook2j7esad.onion` | 3 | 3 |
| `6g3aoky5hft4mvzcqt2bugo4r465woaorjhd7em2k2v24sr2exaro5id.onion` | 2 | 2 |
| `mbrlkbtq5jonaqkurjwmxftytyn2ethqvbxfu4rgjbkkknndqwae6byd.onion` | 2 | 2 |
| `z3wqggtxft7id3ibr7srivv5gjof5fwg76slewnzwwakjuf3nlhukdid.onion` | 2 | 2 |

Les identifiants de victimes sont dans le JSON, pas dans ce tableau : le rapport ne publie que des compteurs.

## Code et tests

- `apps/api/src/analyse/shared-infrastructure.ts` — normalisation, union-find et regroupement déterministe (anglais).
- `apps/api/src/analyse/shared-infrastructure-store.ts` — lectures SQL minimales, aucune donnée personnelle.
- `scripts/measure-shared-infrastructure.mts` — commande reproductible et sortie JSON.
- `apps/api/test/shared-infrastructure.test.ts` — **8 tests, un par comportement** : normalisation d'URL `.onion`, rejet des agrégateurs, conservation des valeurs DNS, regroupement sur une ancre, regroupement transitif sur deux ancres, exclusion des observations isolées, absence de chemins/appels d'e-mails dans la sortie, déterminisme vis-à-vis de l'ordre des observations.

Vérifications exécutées : 8/8 tests verts (`apps/api/node_modules/.bin/tsx --test apps/api/test/shared-infrastructure.test.ts`), typecheck API sans erreur, mesure reproductible ci-dessus. Aucune commande n'a dépassé 60 secondes (tests 0,1 s, typecheck 3,4 s, mesure < 1 s). `apps/api/src/server.ts` n'est pas modifié : **0 ligne de diff**.

## Limites

- Seules les victimes disposant d'un `org_id` et d'une revendication marquée NA entrent dans le décompte ; les revendications sans organisation rattachée sont exclues plutôt que devinées.
- La couverture DNS des organisations NA reste limitée (1 445 organisations ont un domaine) : le nombre de clusters croîtra quand de nouvelles observations d'infrastructure seront collectées.
- Une ancre partagée constate une infrastructure commune, pas une causalité ni une attribution d'attaquant.
