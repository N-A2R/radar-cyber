# Radar Cyber Nouvelle-Aquitaine

Observatoire régional de cybermenaces : collecte passive de sources OSINT/CTI, normalisation et visualisation.

## État mesuré (2026-11-24)

Mesures exécutées en lecture seule sur la base live `localhost:5433/radar` le 2026-11-24.

| Métrique | Valeur mesurée | Requête de vérification |
|---|---:|---|
| Sources déclarées | 3 140 | `SELECT count(*) FROM source;` |
| Sources activées (`enabled`) | 3 038 | `SELECT count(*) FROM source WHERE enabled;` |
| **Sources productives** (au moins un événement) | **141** | `SELECT count(DISTINCT source_id) FROM event;` |
| Événements | 27 218 | `SELECT count(*) FROM event;` |
| Événements rattachés à une organisation | 250 | `SELECT count(*) FROM event WHERE org_id IS NOT NULL;` |
| Organisations au référentiel | 1 673 270 | `SELECT count(*) FROM org;` |
| Organisations avec au moins un événement | 83 | `SELECT count(DISTINCT org_id) FROM event WHERE org_id IS NOT NULL;` |
| Organisations géocodées | 1 671 918 | `SELECT count(*) FROM org WHERE lat IS NOT NULL AND lon IS NOT NULL;` |
| Événements avec coordonnées | 12 569 | `SELECT count(*) FROM event WHERE lat IS NOT NULL AND lon IS NOT NULL;` |
| Indicateurs collectés | 2 051 | `SELECT count(*) FROM indicator;` |
| Scores EPSS en base | 410 485 | `SELECT count(*) FROM epss;` |
| Alertes en base | 1 652 | `SELECT count(*) FROM alert;` |
| Lignes de quarantaine | 17 362 | `SELECT count(*) FROM quarantine_raw;` |
| Certificats d'ignorance | 11 798 512 | `SELECT count(*) FROM org_unknown;` |
| Sources `.onion` déclarées / activées / productives | 77 / 9 / 8 | `source` + `event.source_id` |

**La métrique qui compte est « sources productives », pas « sources actives ».** Une source peut répondre en 200 et ne rien produire.

Répartition des événements par famille (mesurée le 2026-11-24) : `vuln` 23 543, `cti` 1 614, `ransomware` 919, `leaks` 577, `cert_fr` 296, `cert` 193, `ambient` 30, `presse` 15, `official_statement` 14, `presse_cyber` 10, `paste` 7.

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

Ports : API 8080 (`RADAR_API_PORT`), web 5173 en développement/systemd et
4173 en Compose (`RADAR_WEB_PORT`), PostgreSQL 5433 sur l'hôte / 5432 dans le
conteneur, Tor SOCKS5 9050 (réseau interne Compose uniquement).

En déploiement (`scripts/deploy/install.sh`, `docker-compose.yml`), la valeur
visée est **`RADAR_COLLECT=1`** : la collecte continue fait partie de la
production. `RADAR_COLLECT=0` (ou `--no-collect`) reste réservé aux vérifications
et aux environnements sans sortie réseau ; contrôle :
`grep RADAR_COLLECT /etc/radar-cyber/radar.env` sur une installation système.

`pnpm setup` applique le schéma, les migrations, les 18 catalogues de sources,
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
WEB_HOST=127.0.0.1 WEB_PORT=5175 node apps/web/serve.mjs
```

## Architecture (références vérifiées)

```
sources → collecteurs → PostgreSQL → API Fastify → front React
```

- `apps/api/src/collectors/generic.ts` — moteur générique (flux déclarés dans la table `source`).
- `apps/api/src/collectors/*.collector.ts` — collecteurs dédiés (ex. CERT-FR, CISA KEV, EPSS, RansomLook, Hermes).
- `apps/web/src/map/Map3D.tsx` — carte MapLibre GL JS.
- `apps/web/src/maplibre-worker.ts` — `setWorkerUrl()` pour MapLibre GL + bundler.
- `apps/web/src/App.tsx` et `apps/web/src/components/{Map,Action,Sources,Journal}Workspace.tsx` — coque Stone à quatre destinations : **Carte**, **Action**, **Sources**, **Journal** (`#/<destination>`) ; les anciens hashs sont réécrits vers le bon panneau/onglet sans perdre les filtres.
- `apps/web/serve.mjs` — serveur de fichiers statiques sans dépendance, avec proxy `/api` (runtime des unités systemd et de Compose).

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

`pnpm verify` (`bash scripts/verify-all.sh`) enchaîne contrat hors base,
diagnostic du socle, typechecks, suites API/web/SDK/Python/migrations, build et
healthcheck. Le lot de réparation `migrate-231` … `migrate-246` est appliqué par
`pnpm migrate` et contrôlé par `pnpm test:migrations` ; aucune migration
déjà enregistrée dans `schema_migrations` n'est rejouée à la main. Le contrat
d'événement est appliqué aux cinq chemins d'écriture : [docs/contrat.md](docs/contrat.md).

```bash
pnpm verify
pnpm setup:check                 # socle complet, sans écriture
pnpm test:migrations             # dont REPAIR_VERSIONS 231-246
API_URL=http://127.0.0.1:8080 WEB_URL=http://127.0.0.1:5173 \
  scripts/healthcheck.sh
psql "postgres://radar:CHANGE_ME@localhost:5433/radar" -f db/checks.sql
BASE_URL=http://localhost:8080 \
  DATABASE_URL="postgres://radar:CHANGE_ME@localhost:5433/radar" \
  bash scripts/smoke.sh
```

> `db/checks.sql` et `scripts/smoke.sh` existent ; `bash -n scripts/smoke.sh` OK. Le mot de passe n'est jamais versionné : il vient de `DATABASE_URL` / d'un fichier d'environnement protégé.

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

En production, le rôle PostgreSQL applicatif est dédié et non superutilisateur
(`radar` / `radar_app`) ; les migrations passent par une URL d'administration
distincte (`RADAR_MIGRATE_DATABASE_URL` dans les unités utilisateur) et la
rétention du journal des accès passe par `radar_retention` (`NOLOGIN`, migrations
239/244). Les mots de passe sont stockés en **SCRAM-SHA-256** (`md5` refusé) :

```bash
psql "$RADAR_MIGRATE_DATABASE_URL" -c "SHOW password_encryption;"  # scram-sha-256
psql "$RADAR_MIGRATE_DATABASE_URL" -c \
  "SELECT rolname, left(rolpassword, 14) AS algo FROM pg_authid
    WHERE rolname IN ('radar', 'radar_app') AND rolpassword IS NOT NULL;"
```

Sauvegardes : `~/.local/share/radar-cyber/backups/` sur le poste de veille,
`/var/lib/radar-cyber/backups/` sur une installation système, copie chiffrée
hors site dans `/data/home/backups/radar` (`compute-3`). Voir
[`docs/operations.md`](docs/operations.md) pour le tunnel SSH vers la base de
`compute-2` (5433) et la preuve de restauration.

## Limites et constats mesurés (2026-11-24)

- Authentification par session en base (scrypt) et clés API à portée/quota.
- Diffusion externe des alertes disponible via webhook signé, Telegram, SMTP et RSS; elle doit être explicitement configurée.
- Pertinence narrative basée sur mots-clés/matching d'entités (pas de NER complet, cf. docs).
- Déduplication sémantique et déduplication de republication partielles; les corpus volumineux restent un chantier.
- Quarantaine implémentée (`quarantine_raw`, 17 362 lignes au 2026-11-24); revue/promotion via scripts/API.
- Géocodage présent: 1 671 918 organisations et 12 569 événements géocodés au 2026-11-24.
- Filtre d'actionnabilité présent dans `apps/api/src/collectors/filter.ts`.
- Couverture `.onion`: 77 sources déclarées, 9 activées, 8 productives au 2026-11-24.
