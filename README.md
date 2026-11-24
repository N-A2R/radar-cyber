# Radar Cyber Nouvelle-Aquitaine

Observatoire régional de cybermenaces : collecte passive de sources OSINT/CTI, normalisation et visualisation.

## État mesuré (2026-11-11)

Mesures exécutées en lecture seule sur la base live `postgres://radar:radar@localhost:5432/radar` le 2026-11-11.

| Métrique | Valeur mesurée | Requête de vérification |
|---|---:|---|
| Sources déclarées | 594 | `SELECT count(*) FROM source;` |
| Sources activées (`enabled`) | 544 | `SELECT count(*) FROM source WHERE enabled;` |
| Sources avec dernier succès connu | 552 | `SELECT count(*) FROM source WHERE last_ok_at IS NOT NULL AND (last_error_at IS NULL OR last_ok_at >= last_error_at);` |
| **Sources productives** (au moins un événement) | **160** | `SELECT count(DISTINCT source_id) FROM event;` |
| Sources en erreur | 7 | `SELECT count(*) FROM source WHERE enabled AND last_error IS NOT NULL;` |
| Événements | 3 456 | `SELECT count(*) FROM event;` |
| Événements rattachés à une organisation (`org_id` non nul) | 1 112 | `SELECT count(*) FROM event WHERE org_id IS NOT NULL;` |
| Organisations au référentiel | 10 261 | `SELECT count(*) FROM org;` |
| Organisations avec au moins un événement | 113 | `SELECT count(DISTINCT org_id) FROM event WHERE org_id IS NOT NULL;` |
| Organisations géocodées (`lat`/`lon` renseignés) | 444 | `SELECT count(*) FROM org WHERE lat IS NOT NULL AND lon IS NOT NULL;` |
| Événements avec coordonnées | 12 | `SELECT count(*) FROM event WHERE lat IS NOT NULL AND lon IS NOT NULL;` |
| Indicateurs collectés | 28 549 | `SELECT count(*) FROM indicator;` |
| Scores EPSS en base | 402 773 | `SELECT count(*) FROM epss;` |
| Scores EPSS > 0,30 | 7 163 | `SELECT count(*) FROM epss WHERE score > 0.30;` |
| Alertes en base | 4 546 | `SELECT count(*) FROM alert;` |
| Lignes en quarantaine (`quarantine_raw`) | 16 235 | `SELECT count(*) FROM quarantine_raw;` |
| Sources `.onion` déclarées / activées | 77 / 77 | `SELECT count(*) FROM source WHERE id LIKE 'onion:%';` |
| Sources `.onion` productives | **37** | `SELECT count(DISTINCT source_id) FROM event WHERE source_id LIKE 'onion:%';` |
| Pages `.onion` en quarantaine (HTML illisible) | 45 | `SELECT count(*) FROM quarantine_raw WHERE source LIKE 'onion:%';` |
| Événements issus de sources `.onion` | 664 | `SELECT count(*) FROM event WHERE source_id LIKE 'onion:%';` |

**La métrique qui compte est « sources productives », pas « sources actives ».**
Une source peut répondre en 200 et ne rien produire : sur 60 sources muettes
relancées, 1 913 items ont été rejetés comme presse régionale, 71 comme hors
sujet, et 4 seulement étaient de vraies pannes de parsing. Compter les sources
actives reviendrait à compter des portes ouvertes sur un couloir vide.
| Sources `.onion` sans événement | 64 | `SELECT count(*) FROM source s WHERE (s.url LIKE '%.onion%' OR s.id LIKE '%onion%') AND NOT EXISTS (SELECT 1 FROM event e WHERE e.source_id = s.id);` |

Répartition des événements par famille (mesurée le 2026-11-10) : `cti` 747, `vuln` 665, `ransomware` 276, `cert_fr` 239, `cert` 76, `leaks` 18. La table `event` ne contient pas de colonne `is_press`.

## Tableau de bord de couverture

Huit indicateurs sont calculés en SQL et relevés chaque nuit dans
`kpi_couverture_releve` (rétention glissante de 90 jours). La vue
`kpi_couverture` publie les relevés et, avant le premier passage, calcule les
huit valeurs à la volée :

```sql
SELECT * FROM kpi_couverture WHERE date_jour = CURRENT_DATE;
```

`enregistrer_kpi_couverture()` remplace le relevé du jour et purge les points
plus anciens que 90 jours ; l'API l'appelle au démarrage puis toutes les 24 h.
Le test `apps/api/test/kpi-couverture.test.ts` rejoue un corpus synthétique
figé de 1808 sources et 10261 organisations sans données personnelles.

## Démarrage

```bash
pnpm install --frozen-lockfile

pnpm db:up                                                  # terminal 1 — PostgreSQL embarqué
RADAR_ADMIN_PASSWORD='votre-mot-de-passe' pnpm setup         # terminal 2 — socle complet
pnpm dev:api                                                # terminal 2 — API + collecteurs
pnpm dev:web                                                # terminal 3 — http://localhost:5173
```

`pnpm setup` applique le schéma, les migrations, les 16 catalogues de sources,
les règles de détection, le référentiel NA (4 462 organisations) et l'échantillon
de revue. **Mesuré : 8/8 étapes en 4,3 s depuis une base vide, entièrement hors
réseau** — le jeu NA et les fixtures sont versionnés. Idempotent : un rejeu ne
duplique rien. `pnpm setup:check` diagnostique sans rien écrire.

Détail des étapes, variables et pannes corrigées : [docs/socle.md](docs/socle.md).

> L'ancienne procédure de ce README était inexacte : elle appelait
> `db/dev-pg.ts` (ne démarrait pas, renommé `.mts`), `psql` (absent du sandbox) et
> un CSV situé sur une machine personnelle. Elle est remplacée par le bootstrap.
> `pnpm tsx ...` à la racine n'est pas disponible : tsx est installé dans
> `apps/api`.

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
| GET | `/api/stats/departements` | organisations, événements 7 j et sources actives par département |
| GET | `/api/resale/listings` | annonces de revente détectées en Nouvelle-Aquitaine (compteurs agrégés, sans donnée de victime) |
| GET | `/api/couverture` | mesure du corpus canonique (20 incidents vérifiés) : taux, motifs, départements, types, évolution mensuelle, date et empreinte |
| GET | `/api/today/departements` | départements du fil 24 h (organisations, événements) |
| GET | `/api/orgs` | organisations + nombre d'événements |
| GET | `/api/orgs/:slug` | détail + 50 derniers événements |
| GET | `/api/events?limit=&family=&orgId=&from=` | événements (tri `observed_at DESC NULLS LAST`) |
| GET | `/api/history?from=&to=&org=` | événements brut + archivés sur 12 mois glissants de `valid_at`, agrégés par mois |
| GET | `/api/graph?days=` | nœuds et liens du graphe |
| GET | `/api/sources` | état détaillé des flux |
| GET | `/api/stream` | SSE — pousse chaque nouvel événement |
| GET | `/api/search/ask-fr?q=` | réponses françaises ancrées : chaque affirmation cite un identifiant d'événement, l'URL source et le run de collecte |


### API publique documentée

- `GET /api/docs` — Swagger UI ; `GET /api/openapi.json` — spec OpenAPI 3.1
  générée depuis les schémas Zod des routes. Les deux préfixes `/api` et
  `/api/v1` exposent les mêmes opérations ; la version est renvoyée dans
  l'en-tête `X-API-Version`.
- Lectures publiques limitées par adresse IP (120 req/min par défaut) ;
  écritures réservées à une session ou à une clé de portée `write`. Les clés
  se créent avec `POST /api/v1/keys` (session admin pour `write`), ne sont
  renvoyées qu'une fois en clair, et consomment un quota atomique par
  fenêtre de 60 s. Une clé à quota zéro répond `429 API_KEY_QUOTA_EXCEEDED`.
- Les réponses avec clé exposent le quota en cours (`RateLimit-Limit`,
  `RateLimit-Remaining`, `RateLimit-Reset`) et `Retry-After` sur les
  dépassements. Mesure reproductible : `pnpm mesure:quotas-cles`.
- Client TypeScript généré : `pnpm api:client` régénère
  `apps/api/src/openapi/client.generated.ts` depuis `OPERATIONS` ; aucun appel
  manuel n'est à écrire pour ajouter une route au client.

## Contrôles

`pnpm verify` enchaîne contrat hors base, diagnostic du socle, typechecks, tests
API, tests front, build et healthcheck. Le contrat d'événement est appliqué aux
cinq chemins d'écriture : [docs/contrat.md](docs/contrat.md).

```bash
psql postgres://radar:radar@localhost:5432/radar -f db/checks.sql
BASE_URL=http://localhost:8080 DATABASE_URL=postgres://radar:radar@localhost:5432/radar bash scripts/smoke.sh
```

> `db/checks.sql` et `scripts/smoke.sh` existent ; `bash -n scripts/smoke.sh` OK ; `db/checks.sql` exécuté avec succès sur la base live le 2026-11-10.

### Suite API en shards (opt-in)

`pnpm test` reste le mode sûr : une seule base jetable, `--test-concurrency=1`.
Pour réduire la durée sur une machine disposant de plusieurs connexions
PostgreSQL, le mode shardié répartit les fichiers de façon déterministe
(round-robin sur la liste triée) entre N workers, chacun avec sa propre base
jetable, puis agrège tous les verdicts :

```bash
pnpm -F @radar/api test:sharded -- --shards=4 --concurrency=2
pnpm -F @radar/api test:sharded -- --shards=2 --list-shards        # découpage sans exécution
pnpm -F @radar/api test:sharded -- --shards=2 test/auth.test.ts test/active-sources.test.ts
```

`--concurrency` borne le nombre de workers simultanés (défaut : `--shards`).
Chaque worker garde `--test-concurrency=1`, la garde anti-handle de 20 min et
supprime sa base dans un `finally` ; le contrôleur supprime aussi, par pid, les
bases qu'un worker tué aurait laissées. `--test-force-exit` et
`--test-concurrency` sont refusés. Voir `tsx test/run-sharded.ts --help`.


Scripts de mesure/revue (fichiers présents) :

```bash
./apps/api/node_modules/.bin/tsx scripts/reconcile-orgs.mts                # dry-run rattachements texte
./apps/api/node_modules/.bin/tsx scripts/quarantine-review.mts pending     # usage: pending|promote <id>|reject <id>|purge
./apps/api/node_modules/.bin/tsx scripts/geocode-orgs.mts --dry-run --limit=30
./apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts --rapport --limite=5000
./apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts --appliquer --champ=siren,geo   # écrit la provenance et les colonnes vides
```

> Mesures/exécutions 2026-11-10 : `reconcile-orgs.mts` (dry-run) — 530 examinés, 2 confirmés par le texte, 522 non justifiés, 6 vers une autre organisation. `quarantine-review.mts` affiche l'usage en l'absence d'arguments valides mais son exécution directe échoue dans cet environnement sur `import 'pg'` (`ERR_MODULE_NOT_FOUND`) ; le fichier existe.

## Modèle de décision

Modèle de décision typé (`mercury-decide`) utilisé pour la portée régionale (`apps/api/src/detect/scope.ts`) et l'arbitrage de rattachements (`apps/api/src/match/decide.ts`). Voir [`docs/decision-model.md`](docs/decision-model.md).

## Sécurité et conformité

Rôles appliqués route par route, journal des accès, limitation de débit,
en-têtes de sécurité et droit de réponse des organisations : voir
[`docs/conformite.md`](docs/conformite.md). Configuration dans `.env.example`
(notamment `RADAR_AUDIT_PEPPER`, obligatoire en production).

## Limites et constats mesurés (2026-11-10)

- Authentification par jeton de session en base (scrypt) ; usage interne.
- Aucune diffusion externe d'alertes détectée dans `apps/api/src` (recherche texte `telegram`/`smtp`/`webhook` sans résultat) alors que la table `alert` contient 4 546 lignes.
- Pertinence narrative basée sur mots-clés/matching d'entités (pas de NER complet, cf. docs).
- Pas de déduplication de republication (MinHash/LSH non intégré).
- Quarantaine implémentée (`quarantine_raw`, 16 190 lignes le 2026-11-10) ; revue/promotion via scripts/API selon contexte.
- Géocodage présent (`db/migrate-008-geo.sql`, `scripts/geocode-orgs.mts`) : 444 organisations et 12 événements géocodés le 2026-11-10.
- Filtre d'actionnabilité présent dans `apps/api/src/collectors/filter.ts`.
- Couverture `.onion` (2026-11-10) : 77 sources déclarées/activées avec dernier succès connu, 38 événements au total, 64 sources sans événement ; aucune ligne `.onion` identifiée dans `quarantine_raw` (`source`/`source_url`).
