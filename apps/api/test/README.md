# Tests API — isolation base de données

La suite ne touche **jamais** la base de production `radar`.

- `test/run.ts` crée une base `radar_test_<pid>_<horodatage>` via `RADAR_TEST_ADMIN_URL`
  (défaut : `postgres://radar:radar@localhost:5432/postgres`), y applique `db/init.sql`,
  les migrations `db/migrate-*.sql`, `db/detection-rules.sql`, puis un jeu de données
  minimal explicite (source `ransomlook`, une organisation, une alerte de référence).
- Il injecte `DATABASE_URL` vers cette base dans le processus `tsx --test`
  (fichiers exécutés séquentiellement), puis la supprime (`DROP DATABASE`) même en cas
  d'échec ou de Ctrl-C. Les bases orphelines d'un processus mort sont purgées au départ.
- Un test qui a besoin de données réelles insère ses propres lignes et les supprime.
Lancer tout : `pnpm -F @radar/api test`
Lancer un fichier : `pnpm -F @radar/api test -- test/http.test.ts`
Couverture : `pnpm -F @radar/api test:coverage`
