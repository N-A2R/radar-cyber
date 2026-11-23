/**
 * Vérification reproductible de l'objectif « échecs d'enrichissement visibles
 * et rejouables ». Base jetable créée depuis db/init.sql + toutes les
 * migrations, aucun réseau, aucune donnée réelle.
 *
 *   apps/api/node_modules/.bin/tsx scripts/verifie-objectif-enrich-job.mts
 *
 * Laisse, le temps de la mesure, un job failed avec 3 tentatives et une
 * prochaine échéance, puis imprime la requête du critère et son résultat brut.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";
import type { EnrichTarget } from "../apps/api/src/enrich/jobs.js";

const CRITERION =
  "SELECT count(*) FROM enrich_job WHERE state='failed' AND attempts >= 3 AND next_try_at IS NOT NULL";
const fixtureDir = await mkdtemp(join(tmpdir(), "radar-objectif-enrich-job-"));
const fixturePath = join(fixtureDir, "fixture.json");
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let db: Awaited<ReturnType<typeof createTestDatabase>> | null = null;

async function enrichFromFixture(): Promise<{ errors: string[]; value?: string }> {
  const parsed: unknown = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("ok" in parsed) || !("value" in parsed)) {
    return { errors: ["fixture invalide"] };
  }
  const fixture = parsed as { ok: unknown; value: unknown };
  if (fixture.ok !== true) return { errors: [`fixture indisponible: ${String(fixture.value)}`] };
  return { errors: [], value: String(fixture.value) };
}

try {
  db = await createTestDatabase();
  // Les pools de src/db.js lisent DATABASE_URL au chargement du module.
  process.env.DATABASE_URL = db.url;
  const { query, closePools } = await import("../apps/api/src/db.js");
  const { recordEnrichmentFailure, replayEnrichJob } = await import("../apps/api/src/enrich/jobs.js");

  // Job laissé en échec : c'est celui que compte le critère en fin de mesure.
  const failed: EnrichTarget = { type: "domain", value: `echecs-${suffix}.example.invalid` };
  for (let i = 0; i < 3; i++) {
    await recordEnrichmentFailure(failed, "fournisseur indisponible");
  }

  // Second job : rejeu réussi après correction de la fixture locale.
  await writeFile(fixturePath, JSON.stringify({ ok: false, value: "avant correction" }), "utf8");
  const replayed: EnrichTarget = { type: "domain", value: `rejeu-${suffix}.example.invalid` };
  for (let i = 0; i < 3; i++) {
    await recordEnrichmentFailure(replayed, "fixture indisponible");
  }
  const before = await replayEnrichJob(0, enrichFromFixture); // garde-fou : identifiant invalide
  if (before !== null) throw new Error("un identifiant invalide ne doit pas être rejoué");
  await writeFile(fixturePath, JSON.stringify({ ok: true, value: "192.0.2.10" }), "utf8");
  // L'identifiant du job est relu en base (bigserial renvoyé comme chaîne).
  const { findEnrichJob } = await import("../apps/api/src/enrich/jobs.js");
  const job = await findEnrichJob(replayed);
  if (!job) throw new Error("job de rejeu introuvable");
  const after = await replayEnrichJob(job.id, enrichFromFixture);
  if (!after?.ok || after.job.state !== "done") throw new Error("rejeu après fixture corrigée en échec");
  console.log(`rejeu après fixture corrigée : ok — state=${after.job.state}, attempts=${after.job.attempts}`);

  const result = await query<{ count: string }>(CRITERION);
  const count = Number(result.rows[0]!.count);
  console.log(`${CRITERION} = ${count}`);
  console.log(
    `OBJECTIF : ${count >= 1 ? "atteint" : "partiel"} — ${count} / 1 job failed avec 3 tentatives et une prochaine tentative`,
  );
  if (count < 1) process.exitCode = 1;
  await closePools();
} finally {
  if (db) await dropTestDatabase(db);
  await rm(fixtureDir, { recursive: true, force: true });
}
