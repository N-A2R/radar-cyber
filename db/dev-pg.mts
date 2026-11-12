/**
 * PostgreSQL embarqué pour le développement et la démonstration.
 *
 * Extension `.mts` et non `.ts` : le `package.json` racine n'a pas
 * `"type": "module"`, donc tsx compilait ce fichier en CJS et esbuild refusait
 * le top-level await. Le fichier n'était référencé nulle part, si bien que
 * personne n'avait eu à le lancer. Voir docs/socle.md.
 *
 *   pnpm db:up
 *   PGDATA=./pgdata-demo PGPORT=5433 pnpm db:up
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dir = process.env.PGDATA ?? "./pgdata";
const port = Number(process.env.PGPORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "radar",
  password: "radar",
  port,
  persistent: true,
});

if (!existsSync(dir + "/PG_VERSION")) {
  console.log("initialisation du cluster…");
  await pg.initialise();
}
await pg.start();

try {
  await pg.createDatabase("radar");
  console.log("base 'radar' créée");
} catch {
  console.log("base 'radar' déjà présente");
}

// Le port affiché doit être celui qui écoute : il était écrit en dur, ce qui
// induisait en erreur dès qu'on passait PGPORT.
console.log(`PostgreSQL prêt sur ${port} (db=radar user=radar, données=${dir})`);
console.log(`DATABASE_URL=postgres://radar:radar@localhost:${port}/radar`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
