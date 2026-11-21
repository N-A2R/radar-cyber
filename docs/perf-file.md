# Perf — `GET /api/review/queue` (base 5433)

Mesure du 2026-11-21 sur la base `radar` de l'instance PostgreSQL publiée sur
`127.0.0.1:5433`, avec les lignes en attente réelles : 200 revendications
`kind='claim'`, `status='pending'`, `promoted=false` et `org_hint` non vide.
Réponse par défaut : `limit=50`, `page=0`, aucun filtre `bucket`/`q`.

## Protocole

- Harnais `apps/api/bench-review-queue.mts` (temporaire, supprimé après mesure)
  : vraie route Fastify `reviewRoute` montée sous `/api`, vraie base 5433 via
  `DATABASE_URL`, jeton de session éphémère créé puis supprimé autour de la
  série. Deux appels d'échauffe non comptés, puis **10 appels HTTP séquentiels**
  sur `http://127.0.0.1:<port>/api/review/queue` ; latence mesurée côté client,
  de l'envoi de la requête à la réception du corps complet.
- **Log des requêtes activé** dans le harnais : `pg.Pool.prototype.query` est
  instrumenté, chaque SELECT est écrit avec sa durée dans
  `apps/api/bench-review-queue-<phase>.sql.log`, un bloc par appel. Cela donne
  le nombre exact de requêtes SQL par appel et le temps passé dans chacune.
- Les deux séries utilisent le même `RADAR_PG_API_TIMEOUT_MS` (60 000 ms) et le
  même harnais. La base est partagée avec d'autres sessions pendant la mesure
  (chargement CPU mesuré jusqu'à ~37 de charge moyenne, pg_dump et grosses
  jointures concurrentes) : les valeurs absolues sont donc bruitées ; les temps
  par requête et le nombre de SQL par appel restent, eux, exacts.

## Résultats

À compléter après la deuxième série.

## Migration

À compléter.
