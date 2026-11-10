# Radar Cyber Nouvelle-Aquitaine

Observatoire régional de cybermenaces : collecte passive de sources OSINT/CTI, normalisation et visualisation.

## État mesuré (2026-11-10)

Mesures exécutées en lecture seule sur la base live `postgres://radar:radar@localhost:5432/radar` le 2026-11-10.

| Métrique | Valeur mesurée | Requête de vérification |
|---|---:|---|
| Sources déclarées | 560 | `SELECT count(*) FROM source;` |
| Sources activées (`enabled`) | 512 | `SELECT count(*) FROM source WHERE enabled;` |
| Sources avec dernier succès connu (`last_ok_at` ≥ `last_error_at` ou sans erreur) | 522 | `SELECT count(*) FROM source WHERE last_ok_at IS NOT NULL AND (last_error_at IS NULL OR last_ok_at >= last_error_at);` |
| Événements | 2 021 | `SELECT count(*) FROM event;` |
| Événements rattachés à une organisation (`org_id` non nul) | 530 | `SELECT count(*) FROM event WHERE org_id IS NOT NULL;` |
| Organisations au référentiel | 10 261 | `SELECT count(*) FROM org;` |
| Organisations avec au moins un événement | 71 | `SELECT count(DISTINCT org_id) FROM event WHERE org_id IS NOT NULL;` |
| Organisations géocodées (`lat`/`lon` renseignés) | 444 | `SELECT count(*) FROM org WHERE lat IS NOT NULL AND lon IS NOT NULL;` |
| Événements avec coordonnées | 12 | `SELECT count(*) FROM event WHERE lat IS NOT NULL AND lon IS NOT NULL;` |
| Indicateurs collectés | 28 256 | `SELECT count(*) FROM indicator;` |
| Scores EPSS en base | 402 773 | `SELECT count(*) FROM epss;` |
| Scores EPSS > 0,30 | 7 163 | `SELECT count(*) FROM epss WHERE score > 0.30;` |
| Alertes en base | 4 546 | `SELECT count(*) FROM alert;` |
| Lignes en quarantaine (`quarantine_raw`) | 16 190 | `SELECT count(*) FROM quarantine_raw;` |
| Sources `.onion` (déclarées / activées / dernier succès connu) | 77 / 77 / 77 | `SELECT count(*) AS total, count(*) FILTER (WHERE enabled) AS enabled, count(*) FILTER (WHERE last_ok_at IS NOT NULL AND (last_error_at IS NULL OR last_ok_at >= last_error_at)) AS ok FROM source WHERE url LIKE '%.onion%' OR id LIKE '%onion%';` |
| Événements issus de sources `.onion` | 38 | `SELECT count(*) FROM event e JOIN source s ON s.id = e.source_id WHERE s.url LIKE '%.onion%' OR s.id LIKE '%onion%';` |
| Sources `.onion` sans événement | 64 | `SELECT count(*) FROM source s WHERE (s.url LIKE '%.onion%' OR s.id LIKE '%onion%') AND NOT EXISTS (SELECT 1 FROM event e WHERE e.source_id = s.id);` |

Répartition des événements par famille (mesurée le 2026-11-10) : `cti` 747, `vuln` 665, `ransomware` 276, `cert_fr` 239, `cert` 76, `leaks` 18. La table `event` ne contient pas de colonne `is_press`.

## Démarrage (fichiers/commandes vérifiés présents le 2026-11-10)

```bash
pnpm install
./apps/api/node_modules/.bin/tsx db/dev-pg.ts                                    # PostgreSQL embarqué (5432)
psql postgres://radar:radar@localhost:5432/radar -f db/schema.sql
psql postgres://radar:radar@localhost:5432/radar -f db/sources.sql
psql postgres://radar:radar@localhost:5432/radar -f db/migrate-002.sql
ORGS_CSV=/home/jolt/tmp/orgs-na.csv ./apps/api/node_modules/.bin/tsx db/seed.ts # référentiel
pnpm -F @radar/api start                                                         # API + collecteurs
pnpm -F @radar/web dev                                                           # http://localhost:5173
```

> Vérifié le 2026-11-10 : `pnpm` 12.15.0 et `./apps/api/node_modules/.bin/tsx` présents ; les fichiers/scripts cités ci-dessus existent. `pnpm tsx ...` à la racine n'est pas disponible dans cet arbre (tsx installé dans `apps/api`).

Mode démonstration (données simulées, sans appel API) :

```bash
VITE_DATA_MODE=mock pnpm -F @radar/web build
pnpm -F @radar/web exec vite preview --port 5175
```

## Architecture (références vérifiées)

```
sources → collecteurs → PostgreSQL → API Fastify → front React
```

- `apps/api/src/collectors/generic.ts` — moteur générique (flux déclarés dans la table `source`).
- `apps/api/src/collectors/*.collector.ts` — collecteurs dédiés (ex. CERT-FR, CISA KEV, EPSS, RansomLook, Hermes).
- `apps/web/src/map/Map3D.tsx` — carte MapLibre GL JS.
- `apps/web/src/maplibre-worker.ts` — `setWorkerUrl()` pour MapLibre GL + bundler.

## API

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/api/health` | état et sources |
| GET | `/api/stats` | compteurs, répartitions |
| GET | `/api/orgs` | organisations + nombre d'événements |
| GET | `/api/orgs/:slug` | détail + 50 derniers événements |
| GET | `/api/events?limit=&family=&orgId=&from=` | événements (tri `observed_at DESC NULLS LAST`) |
| GET | `/api/graph?days=` | nœuds et liens du graphe |
| GET | `/api/sources` | état détaillé des flux |
| GET | `/api/stream` | SSE — pousse chaque nouvel événement |

## Contrôles (vérifiés le 2026-11-10)

```bash
psql postgres://radar:radar@localhost:5432/radar -f db/checks.sql
BASE_URL=http://localhost:8080 DATABASE_URL=postgres://radar:radar@localhost:5432/radar bash scripts/smoke.sh
```

> `db/checks.sql` et `scripts/smoke.sh` existent ; `bash -n scripts/smoke.sh` OK ; `db/checks.sql` exécuté avec succès sur la base live le 2026-11-10.

Scripts de mesure/revue (fichiers présents) :

```bash
./apps/api/node_modules/.bin/tsx scripts/reconcile-orgs.mts                # dry-run rattachements texte
./apps/api/node_modules/.bin/tsx scripts/quarantine-review.mts pending     # usage: pending|promote <id>|reject <id>|purge
./apps/api/node_modules/.bin/tsx scripts/geocode-orgs.mts --dry-run --limit=30
```

> Mesures/exécutions 2026-11-10 : `reconcile-orgs.mts` (dry-run) — 530 examinés, 2 confirmés par le texte, 522 non justifiés, 6 vers une autre organisation. `quarantine-review.mts` affiche l'usage en l'absence d'arguments valides mais son exécution directe échoue dans cet environnement sur `import 'pg'` (`ERR_MODULE_NOT_FOUND`) ; le fichier existe.

## Modèle de décision

Modèle de décision typé (`mercury-decide`) utilisé pour la portée régionale (`apps/api/src/detect/scope.ts`) et l'arbitrage de rattachements (`apps/api/src/match/decide.ts`). Voir [`docs/decision-model.md`](docs/decision-model.md).

## Limites et constats mesurés (2026-11-10)

- Authentification par jeton de session en base (scrypt) ; usage interne.
- Aucune diffusion externe d'alertes détectée dans `apps/api/src` (recherche texte `telegram`/`smtp`/`webhook` sans résultat) alors que la table `alert` contient 4 546 lignes.
- Pertinence narrative basée sur mots-clés/matching d'entités (pas de NER complet, cf. docs).
- Pas de déduplication de republication (MinHash/LSH non intégré).
- Quarantaine implémentée (`quarantine_raw`, 16 190 lignes le 2026-11-10) ; revue/promotion via scripts/API selon contexte.
- Géocodage présent (`db/migrate-008-geo.sql`, `scripts/geocode-orgs.mts`) : 444 organisations et 12 événements géocodés le 2026-11-10.
- Filtre d'actionnabilité présent dans `apps/api/src/collectors/filter.ts`.
- Couverture `.onion` (2026-11-10) : 77 sources déclarées/activées avec dernier succès connu, 38 événements au total, 64 sources sans événement ; aucune ligne `.onion` identifiée dans `quarantine_raw` (`source`/`source_url`).
