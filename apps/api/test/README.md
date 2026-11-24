# Tests API — isolation base de données

La suite ne touche **jamais** la base de production `radar`.

- `test/run.ts` crée une base `radar_test_<pid>_<horodatage>` via
  `RADAR_TEST_ADMIN_URL`, ou à défaut via `DATABASE_URL` (aucun mot de passe
  implicite), y applique `db/init.sql`, les migrations `db/migrate-*.sql`,
  `db/detection-rules.sql`, puis un jeu de données minimal explicite.
- Il injecte `DATABASE_URL` vers cette base dans le processus `tsx --test`
  (fichiers exécutés séquentiellement), puis la supprime (`DROP DATABASE`) même en cas
  d'échec ou de Ctrl-C. Les bases orphelines d'un processus mort sont purgées au départ.
- Un test qui a besoin de données réelles insère ses propres lignes et les supprime.
Lancer tout : `pnpm -F @radar/api test`
Lancer un fichier : `pnpm -F @radar/api test -- test/http.test.ts`
Couverture : `pnpm -F @radar/api test:coverage`

Sur un poste dont les identifiants ont été rotatés :

```bash
set -a; source ~/.config/radar-cyber/api-security.env; set +a
RADAR_TEST_ADMIN_URL="$RADAR_MIGRATE_DATABASE_URL" pnpm -F @radar/api test
```
