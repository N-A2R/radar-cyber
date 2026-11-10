/**
 * Définit le mot de passe d'un compte existant.
 *
 *   printf 'motdepasse' | pnpm tsx scripts/set-password.mts --email dev@radar.local
 *
 * Le mot de passe n'est JAMAIS accepté en argument (il resterait dans
 * l'historique du shell et dans `ps`) : il est lu sur stdin, en une ligne.
 */
import { createRequire } from "node:module";
import { hashPassword } from "../apps/api/src/auth.js";

/** Surface minimale de `pg` utilisée ici. */
type PgPool = {
  query: (sql: string, params: unknown[]) => Promise<{ rowCount: number | null }>;
  end: () => Promise<void>;
};
type PgModule = { Pool: new (config: { connectionString: string }) => PgPool };

// `pg` est installé pour @radar/api : on le résout depuis ce paquet, le
// script vivant hors de son arborescence.
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Pool } = apiRequire("pg") as PgModule;

const MIN_LENGTH = 12;

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const value = process.argv[i + 1];
  return value && !value.startsWith("--") ? value : null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

const email = argValue("--email")?.trim().toLowerCase();
if (!email) {
  console.error("usage : set-password.mts --email <email>  (mot de passe sur stdin)");
  process.exit(2);
}

const password = await readStdin();
if (password.length < MIN_LENGTH) {
  console.error(`mot de passe refusé : ${MIN_LENGTH} caractères minimum`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar",
});

try {
  const hash = await hashPassword(password);
  const res = await pool.query(
    "UPDATE app_user SET password_hash = $1 WHERE email = $2",
    [hash, email],
  );
  const updated = res.rowCount ?? 0;
  if (updated === 0) {
    console.error("aucun compte pour cet email :", email);
    process.exitCode = 1;
  } else {
    console.log("mot de passe mis à jour pour", email);
  }
} finally {
  await pool.end();
}
