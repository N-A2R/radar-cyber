# Persistance inter-départementale des infrastructures partagées en Nouvelle-Aquitaine

OBJECTIF : atteint — 4 clusters inter-départementaux datés / ≥ 2 clusters inter-départementaux datés

Tranche précédente : OBJECTIF : atteint — 5 clusters inter-départementaux / ≥ 3 clusters inter-départementaux

## Chiffre mesuré

La mesure reproductible sur la base réelle détecte **5 clusters d'infrastructure
partagée**, dont **5 inter-départementaux** et **4 datés**. Leur intersection —
clusters à la fois inter-départementaux et observés sur au moins deux jours UTC
distincts — compte **4 clusters persistants**, sur 9 départements couverts.
La base lue contient alors 1 673 220 organisations, 914 sources et 26 770
événements.

Aucune cible chiffrée n'était donnée pour cette tranche : la cible retenue est
**au moins deux clusters réunissant les deux dimensions**. Après avoir détecté
les ancres partagées, les avoir datées puis mesuré leur portée géographique,
il reste à vérifier que les deux signaux se cumulent : une infrastructure
réutilisée dans plusieurs départements *et* sur plusieurs jours est un signal
de veille plus solide qu'une seule des deux mesures prises isolément.

## Définition opérationnelle

- **Cluster persistant** : cluster d'infrastructure partagée dont les victimes
  sont rattachées à au moins deux codes départementaux NA distincts **et** dont
  l'ancre a été observée sur au moins deux jours UTC distincts.
- **Jointure** : les deux mesures existantes (géographie et datation) sont
  jointes par identifiant de cluster. Une entrée absente de l'une des deux
  mesures n'est jamais réputée satisfaire l'autre dimension ; elle est comptée
  comme non persistante avec un délai de 0 jour.
- **Délai** : nombre de jours calendaires entre le premier et le dernier jour
  d'observation de l'ancre, calculé par la tranche de datation.
- **Périmètre** : identifiants d'organisations, codes départementaux, hôtes
  d'infrastructure et dates uniquement. Aucun nom de victime, corps de
  revendication, e-mail ou identifiant personnel n'entre dans le calcul ou la
  sortie. Sources grises éligibles, aucun appel réseau, aucun service payant.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:shared-infrastructure-persistence \
  --json=bench/results/shared-infrastructure-persistence.json
```

Sortie observée :

```
NA shared infrastructure persistence: 4/5 clusters cross departments and days (dated=4, departments=9, orgs=1673220) -> bench/results/shared-infrastructure-persistence.json
```

Le JSON publié contient l'objectif (`target: 2`, `achieved: 4`), les cinq
jointures par cluster, les compteurs, les requêtes SQL utilisées et l'état de
la base. La mesure n'ajoute aucune requête : elle réutilise `SQL.departments` et
les observations déjà lues par les tranches précédentes.

## Détail des clusters

| Ancre (hôte) | Départements | Jours | Persistant |
| --- | --- | ---: | :---: |
| `6g3aoky5hft4mvzcqt2bugo4r465woaorjhd7em2k2v24sr2exaro5id.onion` | 16, 19, 23, 40, 64 | 1 | oui |
| `kg2pf5nokg5xg2ahzbhzf5kucr5bc4y4ojordiebakopioqkk4vgz6ad.onion` | 16, 40, 79 | 0 | non |
| `ransomocmou6mnbquqz44ewosbkjk3o5qjsl3orawojexfook2j7esad.onion` | 17, 33 | 288 | oui |
| `mbrlkbtq5jonaqkurjwmxftytyn2ethqvbxfu4rgjbkkknndqwae6byd.onion` | 33, 79 | 143 | oui |
| `z3wqggtxft7id3ibr7srivv5gjof5fwg76slewnzwwakjuf3nlhukdid.onion` | 16, 47 | 314 | oui |

Les identifiants de victimes restent dans les JSON des tranches précédentes,
pas dans ce tableau. Le cluster exclu est vu sur un seul jour UTC malgré ses
trois départements : le cumul des deux dimensions écarte cet artefact
d'ingestion sans toucher aux mesures d'origine.

## Code et tests

- `apps/api/src/analyse/shared-infrastructure-persistence.ts` — jointure pure
  géographie × datation par identifiant de cluster, indépendante de l'ordre.
- `apps/api/src/analyse/shared-infrastructure-store.ts` — une fonction de mesure
  qui lit une seule fois la base et réutilise les trois calculateurs existants ;
  la lecture des départements est factorisée entre les deux mesures qui l'emploient.
- `scripts/measure-shared-infrastructure-persistence.mts` — commande reproductible.
- `apps/api/test/shared-infrastructure-persistence.test.ts` — **7 tests, un par
  comportement** : intersection positive, cluster d'un seul département,
  cluster d'un seul jour, entrée absente de la datation, jointure par identifiant
  quel que soit l'ordre, entrée de datation sans géographie correspondante,
  sortie sans identifiant de victime.

Vérifications exécutées : 7/7 nouveaux tests verts, 27/27 tests d'infrastructure
verts (8 détection + 6 datation + 6 géographie + 7 persistance), typecheck API
sans erreur (`tsc --noEmit`, sortie vide), mesure reproductible ci-dessus,
non-régression de `pnpm measure:shared-infrastructure-geography` (5/5 clusters,
9 départements). `apps/api/src/server.ts` n'est pas modifié : **0 ligne de diff**.

## Limites

- Un cluster persistant constate une infrastructure réutilisée dans le temps et
  l'espace ; il ne prouve ni campagne coordonnée ni attribution d'attaquant, et
  n'affirme pas que l'ancre est encore active aujourd'hui.
- La jointure dépend de la qualité des deux mesures d'origine : un département
  manquant ou une date d'ingestion unique réduisent le décompte, jamais deviné.
- Aucune collecte réseau ni source payante n'a été ajoutée ; seules les données
  déjà stockées sont lues.
