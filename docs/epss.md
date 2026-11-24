# Scores EPSS réels

**Source** : API publique FIRST, sans clé ni quota déclaré —
`https://api.first.org/data/v1/epss`. Pagination `limit`/`offset` (plafond `limit=10000`,
vérifié : demander 100 001 rend `limit:10000`), `total` annoncé à 402 773 lignes le
2026-11-10, 410 485 lignes le 2026-11-20. Filtres `?cve=CVE-…,…` et `?date=AAAA-MM-JJ`
également disponibles.

**Rafraîchissement** : `apps/api/node_modules/.bin/tsx scripts/refresh-epss.mts --apply`
(dry-run par défaut), avec `DATABASE_URL` exportée explicitement — le défaut de
`apps/api/src/db.ts` pointe sur 5432, alors que la base de dev Docker écoute sur 5433.
1 requête/s maximum, `User-Agent` explicite (`radar-cyber-epss/1.0`). Fréquence
recommandée : **quotidienne**, après la publication FIRST (~13 h Paris) ; relancer est
idempotent (upsert sur `cve`). Durée mesurée : ~163 s pour les 42 pages du dump complet.

**Où vont les scores** : dans la table dédiée `epss` (migration 021 : `cve` PK, `score`,
`percentile`, `updated_at`), une ligne par CVE, mise à jour en place, **aucun
événement**. La règle d'admission `admitByEpss` (`collectors/relevance.ts`) lit la table
via `SELECT cve, score FROM epss WHERE score >= $1` (`collectors/generic.ts`), au seuil
`EPSS_ADMISSION_THRESHOLD` = 0,3. Le dump complet est chargé (~410 000 lignes) ; le
filtrage se fait à la lecture, pas à l'écriture. Avant la migration 021, les scores
vivaient dans `event` (source `epss`) : historique du 2026-11-10 ci-dessous, conservé
tel que mesuré à l'époque.

**Effet mesuré** (2026-11-10, comportement `event` d'alors) : 402 773 lignes
téléchargées, **3 731 retenues sur 3 929 CVE suivies (95 %)**, **2 734 scores réels
écrits**. Sur `feed:ecrimelabs` (3 267 items CVE), les items passant `admitByEpss`
tombent de **0 → 2 681** : la règle d'admission n'est plus inerte.

## 2026-11-20 — refresh réel après le trou de collecte du 17-20 nov

Avant/après mesurés par requêtes reproductibles (voir plus bas) :

- **Avant** : 196 lignes dans `epss`, toutes des lignes de test `CVE-2026-99xx` —
  **aucun score réel** : la table n'avait jamais reçu le dump depuis la migration 021.
  0 ligne > 0,30. Le `max(updated_at)` affiché (17 h 56 du jour) venait du ré-upsert
  des lignes de test par la suite de tests API, pas d'un vrai refresh.
- **Refresh** : 42 pages, 410 485 CVE téléchargées (total API annoncé : 410 485),
  163 s, 410 289 nouvelles lignes écrites.
- **Après** : 410 485 lignes, `max(updated_at)` 18 h 23, **7 189 lignes avec
  score > 0,30** (7 190 à `>= 0,30`).
- Les lignes de test `CVE-2026-99xx` : la plage recoupe désormais 896 entrées réelles
  du dump (des CVE-2026-99xx existent bel et bien). Aucune entrée de cette plage ne
  dépasse 0,3 : aucune admission parasite via les anciennes données de test.

Requêtes de vérification :

```sql
SELECT count(*), max(updated_at) FROM epss;
SELECT count(*) FROM epss WHERE score > 0.30;
```

## 2026-11-23 — top 50 croisé à l'exposition des services

La migration `db/migrate-215-epss-exposure-eval.sql` matérialise
`epss_exposure_eval` : une ligne par paire (CVE, service exposé) dont le score
EPSS atteint 0,5, rangée par score décroissant puis CVE puis service.
La fonction `refresh_epss_exposure_eval()` recalcule la table depuis `epss` et
`exposition_service` ; `scripts/verifie-epss-exposure.mts` lit le critère.

Règle `epss-cross@1` :

- **exposé** : `source_url` non vide et service consulté il y a moins de 7 jours ;
- **exploitable** : score EPSS ≥ 0,5, publié ou rafraîchi il y a moins de 7 jours ;
- **confirmé** : les deux conditions réunies. La CVE doit figurer dans
  `evidence->vulns` du service, c'est-à-dire dans la preuve primaire renvoyée
  par la consultation. Le catalogue KEV est conservé dans une colonne séparée :
  un EPSS élevé n'est pas une preuve d'exploitation active.

Critère de sortie et résultat observé sur la base de mesure :

```sql
SELECT count(*) FILTER (WHERE confirmed)::float/count(*) FROM epss_exposure_eval WHERE rank<=50;
```

```text
 ?column?
----------
        1
```

50 lignes dans le top 50, 50 confirmées. La table ne recopie ni adresse IP,
ni URL de consultation, ni nom d'organisation : `service_id` renvoie à
l'inventaire existant et `nvd_url` est dérivée de l'identifiant public de la CVE.
