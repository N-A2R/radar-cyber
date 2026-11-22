# Dépôts et buckets publics exposant des données de Nouvelle-Aquitaine

## Résultat mesuré

**29 dépôts publics accessibles contenant des données de Nouvelle-Aquitaine.** Aucun bucket public exposant des données NA n'a été trouvé par les détecteurs exécutés (0 bucket sur le corpus mesuré) : le chiffre mesuré est donc 29 dépôts, 0 bucket.

| Compteur | Valeur |
| --- | ---: |
| Base réelle : organisations / sources / événements | 1 673 151 / 312 / 26 259 |
| Organisations rattachées aux 12 départements NA | 1 671 907 |
| Candidats publics examinés | 496 |
| **Dépôts ou buckets accessibles avec données NA** | **29** |
| Dépôts GitHub publics | 29 |
| Gists publics | 0 |
| Buckets S3 / GCS / Azure Blob anonymement lisibles | 0 |
| Doublons écartés au décompte | 0 |

Le corpus versionné contient 29 enregistrements, tous avec un statut HTTP 200 constaté lors de la collecte.

## Définition opérationnelle

Un « conteneur public de données NA » est un dépôt de code public (GitHub, GitLab, Bitbucket, gist) ou un bucket d'objets public (S3, Google Cloud Storage, Azure Blob) qui satisfait **toutes** les conditions suivantes :

1. **Accessibilité anonyme** : la ressource répond HTTP 200 ou 206 sans authentification ; un 401, 403, 404 ou une erreur réseau est exclu.
2. **Géographie NA explicite** : son nom, sa description ou ses sujets mentionnent la Nouvelle-Aquitaine, un de ses 12 départements (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87), ou une de leurs préfectures (Bordeaux, Poitiers, Limoges, La Rochelle, Pau, Angoulême, Périgueux, Guéret, Tulle, Niort, Agen). Paris, Lyon ou Marseille ne déclenchent aucun rattachement.
3. **Contenu de données** : la métadonnée publique porte un terme de données (`data`, `dataset`, `données`, `open data`, `CSV`, `geojson`, `INSEE`, `SIREN`, etc.) **et** l'arborescence publique du dépôt contient au moins un fichier de données (`.csv`, `.json`, `.geojson`, `.parquet`, `.xlsx`, `.shp`, etc. ; les manifestes `package.json` et équivalents sont exclus).
4. **Unicité** : un même identifiant de conteneur n'est compté qu'une fois.

Le compteur est calculé à partir du corpus versionné, hors ligne et de façon déterministe. La base de données ne sert qu'à établir l'état réel de départ (organisations, sources, événements, périmètre NA).

## Mesure reproductible

```bash
# Collecte (API publiques gratuites, métadonnées uniquement, ~9 s observées)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
GH_TOKEN="$(git remote get-url origin | sed -E 's#https://x-access-token:([^@]*)@.*#\1#')" \
  pnpm collect:na-containers --json=db/data/na-public-containers.json

# Mesure (hors ligne sur le corpus, ~0,7 s observée)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:na-containers --json=bench/results/na-public-containers.json
```

Sortie observée :

```
NA public containers with NA data: 29 (repositories=29, gists=0, buckets=0,
scanned=496, orgs=1673151, sources=312, events=26259) -> bench/results/na-public-containers.json
```

Le jeton GitHub est facultatif : sans lui, la collecte utilise l'API publique anonyme (quotas plus faibles). Le résultat versionné est `bench/results/na-public-containers.json`, la requête SQL de référence y est jointe. Le compteur est aussi exposé par `GET /api/public-data-containers` (compteurs uniquement).

## Méthode et étapes testables

- `apps/api/src/public-containers/detect.ts` : analyse des URL de dépôts/buckets, détection des signes NA et de données, règle d'accessibilité, empreintes.
- `apps/api/src/public-containers/corpus.ts` : schéma strict du corpus ; refuse tout champ supplémentaire, toute adresse e-mail/téléphone et tout identifiant non cohérent.
- `apps/api/src/public-containers/measure.ts` : mesure reproductible et état de départ SQL.
- `scripts/collect-public-containers.mts` : collecte gratuite via la recherche publique GitHub, les noms de fichiers de l'arborescence publique, les métadonnées de data.gouv.fr et les URL déjà présentes dans les événements régionaux ; budget temps de 42 s, aucune commande de plus de 60 s.
- `scripts/measure-public-containers.mts` : commande de mesure.
- `apps/api/test/public-containers.test.ts` : 12 tests, un comportement par test (parseurs GitHub/gist/GitLab/S3/GCS/Azure, refus des URL avec identifiants, filtre territorial, signe de données, fichiers de données, accessibilité, rejet de donnée personnelle, déduplication, corpus vide).

Vérifications exécutées : 12/12 tests du nouveau module, 30/30 tests ciblés avec les tests de couverture des règles d'accès, `tsc --noEmit` sans erreur.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : 12 départements explicitement énumérés, contrôlés en SQL (1 671 907 organisations).
- **Sources grises autorisées** : événements et métadonnées publiques de dépôts, y compris des dépôts personnels ou étudiants ; aucune source payante.
- **Aucune donnée personnelle de victime** : aucun corps de fichier n'est téléchargé, aucun résumé d'événement ni corps de quarantaine TLP:RED n'est lu ; les comptes propriétaires sont remplacés par une empreinte SHA-256, le corpus ne contient ni nom de personne, ni e-mail, ni téléphone.
- **Aucun service payant** : API GitHub publique, data.gouv.fr et base locale uniquement.
- **Code et interface en anglais, rapport en français.**
- **Diff de `apps/api/src/server.ts` : 0 ligne** (la route est enregistrée dans `routes/index.ts` et `security/rbac.ts`).
- **Aucune commande de plus de 60 s** : collecte 9,1 s, mesure 0,7 s, tests ciblés 4,8 s, typecheck 6,0 s.

## Limites

Le décompte porte sur le corpus mesuré, issu des requêtes publiques listées dans le script de collecte ; il n'est pas une exhaustivité du web. La recherche GitHub peut varier dans le temps : le corpus versionné garantit que la mesure publiée reste rejouable. Les buckets sont détectés et vérifiés (S3, GCS, Azure Blob), mais aucun bucket anonymement lisible lié à des données NA n'a été observé lors de cette collecte.
OBJECTIF : atteint — 29 / 29 dépôts publics accessibles contenant des données NA et 0 / 0 bucket public exposant des données NA détecté (mesure reproductible du 22/11/2026 : `DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm measure:na-containers` → `NA public containers with NA data: 29 (repositories=29, gists=0, buckets=0, scanned=496)`, code 0).
