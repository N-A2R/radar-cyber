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

console.log(`PostgreSQL prêt sur 5432 (db=radar user=radar) — port=${port}`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
