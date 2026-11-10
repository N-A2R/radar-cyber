# Scores EPSS réels

**Source** : API publique FIRST, sans clé ni quota déclaré —
`https://api.first.org/data/v1/epss`. Pagination `limit`/`offset` (plafond `limit=10000`,
vérifié : demander 100 001 rend `limit:10000`), `total` annoncé à 402 773 lignes le
2026-11-10. Filtres `?cve=CVE-…,…` et `?date=AAAA-MM-JJ` également disponibles.

**Rafraîchissement** : `apps/api/node_modules/.bin/tsx scripts/refresh-epss.mts --apply` (dry-run par défaut). 1 requête/s maximum, `User-Agent` explicite
(`radar-cyber-epss/1.0`). Fréquence recommandée : **quotidienne**, après la publication FIRST (~13 h Paris) ; relancer est idempotent (upsert sur `dedup_key`).

**Où vont les scores** : uniquement dans `event`, en lignes de source `epss`, au format du
collecteur (`dedup_key = epss:<CVE>`, titre `CVE-AAAA-N — EPSS x`,
`evidence->>'epss'` = score). C'est la seule table lue par `loadCoverageContext()`
(`collectors/generic.ts`) donc la seule façon d'alimenter `admitByEpss`. Seules les CVE
déjà suivies (`indicator`, `event`, `org_alias`) avec score ≥ 0,10
(`EPSS_ADMISSION_THRESHOLD`) sont écrites : en dessous, un score ne peut jamais admettre.
`db/migrate-020-epss.sql` n'ajoute donc aucune table, seulement l'index partiel
`event(source_id) WHERE source_id = 'epss'`.

**Effet mesuré** (2026-11-10) : 402 773 lignes téléchargées, **3 731 retenues sur 3 929
CVE suivies (95 %)**, **2 734 scores réels écrits**. Sur `feed:ecrimelabs`
(3 267 items CVE), les items passant `admitByEpss` tombent de **0 → 2 681** : la règle
d'admission n'est plus inerte. Les 100 lignes de test `CVE-2026-99xx` restent en base
(signalées, non supprimées) ; elles ne recoupent aucun item réel.
