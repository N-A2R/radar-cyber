# Défauts UI mesurés — worktree `fix/ui-defauts`

Base de mesure : PostgreSQL local `localhost:5433` (1 673 151 organisations), API
démarrée depuis ce worktree avec `DATABASE_URL=postgres://radar:radar@localhost:5433/radar`.

## 1. `GET /api/today/departements` renvoyait 404

- **Consommateur** : `apps/web/src/components/TodayView.tsx:95` et `:104` (filtre
  départements du fil « Aujourd'hui »). Type `DeptStat = { dept, evenements,
  organisations }` et appel dans `apps/web/src/api.ts:298`, `:301`, `:851`.
- **Constat** : le 404 a été mesuré sur un serveur qui exécutait une version
  antérieure du code. Sur `origin/main` (commit `6a87597`), la route existe déjà
  dans `apps/api/src/routes/stats-departements.ts:26`, avec exactement la forme
  attendue `{ departements: [{ dept, evenements, organisations }] }`, et elle est
  enregistrée dans `apps/api/src/server.ts:124`. Un test de non-collision existe
  dans `apps/api/test/stats-departements.test.ts:181`.
- **Vérification ici** : `GET /api/today/departements` → **HTTP 200 en 16 ms**
  ({`75`: 7 événements, `92`: 5, …}). La suite API inclut 644 tests verts, dont
  celui qui vérifie explicitement la coexistence des deux routes départements.
- **Décision : documenté, aucun code ajouté.** L'alias demandé ne doit pas être
  celui de `apps/api/src/routes/stats.ts:120` : sa réponse 7 jours utilise
  `departement` / `evenements7j` / `sourcesActives` (`:175`) et casserait
  `TodayView`. Enregistrer deux fois le même chemin ferait échouer le démarrage
  avec `FST_ERR_DUPLICATED_ROUTE` (voir l'avertissement dans
  `stats-departements.ts:13-16`). Le bon alias, dédié au fil 24 h, est déjà en
  place ; le déploiement doit simplement exécuter une version ≥ `6a87597`.

## 2. `GET /api/orgs` mettait 30 s (carte et graphe inutilisables)

- **Fichier** : `apps/api/src/routes/orgs.ts`, ancien gestionnaire aux lignes
  99-132 : `SELECT` des 1 673 151 organisations, `LEFT JOIN event`, `GROUP BY` et
  `ORDER BY name` sur toute la table, sans limite ni index de tri.
- **Mesures avant** :
  - `GET /api/orgs` : **18 848 ms**, 1 673 151 objets JSON, **395 976 800 octets**
    (~396 Mo) transférés pour un seul appel.
  - `EXPLAIN ANALYZE` de la requête d'origine : **6 317 ms**, `GroupAggregate`
    sur 1,67 M lignes et tri externe sur disque de 208 Mo.
- **Correctif** :
  - `apps/api/src/routes/orgs.ts:123-171` : `limit` (défaut **500**, max
    **2000**, valeurs hors bornes ramenées à la borne), `offset`, tri `(name,
    id)` sur la page avant le comptage des événements de ses seules lignes
    (`event_org_idx`). En-têtes `X-Total-Count`, `X-Limit`, `X-Offset`. La forme
    JSON reste un tableau d'organisations : contrat
    `apps/api/test/contrat-routes.test.ts:150` et client
    `apps/web/src/api.ts:799` inchangés. Le chemin bitemporel `asOf` est paginé
    de la même façon.
  - `db/migrate-048-orgs-list-indexes.sql:21,23` : `org_name_id_idx` sur
    `org (name, id)` et `org_history_name_id_idx` sur `org_history (name, id)`.
    Index `IF NOT EXISTS`, rejouables, sans modification de données.
- **Mesures après** :
  - `GET /api/orgs` (défaut) : **56 ms** à chaud (**211 ms** sur la branche
    finale après fusion de `origin/main` et vidage des caches), 500 objets,
    121 587 octets, `X-Total-Count: 1673151`, `X-Limit: 500`, `X-Offset: 0`.
  - `GET /api/orgs?limit=2000&offset=1000` : **42 ms**, 459 041 octets.
  - `EXPLAIN ANALYZE` de la requête paginée : **8,97 ms** (`Index Scan` sur
    `org_name_id_idx`, puis `Index Only Scan` sur `event_org_idx` pour 500
    lignes). Le comptage séparé du total (~95 ms à froid) reste sous le seuil.
- **Objectif < 500 ms pour 500 lignes : atteint** (56 à 211 ms bout en bout,
  soit 89× à 336× plus rapide que les 18 848 ms mesurés avant).

## 3. Écrans `carte`, `graphe`, `revue` vides

- **Fichiers** : `apps/web/src/App.tsx:284` (`api.orgs()` au chargement),
  `apps/web/src/components/TodayView.tsx:95-104` (filtre départements),
  `apps/web/src/api.ts:799` et `:851` (appels HTTP).
- **Cause** : les deux défauts ci-dessus : le fil départements tombait sur un
  404 sur le serveur obsolète, et `api.orgs()` attendait 18 s puis devait
  désérialiser 396 Mo avant de pouvoir alimenter la carte, le graphe et la
  revue. Aucun correctif d'affichage spécifique n'était nécessaire.
- **État : corrigé à la source** par les points 1 et 2. Le rendu visuel des
  trois écrans n'a pas été rejoué dans le navigateur dans ce worktree (aucun
  `dist` web construit) : seule la disponibilité des deux endpoints a été
  vérifiée.

## Vérifications

- `pnpm -r typecheck` : `apps/api` et `apps/web` OK.
- `cd apps/api && RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres' node_modules/.bin/tsx test/run.ts` :
  **648 tests, 648 pass, 0 fail**.
- Commits effectués dans le worktree isolé, sans push ni PR.
