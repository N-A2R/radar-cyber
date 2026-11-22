# Portée géographique des infrastructures partagées en Nouvelle-Aquitaine

OBJECTIF : atteint — 5 clusters inter-départementaux / ≥ 3 clusters inter-départementaux

Tranche précédente : OBJECTIF : atteint — 3 clusters datés / ≥ 2 clusters datés

## Chiffre mesuré

La mesure reproductible sur la base réelle au moment de l'exécution détecte
**5 clusters d'infrastructure partagée**, dont **5 reliant des victimes établies
dans au moins deux départements distincts** de Nouvelle-Aquitaine. Les neuf
départements couverts sont 16, 17, 19, 23, 33, 40, 47, 64 et 79. La base lue
contient alors 1 673 220 organisations, 711 sources et 26 770 événements.

La cible retenue est de **trois clusters inter-départementaux** : après avoir
détecté les ancres partagées puis les avoir datées, il reste à vérifier si leur
réutilisation dépasse le cadre d'un seul département. Une majorité claire de
clusters franchissant cette frontière est le signal minimal utile à une veille
régionale coordonnée.

## Définition opérationnelle

- **Cluster inter-départemental** : un cluster d'infrastructure partagée dont
  les victimes sont rattachées à au moins deux codes départementaux distincts.
  Un code répété chez plusieurs victimes ne compte qu'une fois.
- **Département couvert** : code départemental distinct observé chez au moins
  une victime d'au moins un cluster, dédupliqué sur l'ensemble des clusters.
- **Rattachement** : code `org.dept` lu pour les organisations victimes, restreint
  aux 12 codes de Nouvelle-Aquitaine. Une victime sans code exploitable est
  ignorée, jamais devinée.
- **Périmètre** : identifiants d'organisations, codes départementaux et hôtes
  d'infrastructure uniquement. Aucun nom de victime, corps de revendication,
  e-mail ou identifiant personnel n'entre dans le calcul ou la sortie. Sources
  grises éligibles, aucun appel réseau, aucun service payant.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:shared-infrastructure-geography \
  --json=bench/results/shared-infrastructure-geography.json
```

Sortie observée :

```
NA shared infrastructure geography: 5/5 clusters cross departments (departments=9, orgs=1673220) -> bench/results/shared-infrastructure-geography.json
```

Le JSON publié contient l'objectif (`target: 3`, `achieved: 5`), les cinq
datations géographiques par cluster, les compteurs, la requête SQL utilisée et
l'état de la base. La base ayant continué d'évoluer depuis la tranche de
datation, le nombre de clusters détectés passe de 4 à 5 ; le présent rapport
ne porte que sur la mesure ci-dessus.

## Détail des clusters

| Ancre (hôte) | Départements | Inter-départemental |
| --- | --- | :---: |
| `6g3aoky5hft4mvzcqt2bugo4r465woaorjhd7em2k2v24sr2exaro5id.onion` | 16, 19, 23, 40, 64 | oui |
| `kg2pf5nokg5xg2ahzbhzf5kucr5bc4y4ojordiebakopioqkk4vgz6ad.onion` | 16, 40, 79 | oui |
| `ransomocmou6mnbquqz44ewosbkjk3o5qjsl3orawojexfook2j7esad.onion` | 17, 33 | oui |
| `mbrlkbtq5jonaqkurjwmxftytyn2ethqvbxfu4rgjbkkknndqwae6byd.onion` | 33, 79 | oui |
| `z3wqggtxft7id3ibr7srivv5gjof5fwg76slewnzwwakjuf3nlhukdid.onion` | 16, 47 | oui |

Les identifiants de victimes restent dans le JSON, pas dans ce tableau.

## Code et tests

- `apps/api/src/analyse/shared-infrastructure-geography.ts` — calcul pur de la
  portée départementale des clusters, indépendant de l'ordre des observations.
- `apps/api/src/analyse/shared-infrastructure-store.ts` — une requête SQL
  supplémentaire lit les couples identifiant/département ; les mesures de
  détection et de datation existantes restent inchangées.
- `scripts/measure-shared-infrastructure-geography.mts` — commande reproductible.
- `apps/api/test/shared-infrastructure-geography.test.ts` — **6 tests, un par
  comportement** : cluster inter-départemental, cluster d'un seul département,
  victime absente du référentiel, déduplication d'un code, couverture distincte
  entre clusters, indépendance vis-à-vis de l'ordre.

Vérifications exécutées : 6/6 nouveaux tests verts, typecheck API sans erreur,
mesure reproductible ci-dessus. `apps/api/src/server.ts` n'est pas modifié :
**0 ligne de diff**.

## Limites

- Une portée inter-départementale constate une infrastructure réutilisée dans
  plusieurs départements ; elle ne prouve ni une campagne coordonnée ni une
  attribution d'attaquant.
- Le rattachement vient du registre des organisations : un siège hors de la
  région ou un code manquant réduit la couverture mesurée.
- Aucune collecte réseau ni source payante n'a été ajoutée ; seules les données
  déjà stockées sont lues.
