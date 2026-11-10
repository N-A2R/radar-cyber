# Radar Cyber Nouvelle-Aquitaine

Observatoire régional de cybermenaces : collecte passive de sources OSINT/CTI,
normalisation, et visualisation cartographique 3D.

## État

| Métrique | Valeur |
|---|---|
| Sources déclarées | 150 |
| Sources en succès | 133 |
| Indicateurs collectés | 5,5 M |
| Événements | ~4 000 |
| Organisations suivies | 111 (12 départements) |

## Démarrage

```bash
pnpm install
pnpm tsx db/dev-pg.ts                                    # PostgreSQL embarqué (5432)
psql postgres://radar:radar@localhost:5432/radar -f db/schema.sql
psql postgres://radar:radar@localhost:5432/radar -f db/sources.sql
psql postgres://radar:radar@localhost:5432/radar -f db/migrate-002.sql
ORGS_CSV=/home/jolt/tmp/orgs-na.csv pnpm tsx db/seed.ts # référentiel
pnpm -F @radar/api start                                 # API + collecteurs
pnpm -F @radar/web dev                                   # http://localhost:5173
```

Mode démonstration (données simulées, sans appel API) :

```bash
VITE_DATA_MODE=mock pnpm -F @radar/web build
pnpm -F @radar/web exec vite preview --port 5175
```

## Architecture

```
sources (150)  →  collecteurs  →  PostgreSQL  →  API Fastify  →  React + MapLibre
                     │              │              │
              indicateurs     events/orgs      SSE temps réel
              (5,5 M)         (4 000)
```

- `apps/api/src/collectors/generic.ts` — moteur générique : tout flux déclaré dans la table
  `source` est collecté, parsé (RSS/JSON/texte), dédupliqué et stocké.
- `apps/api/src/collectors/*.collector.ts` — collecteurs dédiés (CERT-FR, CISA KEV, EPSS,
  RansomLook, Hermes).
- `apps/web/src/map/Map3D.tsx` — carte MapLibre GL JS 6, terrain, couches GeoJSON.
- `apps/web/src/maplibre-worker.ts` — obligatoire : MapLibre GL 6 + bundler requiert
  `setWorkerUrl()`.

## API

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/api/health` | état et sources |
| GET | `/api/stats` | compteurs, répartitions |
| GET | `/api/orgs` | organisations + nombre d'événements |
| GET | `/api/orgs/:slug` | détail + 50 derniers événements |
| GET | `/api/events?limit=&family=&orgId=&from=` | événements (tri `observed_at DESC NULLS LAST`) |
| GET | `/api/graph?days=` | nœuds et liens du graphe |
| GET | `/api/sources` | état détaillé des 150 flux |
| GET | `/api/stream` | SSE — pousse chaque nouvel événement |

## Contrôles

```bash
psql postgres://radar:radar@localhost:5432/radar -f db/checks.sql
BASE_URL=http://localhost:8080 DATABASE_URL=… bash scripts/smoke.sh
```

## Intégration Hermes

La box `hermes` héberge l'infrastructure de bots. Un profil `radar-cyber` y est configuré
(SOUL, skill de veille, cron quotidien 06:00 UTC). Le collecteur `hermes.collector.ts`
rapatrie les briefings via le tunnel SSH instabox.

## Limites connues

- Rétention par défaut non appliquée (90 jours en projet, non codé).
- Les flux narratifs sans date sont triés en fin de fil.
- Certains flux communautaires renvoient 429/403 (PhishTank, dan.me.uk).
- Aucune authentification (réseau Campus uniquement).
