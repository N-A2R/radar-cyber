#!/usr/bin/env -S npx tsx
/**
 * Migration runner PostgreSQL (déterministe).
 *
 * - Applique `db/migrate-*.sql` triés lexicographiquement.
 * - Table de suivi : `schema_migrations (version text primary key, applied_at timestamptz default now())`.
 * - Amorçage : si la table est créée et vide, on y inscrit les migrations
 *   déjà présentes historiquement (SEED_APPLIED) pour ne pas les rejouer.
 * - Chaque migration s'applique dans une transaction et n'est enregistrée
 *   qu'après succès.
 *
 * Usage:
 *   npx tsx scripts/migrate.mts             # applique les migrations en attente
 *   npx tsx scripts/migrate.mts --dry-run   # liste sans rien modifier
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const DB_DIR = join(process.cwd(), "db");
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Migrations historiquement appliquées à la main (constatées en base).
 * Sert à amorcer `schema_migrations` au premier lancement pour éviter
 * tout rejeu. On conserve le nom de fichier tel qu'il existe dans db/.
 */
const SEED_APPLIED: string[] = [
  "migrate-002.sql",
  "migrate-003-dates.sql",
  "migrate-004-retention.sql",
  "migrate-005-relevance.sql",
  "migrate-006-search-index.sql",
  "migrate-007-quarantine.sql",
  "migrate-008-geo.sql",
  "migrate-009-auth.sql",
  "migrate-010-enrich.sql",
  "migrate-011-alerts.sql",
  "migrate-013-decode-entities.sql",
  "migrate-014a-org-alias.sql",
  "migrate-014b-tlp-scope.sql",
  "migrate-015-indicator-denylist.sql",
  "migrate-016-org-alias-fix.sql",
  "migrate-018-source-triage.sql",
  "migrate-019-press-scope.sql",
];

function listMigrations(): string[] {
  return readdirSync(DB_DIR)
    .filter((f) => /^migrate-.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const all = listMigrations();

    // Détecte si la table existe déjà et si elle est vide (pour l'amorçage).
    const tableRes = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`,
    );
    const tableExists = tableRes.rows[0]?.exists === true;

    let applied = new Set<string>();
    let needsSeed = false;
    if (tableExists) {
      const rows = await client.query<{ version: string }>(
        "SELECT version FROM schema_migrations",
      );
      applied = new Set(rows.rows.map((r) => r.version));
      needsSeed = applied.size === 0;
    } else {
      needsSeed = true;
    }

    const seedVersions = needsSeed ? SEED_APPLIED.filter((v) => all.includes(v)) : [];
    for (const v of seedVersions) applied.add(v);

    const pending = all.filter((v) => !applied.has(v));
    const already = all.filter((v) => applied.has(v));

    if (DRY_RUN) {
      console.log(`--dry-run: aucune modification.`);
      console.log(`Table schema_migrations: ${tableExists ? "présente" : "absente (serait créée)"}`);
      if (needsSeed && !tableExists) {
        console.log(`Amorçage prévu: ${seedVersions.length} migration(s) marquée(s) appliquée(s)`);
      } else if (needsSeed && tableExists) {
        console.log(`Amorçage prévu (table vide): ${seedVersions.length} migration(s)`);
      }
      console.log(`Déjà appliquées (${already.length}):`);
      for (const v of already) console.log(`  [applied] ${v}`);
      console.log(`En attente (${pending.length}):`);
      for (const v of pending) console.log(`  [pending] ${v}`);
      console.log(`Total: ${all.length}`);
      return;
    }

    await client.query("BEGIN");
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      if (needsSeed) {
        for (const v of seedVersions) {
          await client.query(
            "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
            [v],
          );
        }
        if (seedVersions.length > 0) {
          console.log(`Amorçage: ${seedVersions.length} migration(s) marquée(s) appliquée(s).`);
        }
      }

      for (const v of pending) {
        const sql = readFileSync(join(DB_DIR, v), "utf8");
        console.log(`Applying ${v}...`);
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [v]);
        console.log(`  OK ${v}`);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    if (pending.length === 0) {
      console.log("Aucune migration en attente.");
    } else {
      console.log(`Terminé: ${pending.length} migration(s) appliquée(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
