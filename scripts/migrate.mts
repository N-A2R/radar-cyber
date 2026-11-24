#!/usr/bin/env -S npx tsx
/**
 * Migration runner PostgreSQL (déterministe).
 *
 * - Applique `db/migrate-*.sql` triés lexicographiquement.
 * - Table de suivi : `schema_migrations (version text primary key, applied_at timestamptz default now())`.
 * - Amorçage **conditionnel** : les migrations listées dans SEED_APPLIED ne
 *   sont marquées appliquées que si la base porte la trace de leur exécution
 *   passée. Sur une base neuve, elles sont jouées normalement.
 *
 *   Piège corrigé au chantier « socle » : l'amorçage était inconditionnel dès
 *   que la table de suivi était absente ou vide. Sur un dépôt neuf, il
 *   marquait 17 migrations comme faites sans les exécuter, puis la première
 *   migration suivante échouait sur `relation "org_alias" does not exist`.
 *   Les tests ne le voyaient pas : ils appliquent les migrations directement,
 *   sans passer par ce runner.
 * - Chaque migration s'applique dans une transaction et n'est enregistrée
 *   qu'après succès.
 *
 * Usage:
 *   npx tsx scripts/migrate.mts             # applique les migrations en attente
 *   npx tsx scripts/migrate.mts --dry-run   # liste sans rien modifier
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// pnpm cloisonne les dépendances : `pg` est installé dans apps/api, pas à la
// racine. Sans ce require ciblé, le script échoue en ERR_MODULE_NOT_FOUND
// depuis la racine du dépôt (constaté au remontage du socle).
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");

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

/** Bases copiées après 225 dont l'historique a perdu ces trois versions. */
const SCORE_BASELINE_APPLIED = [
  "migrate-217-org-score.sql",
  "migrate-222-org-score-recyf.sql",
  "migrate-225-org-score-referentiel.sql",
];

function listMigrations(): string[] {
  return readdirSync(DB_DIR)
    .filter((f) => /^migrate-.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function main(): Promise<void> {
  // La cible est dite à voix haute : le défaut est le port 5432, alors que la
  // base de dev tourne sur 5433. Sans cette ligne, on juge une migration sur la
  // mauvaise base et l'échec ressemble à un défaut de schéma.
  const cible = (() => {
    const u = new URL(DATABASE_URL);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  })();
  console.log(`Cible : ${cible}${process.env.DATABASE_URL ? " (DATABASE_URL)" : " (défaut)"}`);
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
    let trackingEmpty = false;
    if (tableExists) {
      const rows = await client.query<{ version: string }>(
        "SELECT version FROM schema_migrations",
      );
      applied = new Set(rows.rows.map((r) => r.version));
      trackingEmpty = applied.size === 0;
    }

    // L'amorçage ne vaut que pour une base historique reprise en main : on
    // exige la trace des objets que ces migrations créent. `org_alias` vient
    // de migrate-014a, `quarantine_raw` de migrate-007. Base neuve => aucun
    // des deux => on joue tout, dans l'ordre.
    const legacy = await client.query<{ org_alias: boolean; quarantine: boolean }>(
      `SELECT to_regclass('public.org_alias') IS NOT NULL AS org_alias,
              to_regclass('public.quarantine_raw') IS NOT NULL AS quarantine`,
    );
    const isLegacy = legacy.rows[0]?.org_alias === true && legacy.rows[0]?.quarantine === true;
    // Une base peut porter le schéma final mais avoir perdu son historique de
    // migrations (restauration/copie). Rejouer 225 serait destructeur : cette
    // migration vide org_score avant recalcul. On n'adopte donc ces versions
    // que si la colonne ET la clé composite sont déjà présentes.
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
      ? SCORE_BASELINE_APPLIED.filter((v) => all.includes(v))
      : [];
    for (const v of baselineVersions) applied.add(v);
    const needsSeed = (tableExists ? trackingEmpty : true) && isLegacy;

    const seedVersions = needsSeed ? SEED_APPLIED.filter((v) => all.includes(v)) : [];
    for (const v of seedVersions) applied.add(v);

    const pending = all.filter((v) => !applied.has(v));
    const already = all.filter((v) => applied.has(v));

    if (DRY_RUN) {
      console.log(`--dry-run: aucune modification.`);
      console.log(`Table schema_migrations: ${tableExists ? "présente" : "absente (serait créée)"}`);
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

    if (baselineVersions.length > 0) {
      for (const v of baselineVersions) {
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
          [v],
        );
      }
      console.log(`Historique réparé: ${baselineVersions.length} migration(s) org_score déjà présentes en base.`);
    }

    // Une transaction PAR migration, pas une pour tout le lot. Deux raisons,
    // constatées au chantier « socle » :
    //  1. migrate-021 et migrate-022 contiennent leur propre BEGIN/COMMIT
    //     (écrits pour psql). Dans une transaction englobante, leur COMMIT
    //     validait le travail déjà fait : un échec plus loin laissait une base
    //     à moitié migrée et une table de suivi qui mentait.
    //  2. Le contrat annoncé est « chaque migration dans une transaction,
    //     enregistrée après succès ». C'est ce que fait cette boucle : un
    //     échec arrête net, et le suivi reflète exactement ce qui est passé.
    for (const v of pending) {
      const sql = readFileSync(join(DB_DIR, v), "utf8");
      // Certaines migrations (021, 022) ont été écrites pour `psql` et portent
      // leur propre BEGIN/COMMIT. On ne réécrit PAS leur SQL : le retirer par
      // regex casse les blocs PL/pgSQL (un `END;` y ferme un bloc, pas une
      // transaction) et les expressions contenant des `$`. On les laisse
      // therefore piloter leur transaction, et on n'ouvre la nôtre que pour
      // les fichiers muets.
      //
      // Distinction fiable : en SQL transactionnel on écrit `BEGIN;` avec le
      // point-virgule ; en PL/pgSQL le `BEGIN` d'un bloc n'en porte pas.
      const selfTransactional =
        /^\s*BEGIN\s*;\s*$/im.test(sql) && /^\s*COMMIT\s*;\s*$/im.test(sql);
      console.log(`Applying ${v}...${selfTransactional ? " (transaction fournie)" : ""}`);
      if (!selfTransactional) await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [v]);
        if (!selfTransactional) await client.query("COMMIT");
        console.log(`  OK ${v}`);
      } catch (err) {
        if (!selfTransactional) await client.query("ROLLBACK");
        console.error(`  ÉCHEC ${v} — aucune version enregistrée pour cette migration.`);
        console.error(`  Les migrations précédentes restent appliquées ; corrigez puis relancez.`);
        throw err;
      }
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
