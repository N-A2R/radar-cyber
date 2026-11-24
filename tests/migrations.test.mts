/**
 * Gardes-fous du socle DB et de l'outillage (audits database.md / quality-tooling.md).
 *
 * Les tests statiques tournent sans PostgreSQL. Les contrôles sur base vivante
 * ne s'activent que si RADAR_DB_INTEGRATION=1 et DATABASE_URL est défini : la
 * CI `socle` les exécute sur une base issue de `pnpm setup`, puis sur une copie.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  compareMigrations,
  listMigrations,
  REPAIR_VERSIONS,
  stripTransactionControl,
  TOMBSTONES,
} from "../db/migration-order.mts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

test("les versions de migrations sont uniques et ordonnées par préfixe numérique", () => {
  const migrations = listMigrations(`${ROOT}db`);
  assert.equal(new Set(migrations).size, migrations.length, "version dupliquée");
  for (let i = 1; i < migrations.length; i += 1) {
    assert.ok(compareMigrations(migrations[i - 1], migrations[i]) <= 0);
  }
  // Un fichier ajouté avec un petit préfixe ne doit pas finir en fin de liste.
  const exemples = ["migrate-002.sql", "migrate-010-enrich.sql", "migrate-231-event-archive-incidents.sql"];
  const positions = exemples.map((v) => migrations.indexOf(v));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("les 9 versions perdues sont des tombstones documentées", () => {
  const migrations = new Set(listMigrations(`${ROOT}db`));
  assert.equal(TOMBSTONES.length, 9);
  for (const tombstone of TOMBSTONES) {
    assert.ok(migrations.has(tombstone.version), `${tombstone.version} absent du dépôt`);
    const sql = read(`db/${tombstone.version}`);
    assert.match(sql, /^-- TOMBSTONE/m);
    assert.ok(sql.includes(tombstone.version));
    assert.ok(existsSync(`${ROOT}db/${tombstone.successor}`), `successeur ${tombstone.successor} absent`);
    assert.ok(tombstone.reason.length > 10);
  }
});

test("les réparations sont versionnées après l'historique", () => {
  const migrations = listMigrations(`${ROOT}db`);
  for (const version of REPAIR_VERSIONS) {
    assert.ok(migrations.includes(version), `${version} absent`);
    assert.ok(compareMigrations("migrate-230-negative-attestation-source-ids.sql", version) < 0);
  }
});

test("le runner reprend la transaction des fichiers psql sans casser PL/pgSQL", () => {
  const migrations = listMigrations(`${ROOT}db`);
  let retires = 0;
  for (const version of migrations) {
    const sql = read(`db/${version}`);
    const stripped = stripTransactionControl(sql);
    assert.doesNotMatch(stripped, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*$/im, version);
    if (stripped !== sql) retires += 1;
    // Un BEGIN de bloc PL/pgSQL n'a pas de point-virgule et doit survivre.
    if (/^\s*BEGIN\s*$/im.test(sql)) assert.match(stripped, /^\s*BEGIN\s*$/im);
  }
  assert.ok(retires > 100, "les BEGIN/COMMIT historiques devraient être repris par le runner");
});

test("v_event_all déduplique le brut et l'archive", () => {
  const sql = read("db/migrate-232-v-event-all-dedup.sql");
  assert.match(sql, /WHERE NOT EXISTS \(SELECT 1 FROM event e WHERE e\.dedup_key = a\.dedup_key\)/);
  assert.match(sql, /'archive'::text AS origine/);
  assert.match(sql, /UNION ALL/);
});

test("la purge exige les deux archives avant tout DELETE", () => {
  const migration = read("db/migrate-231-event-archive-incidents.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS archive_incident/);
  assert.match(migration, /BEFORE DELETE ON event/);
  assert.match(migration, /RAISE EXCEPTION/);
  assert.match(read("scripts/purge-non-claims.mts"), /INSERT INTO archive_event/);
  assert.match(read("apps/api/src/maintenance/retention.ts"), /NOT EXISTS \(SELECT 1 FROM alert a WHERE a\.event_id = e\.id\)/);
});

test("refresh_org_score cible son référentiel et préserve ReCyF", () => {
  const sql = read("db/migrate-233-org-score-referentiel-scope.sql");
  assert.match(sql, /DELETE FROM org_score WHERE referentiel = 'ctem-priorite@1'/);
  assert.match(sql, /ON CONFLICT \(org_id, referentiel\) DO UPDATE/);
  assert.doesNotMatch(sql, /^\s*DELETE FROM org_score\s*;\s*$/im);
});

test("index org_unknown redondant supprimé et ANALYZE post-chargement", () => {
  assert.match(read("db/migrate-234-org-unknown-index.sql"), /DROP INDEX IF EXISTS org_unknown_critere_idx/);
  assert.match(read("db/migrate-235-post-load-analyze.sql"), /ANALYZE org_unknown/);
  assert.match(read("scripts/migrate.mts"), /client\.query\("ANALYZE org"\)/);
});

test("un seul point d'entrée de schéma et DATABASE_URL exigé", () => {
  assert.equal(existsSync(`${ROOT}db/schema.sql`), false);
  assert.ok(existsSync(`${ROOT}db/init.sql`));
  assert.match(read(".github/workflows/ci.yml"), /db\/init\.sql/);
  assert.doesNotMatch(read("scripts/migrate.mts"), /\?\?\s*"postgres:\/\//);
  assert.match(read("scripts/migrate.mts"), /DATABASE_URL est obligatoire/);
});

test("les sauvegardes ne journalisent aucun identifiant et vérifient SHA256", () => {
  const local = read("scripts/backup-db.sh");
  assert.doesNotMatch(local, /log "Dump de \$DB_URL/);
  assert.match(local, /target_sans_secret/);
  assert.match(local, /sha256sum "\$OUT"/);
  assert.match(local, /sha256sum '\$REMOTE_DIR\/\$\(basename "\$OUT"\)'/);
  const remote = read("scripts/backup-remote.sh");
  assert.match(remote, /PGPASSFILE/);
  assert.doesNotMatch(remote, /DATABASE_URL="postgres:\/\/radar:\$\(/);
});

test("workflow RGPD et état partial présents en migration", () => {
  const rgpd = read("db/migrate-236-violation-rgpd-workflow.sql");
  for (const colonne of ["date_qualification", "qualifiee_par", "reference_notification", "date_cloture"]) {
    assert.ok(rgpd.includes(colonne), colonne);
  }
  assert.match(rgpd, /statut IN \('suspectee', 'qualifiee', 'notifiee', 'close'\)/);
  assert.match(rgpd, /WHERE statut <> 'notifiee'/);
  const enrich = read("db/migrate-237-enrich-job-partial.sql");
  assert.match(enrich, /'partial'/);
  const confidence = read("db/migrate-238-confidence-regle-version.sql");
  assert.match(confidence, /ADD COLUMN IF NOT EXISTS regle_version text NOT NULL DEFAULT 'confidence@1'/);
  assert.equal((confidence.match(/ALTER TABLE/g) ?? []).length, 2);
});

test("SEC-14 : DELETE du journal des accès conditionné à un jeton de rétention", () => {
  const sql = read("db/migrate-239-access-log-no-delete.sql");
  assert.match(sql, /BEFORE DELETE ON public\.access_log/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.access_log_purge_token/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /pg_backend_pid\(\)/);
  assert.match(sql, /pg_current_xact_id\(\)::text/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.access_log_purge_token FROM PUBLIC/);
  assert.match(sql, /ALTER TABLE public\.access_log_purge_token OWNER TO radar_retention/);
  assert.equal((sql.match(/OWNER TO radar_retention/g) ?? []).length, 3, "table + 2 fonctions");
  assert.match(sql, /p_jours < 1 OR p_jours > 3650/);
  assert.doesNotMatch(sql, /^\s*SET\s+radar\./im, "un GUC de session serait contournable");
  assert.match(sql, /GRANT SELECT, DELETE ON public\.access_log TO radar_retention/);
  assert.match(sql, /to_jsonb\(NEW\) - 'acteur' - 'user_id' - 'role'/);
  assert.match(sql, /to_jsonb\(OLD\) - 'acteur' - 'user_id' - 'role'/);
  assert.doesNotMatch(sql, /NEW\.route = OLD\.route/, "comparaison partielle insuffisante");
});

test("DB-M8 : préparation explicite des seules sources non branchées", () => {
  const sql = read("db/migrate-240-source-readiness.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS pret_a_collecter boolean/);
  assert.match(sql, /SET pret_a_collecter = false/);
  assert.match(sql, /enabled IS TRUE\s+AND last_ok_at IS NULL/);
  assert.match(sql, /SET pret_a_collecter = true/);
  assert.match(sql, /enabled IS TRUE\s+AND last_ok_at IS NOT NULL/);
  for (const prefixe of ["sitemap", "source-feed", "regional", "forum"]) {
    assert.ok(sql.includes(`'${prefixe}'`), prefixe);
  }
  assert.doesNotMatch(sql, /SET enabled\s*=\s*false/, "aucune source ne doit être désactivée");
});

test("DB-M9 : un index justifié, les 18 candidats documentés", () => {
  const sql = read("db/migrate-241-fk-leading-indexes.sql");
  assert.match(sql, /collector_run \(source_id, started_at DESC\)/);
  assert.match(sql, /i\.indkey\[0\] = v_attnum/);
  const candidats = [
    "app_session(user_id)", "attachment_confidence(org_id)", "collector_run(source_id)",
    "dns_change(current_snapshot_id)", "droit_reponse(demandeur_user_id)",
    "event(asset_id, source_id)", "exposition_service_detection(org_id)",
    "leak_link_eval(claim_id, event_id)",
    "onion_lead(confirmed_event_id, mention_event_id, source_id)",
    "prestataire_qualifie(extrait_id)", "retrieval_hit(event_id)",
    "retrieval_query(expected_event_id, query_event_id)",
    "second_victim_pair(second_event_key)", "second_victim_prediction(first_event_key)",
    "source_live_item(event_id)", "stix_object(pap)", "watchlist_item(org_id)",
    "watchlist_match(item_id)",
  ];
  assert.equal(candidats.length, 18);
  const doc = read("docs/database-residual.md");
  for (const candidat of candidats) {
    assert.ok(sql.includes(candidat) && doc.includes(candidat), candidat);
  }
});

test("F11 : invariant temporel NOT VALID et contrat d'écriture documenté", () => {
  const sql = read("db/migrate-242-event-temporal-order.sql");
  assert.match(sql, /event_at_not_before_valid_at/);
  assert.match(sql, /NOT VALID/);
  assert.match(sql, /at >= valid_at - interval '2 seconds'/);
  const doc = read("docs/database-residual.md");
  for (const writer of ["collectors/generic.ts", "collecte/cycle.ts", "communiques/store.ts"]) {
    assert.ok(doc.includes(writer), writer);
  }
});

test("F11 : normalisation cti exacte, comptes consignés et validation conditionnelle", () => {
  const sql = read("db/migrate-243-event-temporal-normalisation.sql");
  assert.match(sql, /family = 'cti'/);
  assert.match(sql, /valid_at = at \+ interval '1 hour'/);
  assert.match(sql, /SET valid_at = at/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.event_temporal_normalisation/);
  assert.match(sql, /inversions_restantes/);
  assert.match(sql, /VALIDATE CONSTRAINT event_at_not_before_valid_at/);
  assert.match(sql, /v_restantes = 0/);
  assert.match(sql, /ransomware/);
  assert.ok(REPAIR_VERSIONS.includes("migrate-243-event-temporal-normalisation.sql"));
});

test("SEC-14 : privilèges explicites du rôle de rétention (correction 244)", () => {
  const sql = read("db/migrate-244-retention-grants.sql");
  assert.match(sql, /GRANT SELECT, DELETE ON public\.access_log TO radar_retention/);
  assert.match(sql, /GRANT SELECT, INSERT, DELETE ON public\.access_log_purge_token TO radar_retention/);
  assert.match(sql, /GRANT USAGE ON SCHEMA public TO radar_retention/);
  assert.ok(REPAIR_VERSIONS.includes("migrate-244-retention-grants.sql"));
});

test("F11 : tolérance 5 s et exemption des sources de mesure (correction 245)", () => {
  const sql = read("db/migrate-245-temporal-benchmark-exemption.sql");
  assert.match(sql, /DROP CONSTRAINT IF EXISTS event_at_not_before_valid_at/);
  assert.match(sql, /at >= valid_at - interval '5 seconds'/);
  assert.match(sql, /source_id LIKE 'bench-%'/);
  assert.match(sql, /source_id LIKE 'precision-eval-%'/);
  assert.match(sql, /VALIDATE CONSTRAINT event_at_not_before_valid_at/);
  assert.match(sql, /source_id LIKE 'zz-fixture-%'/);
  assert.doesNotMatch(sql, /UPDATE public\.event\s+SET valid_at/, "benchmark non normalisé");
  assert.ok(REPAIR_VERSIONS.includes("migrate-245-temporal-benchmark-exemption.sql"));
});

test("F11 : normalisation des seules fixtures zz-fixture-% (migration 246)", () => {
  const sql = read("db/migrate-246-fixture-temporal-normalisation.sql");
  assert.match(sql, /source_id LIKE 'zz-fixture-%'/);
  assert.match(sql, /SET valid_at = at/);
  assert.match(sql, /valid_at <> at/);
  assert.match(sql, /inversions_restantes/);
  assert.match(sql, /event_temporal_normalisation/);
  assert.doesNotMatch(sql, /source_id NOT LIKE 'zz-fixture-%'\s*\n\s*AND UPDATE/, "aucune autre source");
  assert.ok(REPAIR_VERSIONS.includes("migrate-246-fixture-temporal-normalisation.sql"));
});

test("SEC-14 : TRUNCATE du journal des accès interdit et privilège retiré (247)", () => {
  const sql = read("db/migrate-247-access-log-no-truncate.sql");
  assert.match(sql, /CREATE TRIGGER access_log_no_truncate/);
  assert.match(sql, /BEFORE TRUNCATE ON public\.access_log/);
  assert.match(sql, /FOR EACH STATEMENT EXECUTE FUNCTION public\.access_log_no_truncate\(\)/);
  assert.match(sql, /RAISE EXCEPTION 'journal des accès : TRUNCATE interdit/);
  assert.doesNotMatch(sql, /IF TG_OP/, "aucune exception ne doit autoriser TRUNCATE");
  assert.match(sql, /REVOKE TRUNCATE ON TABLE public\.access_log FROM PUBLIC/);
  assert.match(sql, /REVOKE TRUNCATE, DELETE ON TABLE public\.access_log FROM radar/);
  assert.match(sql, /REVOKE TRUNCATE, DELETE ON TABLE public\.access_log FROM radar_app/);
  assert.match(sql, /EXECUTE 'ALTER TABLE public\.access_log OWNER TO radar_retention'/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.access_log TO radar/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.access_log TO radar_app/);
  assert.match(sql, /format\('REVOKE TRUNCATE ON TABLE public\.access_log FROM %I'/);
  assert.doesNotMatch(sql, /GRANT [^\n]*TRUNCATE/);
  assert.doesNotMatch(sql, /GRANT ALL ON TABLE public\.access_log/);
  assert.match(sql, /superutilisateur/, "limite de contournement documentée");
  assert.match(sql, /purger_access_log\(\)/, "la purge bornée reste le seul chemin");
  assert.ok(REPAIR_VERSIONS.includes("migrate-247-access-log-no-truncate.sql"));
  for (const version of listMigrations(`${ROOT}db`)) {
    if (compareMigrations(version, "migrate-247-access-log-no-truncate.sql") <= 0) continue;
    const later = read(`db/${version}`);
    assert.doesNotMatch(later, /DROP TRIGGER IF EXISTS access_log_no_truncate/);
    assert.doesNotMatch(later, /^\s*TRUNCATE\s+(TABLE\s+)?public\.access_log\b/im);
  }
});

test("206 : la chaîne de preuve de event reste complète après l'historique", () => {
  const sql = read("db/migrate-206-event-proof-chain.sql");
  assert.match(sql, /ADD CONSTRAINT event_source_url_required/);
  assert.match(sql, /ADD CONSTRAINT event_run_id_required/);
  assert.match(sql, /SELECT 1 FROM collector_run cr WHERE cr\.id = rid/);
  assert.match(sql, /CREATE TRIGGER event_proof_chain/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF evidence ON event/);
  assert.match(sql, /VALIDATE CONSTRAINT event_source_url_required/);
  assert.match(sql, /VALIDATE CONSTRAINT event_run_id_required/);
  // Aucune migration postérieure ne doit retirer une des trois gardes : les
  // fixtures d'événements (y compris celles des tests) reposent dessus.
  for (const version of listMigrations(`${ROOT}db`)) {
    if (compareMigrations(version, "migrate-206-event-proof-chain.sql") <= 0) continue;
    const later = read(`db/${version}`);
    assert.doesNotMatch(later, /DROP TRIGGER IF EXISTS event_proof_chain/);
    assert.doesNotMatch(later, /DROP CONSTRAINT IF EXISTS event_run_id_required/);
    assert.doesNotMatch(later, /DROP CONSTRAINT IF EXISTS event_source_url_required/);
  }
});

// ── Contrôles sur base vivante (CI socle / base copiée) ────────────────────
const INTEGRATION = process.env.RADAR_DB_INTEGRATION === "1";
const require = createRequire(fileURLToPath(new URL("../apps/api/package.json", import.meta.url)));

test("dérive d'historique et état du schéma sur la base cible", { skip: !INTEGRATION }, async () => {
  const { Client } = require("pg") as typeof import("pg");
  const url = process.env.DATABASE_URL;
  assert.ok(url, "DATABASE_URL requis pour le contrôle d'intégration");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const connus = new Set(listMigrations(`${ROOT}db`));
    const versions = await client.query<{ version: string }>("SELECT version FROM schema_migrations");
    const inconnues = versions.rows
      .map((r) => r.version)
      .filter((v) => !connus.has(v) && v !== "__container_bootstrap__");
    assert.deepEqual(inconnues, [], "version appliquée sans fichier versionné (dérive)");

    const vue = await client.query<{ definition: string }>(
      "SELECT pg_get_viewdef('public.v_event_all'::regclass, true) AS definition",
    );
    assert.match(vue.rows[0].definition, /NOT EXISTS/);
    const trigger = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_trigger
        WHERE tgrelid = 'public.event'::regclass
          AND tgname = 'event_archive_avant_delete' AND NOT tgisinternal`,
    );
    assert.equal(trigger.rows[0].n, "1");
    const index = await client.query<{ absent: boolean }>(
      "SELECT to_regclass('public.org_unknown_critere_idx') IS NULL AS absent",
    );
    assert.equal(index.rows[0].absent, true);
    const fonction = await client.query<{ definition: string }>(
      "SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.proname = 'refresh_org_score'",
    );
    assert.ok(fonction.rows.length >= 1);
    assert.match(fonction.rows.at(-1)!.definition, /DELETE FROM org_score WHERE referentiel/);
    const rgpd = await client.query<{ colonne: string }>(
      `SELECT column_name AS colonne FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'violation_rgpd'`,
    );
    const colonnes = new Set(rgpd.rows.map((r) => r.colonne));
    for (const colonne of ["date_qualification", "qualifiee_par", "reference_notification", "date_cloture"]) {
      assert.ok(colonnes.has(colonne), colonne);
    }
    const accessTrigger = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_trigger
        WHERE tgrelid = 'public.access_log'::regclass
          AND tgname = 'access_log_no_delete' AND NOT tgisinternal`,
    );
    assert.equal(accessTrigger.rows[0].n, "1");
    const retentionOwner = await client.query<{ owner: string }>(
      `SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc
        WHERE oid = 'public.purger_access_log(integer)'::regprocedure`,
    );
    assert.equal(retentionOwner.rows[0].owner, "radar_retention");
    const privileges = await client.query<{
      journal: boolean; jetonSelect: boolean; jetonInsert: boolean; jetonDelete: boolean;
    }>(
      `SELECT has_table_privilege('radar_retention', 'public.access_log', 'DELETE') AS journal,
              has_table_privilege('radar_retention', 'public.access_log_purge_token', 'SELECT') AS jeton_select,
              has_table_privilege('radar_retention', 'public.access_log_purge_token', 'INSERT') AS jeton_insert,
              has_table_privilege('radar_retention', 'public.access_log_purge_token', 'DELETE') AS jeton_delete`,
    );
    const p = privileges.rows[0]!;
    assert.deepEqual([p.journal, p.jetonSelect, p.jetonInsert, p.jetonDelete], [true, true, true, true]);

    // Vérification SET ROLE + appel réel de la fonction, dans une transaction
    // annulée : la purge ne laisse aucune trace dans la base de test.
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO access_log (methode, route, statut, decision, niveau_requis, acteur, ip_hash, correlation_id, recorded_at)
         VALUES ('GET', '/sec14-purge', 200, 'autorise', 'user', 'verif', 'hash', 'sec14-purge', now() - interval '10 days')`,
      );
      await client.query("SET LOCAL ROLE radar_retention");
      const role = await client.query<{ role: string }>("SELECT current_user::text AS role");
      assert.equal(role.rows[0].role, "radar_retention");
      const purged = await client.query<{ n: string }>("SELECT purger_access_log(1)::text AS n");
      assert.ok(Number(purged.rows[0].n) >= 1, "la purge doit réellement supprimer la ligne ancienne");
      const restant = await client.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM access_log WHERE correlation_id = 'sec14-purge'",
      );
      assert.equal(restant.rows[0].n, "0");
      const jetons = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM access_log_purge_token");
      assert.equal(jetons.rows[0].n, "0", "aucun jeton ne doit survivre à la purge");
      await client.query("RESET ROLE");
    } finally {
      await client.query("ROLLBACK");
    }
    // 247 : TRUNCATE n'est ni un DELETE déguisé ni un chemin de rétention.
    const truncateTrigger = await client.query<{ definition: string }>(
      `SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger
        WHERE tgrelid = 'public.access_log'::regclass
          AND tgname = 'access_log_no_truncate' AND NOT tgisinternal`,
    );
    assert.equal(truncateTrigger.rows.length, 1);
    assert.match(truncateTrigger.rows[0].definition, /BEFORE TRUNCATE/);
    const truncateGrants = await client.query<{ grantee: string }>(
      `SELECT grantee FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'access_log'
          AND privilege_type = 'TRUNCATE'`,
    );
    assert.deepEqual(truncateGrants.rows, [], "aucun GRANT TRUNCATE ne doit rester sur access_log");

    // Sonde non superutilisateur, avec les droits applicatifs (INSERT/SELECT/
    // UPDATE) mais aucun TRUNCATE. Rôle créé puis détruit dans la transaction
    // annulée : aucun état persistant n'est laissé par le contrôle.
    const sonde = `rad_truncate_probe_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
    await client.query("BEGIN");
    try {
      await client.query(`CREATE ROLE ${sonde} NOSUPERUSER NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT`);
      await client.query(`GRANT ${sonde} TO CURRENT_USER`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${sonde}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE ON TABLE public.access_log TO ${sonde}`);
      const droits = await client.query<{ insertOk: boolean; truncateOk: boolean }>(
        `SELECT has_table_privilege('${sonde}', 'public.access_log', 'INSERT') AS insert_ok,
                has_table_privilege('${sonde}', 'public.access_log', 'TRUNCATE') AS truncate_ok`,
      );
      assert.deepEqual([droits.rows[0].insertOk, droits.rows[0].truncateOk], [true, false]);

      await client.query("SAVEPOINT verif_truncate");
      await client.query(`SET LOCAL ROLE ${sonde}`);
      await assert.rejects(client.query("TRUNCATE TABLE public.access_log"));
      await client.query("ROLLBACK TO SAVEPOINT verif_truncate");

      // Le trigger s'applique même à un rôle autorisé par l'ACL : on accorde
      // TRUNCATE à la sonde dans cette transaction annulée pour le prouver.
      await client.query(`GRANT TRUNCATE ON TABLE public.access_log TO ${sonde}`);
      await client.query("SAVEPOINT verif_truncate");
      await client.query(`SET LOCAL ROLE ${sonde}`);
      await assert.rejects(client.query("TRUNCATE TABLE public.access_log"), /journal des accès/);
      await client.query("ROLLBACK TO SAVEPOINT verif_truncate");
    } finally {
      await client.query("ROLLBACK");
    }
    const tokenGrants = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'access_log_purge_token'
          AND grantee IN ('radar', 'PUBLIC')
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')`,
    );
    assert.equal(tokenGrants.rows[0].n, "0");
    const readiness = await client.query<{ present: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'source'
            AND column_name = 'pret_a_collecter'
       ) AS present`,
    );
    assert.equal(readiness.rows[0].present, true);
    const fkIndex = await client.query<{ definition: string }>(
      "SELECT indexdef AS definition FROM pg_indexes WHERE indexname = 'collector_run_source_started_idx'",
    );
    assert.match(fkIndex.rows[0].definition, /\(source_id, started_at DESC\)/);
    const timeCheck = await client.query<{ validated: boolean }>(
      `SELECT convalidated AS validated FROM pg_constraint
        WHERE conrelid = 'public.event'::regclass AND conname = 'event_at_not_before_valid_at'`,
    );
    assert.equal(timeCheck.rows[0].validated, true, "migration 245 doit valider le contrôle exempté");
    const timeDefinition = await client.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid = 'public.event'::regclass AND conname = 'event_at_not_before_valid_at'`,
    );
    assert.match(timeDefinition.rows[0].definition, /5 seconds/);
    assert.match(timeDefinition.rows[0].definition, /bench-%/);
    assert.match(timeDefinition.rows[0].definition, /precision-eval-%/);
    assert.match(timeDefinition.rows[0].definition, /zz-fixture-%/);

    const normalisation = await client.query<{ apres: string }>(
      `SELECT inversions_restantes::text AS apres FROM public.event_temporal_normalisation
        WHERE migration = 'migrate-243-event-temporal-normalisation.sql'`,
    );
    assert.ok(Number.isFinite(Number(normalisation.rows[0].apres)), "compte historique consigné");
    const fixtureAudit = await client.query<{ restantes: string }>(
      `SELECT inversions_restantes::text AS restantes FROM public.event_temporal_normalisation
        WHERE migration = 'migrate-246-fixture-temporal-normalisation.sql'`,
    );
    assert.ok(fixtureAudit.rows.length === 1, "compte de normalisation zz-fixture consigné");
    const fixtureRestantes = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.event
        WHERE source_id LIKE 'zz-fixture-%' AND at < valid_at - interval '5 seconds'`,
    );
    assert.equal(fixtureRestantes.rows[0].n, "0");
    // Les sources de mesure gardent leur inversion : la contrainte 245 les
    // exempte, tandis qu'une source réelle reste bloquée au-delà de 5 s.
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO source (id, name, family, url) VALUES
           ('bench-verif', 'bench verif', 'cti', 'https://example.invalid/bench'),
           ('precision-eval-99', 'precision verif', 'cti', 'https://example.invalid/precision')
         ON CONFLICT (id) DO NOTHING`,
      );
      await client.query(
        `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, valid_at, at) VALUES
           ('verif:bench:inversion', 'cti', 'ambient_signal', 'bench', 'bench-verif', now() + interval '10 hours', now()),
           ('verif:precision:inversion', 'cti', 'ambient_signal', 'precision', 'precision-eval-99', now() + interval '20 hours', now()),
           ('verif:skew:5s', 'ransomware', 'ambient_signal', 'skew', 'cert_fr', now() + interval '3 seconds', now())`,
      );
      await client.query("SAVEPOINT verif");
      await assert.rejects(
        client.query(
          `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, valid_at, at)
           VALUES ('verif:reel:inversion', 'cti', 'ambient_signal', 'reel', 'cert_fr', now() + interval '1 hour', now())`,
        ),
        /event_at_not_before_valid_at/,
      );
      await client.query("ROLLBACK TO SAVEPOINT verif");
    } finally {
      await client.query("ROLLBACK");
    }
    // DELETE direct et anonymisation partielle sont bloqués ; transaction
    // annulée à la fin pour ne rien laisser derrière ces contrôles.
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO access_log (methode, route, statut, decision, niveau_requis, role, user_id, acteur, ip_hash, correlation_id)
         VALUES ('GET', '/sec14-verif', 200, 'autorise', 'user', 'user', 42, 'verif', 'hash', 'sec14-verif')`,
      );
      await client.query("SAVEPOINT verif");
      await assert.rejects(
        client.query("DELETE FROM access_log WHERE correlation_id = 'sec14-verif'"),
        /journal des accès/,
      );
      await client.query("ROLLBACK TO SAVEPOINT verif");

      await assert.rejects(
        client.query(
          `UPDATE access_log SET acteur='compte-supprime', user_id=NULL, role=NULL, route='/modifie'
            WHERE correlation_id='sec14-verif'`,
        ),
        /journal des accès/,
      );
      await client.query("ROLLBACK TO SAVEPOINT verif");

      await assert.rejects(
        client.query(
          `UPDATE access_log SET acteur='compte-supprime', user_id=NULL, role=NULL, ip_hash='autre-hash'
            WHERE correlation_id='sec14-verif'`,
        ),
        /journal des accès/,
      );
      await client.query("ROLLBACK TO SAVEPOINT verif");

      const anonymise = await client.query<{ acteur: string }>(
        `UPDATE access_log SET acteur='compte-supprime', user_id=NULL, role=NULL
          WHERE correlation_id='sec14-verif' RETURNING acteur`,
      );
      assert.equal(anonymise.rows[0].acteur, "compte-supprime");
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
  }
});
