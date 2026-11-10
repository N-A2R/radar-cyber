# Radar Cyber Nouvelle-Aquitaine

Observatoire régional de cybermenaces : collecte passive de sources OSINT/CTI,
normalisation, et visualisation cartographique 3D.

## État

| Métrique | Valeur |
|---|---|
| Sources déclarées | 304 |
| Sources en succès | 256 |
| Indicateurs collectés | 5,6 M |
| Événements | 7 600+ |
| dont presse / institutions régionales | 2 034 |
| Organisations suivies | 392 (12 départements) |
| Flux régionaux productifs | 74 |

## Points d'ingénierie

**Clé de déduplication.** `hashKey()` hachait l'URL en base64url avant de tronquer
à 24 caractères, soit 18 octets d'entrée. Tous les liens partageant ce préfixe
produisaient la même clé : sur `https://www.ici.fr` (exactement 18 octets), les
20 articles d'un flux s'effondraient en un seul événement. La correction passe
par SHA-256 avant troncature. Mesure de l'effet : 84 → 2 034 événements régionaux.

**Comptage des indicateurs.** `count(*)` sur 5,6 M de lignes coûtait 14 s par
requête et saturait l'API (122 s de latence observée). `/api/stats` lit désormais
l'estimation du catalogue (`pg_class.reltuples`) et sert un cache de 20 s :
0,05 s au lieu de 122 s.

**Verrou de suggestion.** Le collecteur saute une source dont `last_ok_at` est
plus récent que 0,8 × `interval_sec`. Après une réinitialisation de curseur, il
faut aussi remettre `last_ok_at` à NULL, sinon aucune réingestion n'a lieu.

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

- Aucune authentification : usage interne, à exposer derrière le tailnet uniquement.
- La pertinence des flux narratives repose sur un gazetier de mots-clés et le matching
  d'entités (pas de NER pour l'instant — voir `docs/research/enrichment.md`).
- Pas de déduplication de republication (MinHash/LSH non intégré).
- Sévérité des vulnérabilités limitée au CVSS v3.1 et au statut KEV ; pas d'exploitabilité
  (PoC publics) pour le moment.
- La quarantaine des revendications dark web est implémentée : table `quarantine_raw`
  (16 172 lignes), branchement dans `server.ts`, idempotent. Revue via
  `npx tsx scripts/quarantine-review.mts pending`. TLP RED, purge 30 j.
- Le géocodage des organisations est fait (`db/migrate-008-geo.sql`,
  `scripts/geocode-orgs.mts`) : 392/392 orgs géocodées, 21 events avec lat/lng.
- Le filtre d'actionnabilité est implémenté dans `apps/api/src/collectors/filter.ts`
  (`loadActiveIndex`, `loadKnownCves`, `isActionableIndicator`).
