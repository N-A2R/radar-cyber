# Triage de la suite de tests et CI à étages — Radar Cyber NA

Le 27 novembre 2026, la suite API comptait 408 fichiers pour **28 minutes
séquentielles** mesurées en CI. Le triage ci-dessous, fondé sur les durées
réelles collectées par le `duration-reporter` (artefact `api-shard-weights`),
montre que **89,4 % de ce temps n'était pas du test : c'était un minuteur
PostgreSQL qui survivait aux tests**. Corrigé, le même corpus tourne en
**~3 minutes séquentielles**, et la CI passe en étages : rapide sur la PR,
complète dans la merge queue, sur `main` et en nightly.

## Le stall : 30 secondes par fichier qui touche la base

### Mécanisme

`apps/api/src/db.ts` expose deux pools `pg` avec `idleTimeoutMillis: 30000`.
Chaque fichier de test est un process jetable (`tsx --test` lance un process
par fichier). Quand un fichier a fait au moins une requête, le client du pool
revient inactif mais **connecté** : au `release()`, `pg-pool` programme un
`setTimeout(30000)` non `unref`-é et le socket du client retient l'event
loop. Le process reste donc vivant exactement 30 s après le dernier test,
jusqu'à l'expiration du client inactif. Le reporter attribue ces 30 s au
fichier.

La signature est nette dans les durées collectées : 50 fichiers entre
30,2 s et 30,9 s, tous domaines confondus (`rate-limit` — 2 Ko, zéro
écriture — comme `org-report` ou `dns-historique`).

### Preuve (mesures du 27 novembre, PostgreSQL embarqué local)

| Mesure | Avant | Après correctif |
|---|---|---|
| Process qui importe `db.ts` + 1 requête `select 1` | sortie à **+30 058 ms** | sortie à **+226 ms** |
| `rate-limit.test.ts` via `run.ts` (base + schéma + 3 tests) | 30 704 ms en CI | **3 378 ms** (dont 952 ms de tests) |
| 8 fichiers dont 4 stallés (`forums`, `fuites`, `dns-historique`, `org-report`) + famille `gazetteer` | ~2 min 40 de stall seul | **5 059 ms** à eux tous (2 752 ms de tests) |

Handles actifs après la requête avant correctif : `TCPSocketWrap`, `Timeout`.
Après : plus aucun.

### Correctif

`allowExitOnIdle: true` sur les deux pools **uniquement en `NODE_ENV=test`**
(option `pg-pool` conçue pour cela : elle `unref` le minuteur d'inactivité et
le socket du client inactif). En production le serveur a ses propres handles :
le comportement est inchangé. `run.ts` positionne déjà `NODE_ENV=test` —
aucun des 408 fichiers de test n'a été modifié.

## Le triage complet (408 fichiers, durées CI mesurées)

| Catégorie | Fichiers | Temps mesuré | Après correctif | Décision |
|---|---|---|---|---|
| Victimes du stall (≥ 30 s) | 50 | 25 min 24 s | **22,9 s** | corrigées par `allowExitOnIdle`, rien à supprimer |
| Lents réels (> 1,5 s) | 6 | 23,5 s | inchangés | conservés : tests d'intégration utiles |
| Moyens (0,8–1,5 s) | 31 | 32,6 s | inchangés | conservés |
| Rapides (< 0,8 s) | 321 | 1 min 39 s | inchangés | conservés (médiane : 248 ms) |
| **Total** | **408** | **~28 min** | **~3 min (9,4×)** | — |

Les six fichiers réellement lents, à surveiller s'ils dérapent :

| Fichier | Durée |
|---|---|
| `kpi-couverture` | 8,11 s |
| `certificat-ignorance` | 6,65 s |
| `stl-pics` | 3,04 s |
| `memoire-longue` | 2,18 s |
| `cycle-collecte` | 2,05 s |
| `api-composition-securite` | 1,52 s |

Les 50 victimes du stall (toutes redevenues rapides, ~0,2–0,9 s de tests
réels) : `alerte-nis2-24h`, `bitemporal-coverage`, `campaign-cluster`,
`causal-edge`, `changepoint`, `claim-attribution`, `claim-chains`,
`communiques-store`, `contagion-route`, `cra-horloge`, `derive-semantique`,
`dns-change-signaux`, `dns-historique`, `dns-passive`,
`enrichissement-referentiel`, `export-dora`, `forecast-market`,
`forum-actors`, `forums`, `fuite-timeline`, `fuites`, `geo-backfill`,
`geo-complete`, `importer-corpus`, `incident-corroboration`,
`incident-family-clustering`, `insurance-query`, `leak-claim-corroboration`,
`leak-event-link`, `leak-sites`, `live-source-stream`, `onion-anteriorite`,
`openapi-exemples`, `org-nis2`, `org-report`, `orientation-collectivite`,
`phishing-typosquat`, `plan-collecte`, `provenance-gate`,
`provider-catalogue-coverage`, `provider-spof-api`, `providers-api`,
`rapport-mensuel`, `rate-limit`, `repair-match`, `second-victim`,
`silent-source`, `stix-projection`, `victim-alert`, `warc-eligibility`.

### Familles versionnées : pas des doublons

Le triage a examiné les candidats obvious à la fusion. Conclusion : ce sont
des **gardes de régression datées**, pas des redites, et toutes coûtent moins
de 400 ms.

- `gazetteer` / `gazetteer3` / `gazetteer5` / `gazetteer-index` : chaque
  fichier verrouille les décisions d'une époque du moteur (vague SIRENE pour
  `@3`, alias d'un seul mot pour `@5`). Supprimer les anciennes versions,
  c'est retirer la mémoire des arbitrages.
- `parseurs-formats` vs `parseurs-formats-reels` : extraits fixes de trois
  sources muettes d'une part, échantillons réels RSS/Atom/JSON-LD/HTML de
  l'autre ; les fonctions couvertes diffèrent (`detectItems` seul contre
  `detectSourceFormat`/`parseSource`/`normalizeLanguage`).
- `enrichissement-referentiel-legacy` : règles de refus pures (page parking,
  homonyme, code postal ambigu) sans réseau ni base — un contrat distinct de
  `enrichissement-referentiel`.

Aucune suppression n'est donc recommandée à ce jour. La suite est rapide une
fois le stall corrigé ; le coût de ces gardes est négligeable face à leur
valeur.

## Les étages CI

| Événement | Ce qui tourne | Durée attendue |
|---|---|---|
| **PR** | `changes` → `contracts` (typechecks, contrats) + `api-smoke` (tests affectés, 2 workers, 2 bases) → `verify` | ~1 min ; ~30 s pour une PR sans test affecté |
| **PR CI-only** | mêmes étages, mais `api-smoke` lance un canari de six tests (pool, routes, ingestion, rapports) | ~30–45 s |
| **Merge queue** | tout : matrix 8 shards, web, e2e, SDK, provenance, socle, supply-chain | ~2–3 min par lot |
| **`main` (push)** | tout, shards séquentiels, collecte des durées | ~3–4 min |
| **Nightly** | tout + tests d'objectifs | idem |

Le label `full-ci` sur une PR force les 408 fichiers dans `api-smoke`. Les
chemins critiques (schéma, serveur, auth, helpers) forcent aussi la suite
complète. Seuls les diffs limités à `.github/workflows/` et `.github/actions/`
utilisent le canari ; la merge queue reste la porte de validation complète.

### Merge queue configurée

La règle GitHub `main-protection` exige le check `verify` et impose la merge
queue. Paramètres : `ALLGREEN`, 2 constructions simultanées, 4 PR maximum par
lot, squash, attente de groupe nulle. Chaque PR paie donc le smoke ; la suite
complète est payée une fois par lot au moment de merger.

### Marches suivantes possibles

1. **Router `api-smoke` et `contracts` sur `instabox-medium`** : store pnpm
   chaud, installation ~5 s au lieu de ~25 s — la PR descend vers ~30–40 s.
   À valider après une semaine de canari du shard 1.
2. **Descendre `contracts` dans la queue** : le typecheck sortirait du chemin
   critique de la PR (il reste bloquant au merge). La merge queue est active ;
   ce changement reste à mesurer avant d'être appliqué.
3. `PGlite` pour le smoke : supprimerait le service PostgreSQL des jobs de
   test (~10 s par job), à l'étude — les tests passent par de vraies
   migrations `psql` et des features Postgres réelles.
