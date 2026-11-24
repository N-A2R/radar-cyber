#!/usr/bin/env -S npx tsx
/**
 * Migration runner PostgreSQL (déterministe).
 *
 * - Applique `db/migrate-*.sql` dans l'ordre (`préfixe numérique`, `nom`),
 *   jamais par `localeCompare` brut (voir db/migration-order.mts).
 * - Table de suivi : `schema_migrations (version text primary key, applied_at timestamptz default now())`.
 * - Chaque migration tourne dans UNE transaction portée par le runner ; la
 *   version est insérée AVANT le commit. Les `BEGIN;`/`COMMIT;` écrits pour
 *   psql dans 127 fichiers sont retirés avant exécution (voir stripTransactionControl).
 *   Un crash ne peut donc plus laisser une migration appliquée non suivie.
 * - Les versions appliquées en production dont le SQL n'a jamais été versionné
 *   sont des tombstones (db/migration-order.mts) : aucun rejeu destructeur.
 *
 * Usage:
 *   DATABASE_URL=postgres://… npx tsx scripts/migrate.mts
 *   DATABASE_URL=postgres://… npx tsx scripts/migrate.mts --dry-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { listMigrations, REPAIR_VERSIONS, stripTransactionControl } from "../db/migration-order.mts";

// pnpm cloisonne les dépendances : `pg` est installé dans apps/api, pas à la
// racine. Sans ce require ciblé, le script échoue en ERR_MODULE_NOT_FOUND
// depuis la racine du dépôt (constaté au remontage du socle).
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL est obligatoire : refus de migrer une base implicite (port 5432 par défaut).");
  process.exit(1);
}
const DB_DIR = join(process.cwd(), "db");
const DRY_RUN = process.argv.includes("--dry-run");

/** Migrations historiquement appliquées à la main (base historique recognisable). */
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

/** Bases copiées après 225 dont l'historique a perdu ces trois versions. */
const SCORE_BASELINE_APPLIED = [
  "migrate-217-org-score.sql",
  "migrate-222-org-score-recyf.sql",
  "migrate-225-org-score-referentiel.sql",
];

/** Marqueurs du schéma final : permettent de reconnaître une base copiée dont
 * l'historique a été perdu, sans rejouer les migrations destructrices. */
const FINAL_SCHEMA_OBJECTS = [
  "public.org_alias",
  "public.quarantine_raw",
  "public.archive_event",
  "public.event_archive",
  "public.org_unknown",
  "public.negative_attestation",
  "public.campaign_precursor_eval",
  "public.eval_fdr",
  "public.enrich_job",
  "public.alert_load_daily",
];

async function main(): Promise<void> {
  // La cible est dite à voix haute, SANS identifiants : les journaux systemd
  // contenaient 12 lignes avec l'URL PostgreSQL complète (audit sécurité).
  const cible = (() => {
    const u = new URL(DATABASE_URL);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  })();
  console.log(`Cible : ${cible} (DATABASE_URL)`);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const all = listMigrations(DB_DIR);

    const tableRes = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`,
    );
    const tableExists = tableRes.rows[0]?.exists === true;

    let applied = new Set<string>();
    let trackingEmpty = false;
    if (tableExists) {
      const rows = await client.query<{ version: string }>(
        "SELECT version FROM schema_migrations",
      );
      applied = new Set(rows.rows.map((r) => r.version));
      trackingEmpty = applied.size === 0;
    }

    const objects = await client.query<{ name: string; present: boolean }>(
      `SELECT o.name, to_regclass(o.name) IS NOT NULL AS present
         FROM unnest($1::text[]) AS o(name)`,
      [FINAL_SCHEMA_OBJECTS],
    );
    const present = new Set(
      objects.rows.filter((r) => r.present).map((r) => r.name),
    );
    const isLegacy = present.has("public.org_alias") && present.has("public.quarantine_raw");
    const finalSchema = FINAL_SCHEMA_OBJECTS.every((name) => present.has(name));

    // Historique perdu sur une base déjà au schéma final : on adopte toutes
    // les versions ANTÉRIEURES AUX RÉPARATIONS, puis on joue les réparations.
    // Sans ce garde-fou, le runner rejouait des migrations destructrices
    // (DELETE/TRUNCATE) sur une copie dont la table de suivi était vide.
    let recovered = 0;
    if ((!tableExists || trackingEmpty) && finalSchema) {
      for (const v of all) {
        if (!REPAIR_VERSIONS.includes(v)) {
          applied.add(v);
          recovered += 1;
        }
      }
    }

    // Base historique partielle : amorçage conservatif (les 17 premières).
    const needsSeed = !finalSchema && (!tableExists || trackingEmpty) && isLegacy;
    const seedVersions = needsSeed ? SEED_APPLIED.filter((v) => all.includes(v)) : [];
    for (const v of seedVersions) applied.add(v);

    // Ancienne copie dont l'historique a perdu les trois versions org_score :
    // on ne les adopte que si la colonne ET la clé composite sont déjà là.
    const scoreSchema = await client.query<{ referentiel: boolean; composite_key: boolean }>(
      `SELECT
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'org_score'
              AND column_name = 'referentiel'
         ) AS referentiel,
         EXISTS (
           SELECT 1 FROM pg_constraint c
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.conrelid = to_regclass('public.org_score')
              AND c.contype = 'p' AND a.attname = 'referentiel'
         ) AS composite_key`,
    );
    const scoreBaseline = scoreSchema.rows[0]?.referentiel === true
      && scoreSchema.rows[0]?.composite_key === true;
    const baselineVersions = scoreBaseline
      ? SCORE_BASELINE_APPLIED.filter((v) => all.includes(v) && !applied.has(v))
      : [];
    for (const v of baselineVersions) applied.add(v);

    const pending = all.filter((v) => !applied.has(v));
    const already = all.filter((v) => applied.has(v));

    if (DRY_RUN) {
      console.log(`--dry-run: aucune modification.`);
      console.log(`Table schema_migrations: ${tableExists ? "présente" : "absente (serait créée)"}`);
      if (recovered > 0) {
        console.log(`Schéma final sans historique : ${recovered} version(s) seraient adoptées, hors réparations.`);
      }
      if (needsSeed) {
        console.log(`Amorçage prévu (base historique reconnue): ${seedVersions.length} migration(s)`);
      } else if (!tableExists || trackingEmpty) {
        console.log(`Base neuve : les ${all.length} migrations seront jouées dans l'ordre.`);
      }
      if (baselineVersions.length > 0) {
        console.log(`Schéma org_score final détecté : ${baselineVersions.length} migration(s) historique(s) à adopter.`);
      }
      console.log(`Déjà appliquées (${already.length}):`);
      for (const v of already) console.log(`  [applied] ${v}`);
      console.log(`En attente (${pending.length}):`);
      for (const v of pending) console.log(`  [pending] ${v}`);
      console.log(`Total: ${all.length}`);
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    if (recovered > 0 || seedVersions.length > 0 || baselineVersions.length > 0) {
      for (const v of [...all.filter((version) => applied.has(version))]) {
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
          [v],
        );
      }
      console.log(`Historique réconcilié: ${recovered + seedVersions.length + baselineVersions.length} version(s) adoptée(s).`);
    }

    for (const v of pending) {
      const sql = stripTransactionControl(readFileSync(join(DB_DIR, v), "utf8"));
      console.log(`Applying ${v}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        // La version fait partie du MÊME commit que le SQL : un crash ne peut
        // pas laisser une migration appliquée mais non suivie.
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [v]);
        await client.query("COMMIT");
        console.log(`  OK ${v}`);
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Le BEGIN lui-même peut avoir échoué : rien à annuler.
        }
        console.error(`  ÉCHEC ${v} — aucune version enregistrée pour cette migration.`);
        console.error(`  Les migrations précédentes restent appliquées ; corrigez puis relancez.`);
        throw err;
      }
    }

    if (pending.length === 0) {
      console.log("Aucune migration en attente.");
    } else {
      console.log(`Terminé: ${pending.length} migration(s) appliquée(s).`);
      // Les chargements massifs laissent des statistiques obsolètes (F10).
      await client.query("ANALYZE event");
      await client.query("ANALYZE org");
      await client.query("ANALYZE org_unknown");
      console.log("Statistiques rafraîchies (ANALYZE).");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
