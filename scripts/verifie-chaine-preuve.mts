/**
 * Vérifie le critère de sortie « chaîne de preuve » (migration 206) sur une
 * base neuve, sans toucher `radar` :
 *
 *   1. la contrainte de présence existe et est validée ;
 *   2. un insert sans source_url / sans run_id / avec un run inexistant est refusé ;
 *   3. un run cité ne peut pas être supprimé ;
 *   4. le critère chiffré rend 0 sur les 30 derniers jours.
 *
 * La base `radar_verif_preuve_<pid>` est créée puis détruite, même en échec.
 * Sortie brute : chaque ligne `CHECK ...` porte le résultat mesuré.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");
const { Client } = pg;

const ADMIN_URL = process.env.RADAR_TEST_ADMIN_URL ?? "postgres://radar:radar@localhost:5432/postgres";
const name = `radar_verif_preuve_${process.pid}`;
const dbDir = join(process.cwd(), "db");

type Resultat = { nom: string; ok: boolean; detail: string };
const resultats: Resultat[] = [];

function verifier(nom: string, ok: boolean, detail: string): void {
  resultats.push({ nom, ok, detail });
  console.log(`CHECK ${ok ? "OK  " : "ÉCHEC"} ${nom} — ${detail}`);
}

async function withAdmin<T>(fn: (client: InstanceType<typeof Client>) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function appliquer(client: InstanceType<typeof Client>, fichiers: string[]): Promise<void> {
  for (const fichier of fichiers) {
    await client.query(readFileSync(join(dbDir, fichier), "utf8"));
  }
}

type PgErreur = { code?: string; message?: string };

async function refus(promesse: Promise<unknown>): Promise<PgErreur> {
  try {
    await promesse;
  } catch (error) {
    return error as PgErreur;
  }
  return { message: "aucune erreur : l'insertion aurait dû être refusée" };
}

async function main(): Promise<void> {
  await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name}`));
  await withAdmin((admin) => admin.query(`CREATE DATABASE ${name}`));
  const client = new Client({ connectionString: ADMIN_URL.replace(/\/[^/]+$/, `/${name}`) });
  await client.connect();
  try {
    const migrations = readdirSync(dbDir)
      .filter((f) => /^migrate-.*\.sql$/.test(f))
      .sort((a, b) => a.localeCompare(b, "en"));
    await appliquer(client, ["init.sql", ...migrations, "detection-rules.sql"]);

    // 1. Contraintes présentes et validées.
    const { rows: contraintes } = await client.query<{ conname: string; convalidated: boolean }>(
      `SELECT conname, convalidated FROM pg_constraint
        WHERE conrelid = 'event'::regclass AND contype = 'c'
          AND conname IN ('event_source_url_required', 'event_run_id_required')
        ORDER BY conname`,
    );
    verifier(
      "contraintes CHECK présentes et validées",
      contraintes.length === 2 && contraintes.every((c) => c.convalidated),
      contraintes.map((c) => `${c.conname}=${c.convalidated ? "validated" : "NOT VALID"}`).join(", "),
    );

    const source = "preuve-verif";
    await client.query(
      `INSERT INTO source (id, name, family, url) VALUES ($1, 'Source de vérification', 'cti', 'https://example.invalid/feed')`,
      [source],
    );
    const { rows: runRows } = await client.query<{ id: string }>(
      `INSERT INTO collector_run (source_id, status, kind) VALUES ($1, 'ok', 'live') RETURNING id`,
      [source],
    );
    const runId = Number(runRows[0]?.id);

    const insert = (dedup: string, url: string | null, evidence: Record<string, unknown>) =>
      client.query(
        `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at,
                            source_id, source_url, evidence)
         VALUES ($1, 'cti', 'ambient_signal', 'vérification', now(), $2, $3, $4::jsonb)`,
        [dedup, source, url, JSON.stringify(evidence)],
      );

    // 2. Insertions incomplètes refusées.
    const sansUrl = await refus(insert("verif-sans-url", null, { run_id: String(runId) }));
    verifier("insert sans source_url refusé", sansUrl.code === "23514", `${sansUrl.code}: ${sansUrl.message ?? ""}`);
    const sansRun = await refus(insert("verif-sans-run", "https://example.invalid/item", { feed: "x" }));
    verifier("insert sans run_id refusé", sansRun.code === "23514", `${sansRun.code}: ${sansRun.message ?? ""}`);
    const runInconnu = await refus(insert("verif-run-inconnu", "https://example.invalid/item", { run_id: "999999999" }));
    verifier("insert avec run_id inexistant refusé", runInconnu.code === "23503", `${runInconnu.code}: ${runInconnu.message ?? ""}`);

    // 3. Preuve complète acceptée et citée.
    await insert("verif-complete", "https://example.invalid/item", { run_id: String(runId) });
    const { rows: cite } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM event e
        JOIN collector_run cr ON cr.id = (e.evidence->>'run_id')::bigint
       WHERE e.dedup_key = 'verif-complete' AND e.source_url IS NOT NULL`,
    );
    verifier("preuve complète acceptée et run résolu", cite[0]?.n === 1, `lignes jointe(s) = ${cite[0]?.n}`);

    // 4. Le run cité est protégé.
    const suppression = await refus(client.query("DELETE FROM collector_run WHERE id=$1", [runId]));
    verifier("suppression d'un run cité refusée", suppression.code === "23503", `${suppression.code}: ${suppression.message ?? ""}`);

    // 5. Critère chiffré.
    const { rows: critere } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM event
        WHERE at >= now() - interval '30 days'
          AND (source_url IS NULL OR evidence->>'run_id' IS NULL)`,
    );
    verifier("count(*) sans preuve sur 30 jours = 0", critere[0]?.n === 0, `count = ${critere[0]?.n}`);
    console.log(`CRITERE ${critere[0]?.n} / 0`);
  } finally {
    await client.end();
    await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name}`));
  }

  const echecs = resultats.filter((r) => !r.ok);
  console.log(`RESULTAT ${resultats.length - echecs.length}/${resultats.length} vérifications`);
  if (echecs.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
