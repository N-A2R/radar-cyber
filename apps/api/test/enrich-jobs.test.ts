/**
 * Échecs d'enrichissement : visibilité, backoff exponentiel, rejeu borné.
 *
 * Tout est joué sur la base jetable de `test/run.ts`, avec une fixture locale
 * (aucun réseau, aucune donnée personnelle). Le dernier test laisse
 * volontairement une ligne `state='failed'` avec 3 tentatives et une prochaine
 * échéance : c'est l'état que le critère externe interroge en fin de suite.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import Fastify from "fastify";
import { closePools, query } from "../src/db.js";
import {
  MAX_ATTEMPTS,
  backoffDelayMs,
  enqueueEnrichment,
  findEnrichJob,
  processDueEnrichJobs,
  recordEnrichmentFailure,
  replayEnrichJob,
  type EnrichTarget,
} from "../src/enrich/jobs.js";
import enrichRoute from "../src/routes/enrich.js";

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const fixtureDir = await mkdtemp(join(tmpdir(), "radar-enrich-job-"));
const fixturePath = join(fixtureDir, "fixture.json");

async function setFixture(ok: boolean, value: string): Promise<void> {
  await writeFile(fixturePath, JSON.stringify({ ok, value }), "utf8");
}

/** Enrichisseur injecté : la fixture simule un fournisseur puis sa correction. */
async function enrichFromFixture(): Promise<{ errors: string[]; value?: string }> {
  const raw = await readFile(fixturePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !("ok" in parsed) || !("value" in parsed)) {
    return { errors: ["fixture invalide"] };
  }
  const fixture = parsed as { ok: unknown; value: unknown };
  if (fixture.ok !== true) return { errors: [`fixture indisponible: ${String(fixture.value)}`] };
  return { errors: [], value: String(fixture.value) };
}

const alwaysFails = async (): Promise<{ errors: string[] }> => ({ errors: ["fournisseur indisponible"] });

after(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await closePools();
});

test("rejeu réussi après correction de la fixture", async () => {
  await setFixture(false, "indisponible");
  const target: EnrichTarget = { type: "domain", value: `replay-${suffix}.invalid` };
  const enqueued = await enqueueEnrichment(target);
  assert.ok(enqueued, "job créé");
  assert.equal(enqueued.state, "pending");

  for (let tentative = 1; tentative <= 3; tentative++) {
    const passage = await processDueEnrichJobs({
      target,
      enricher: enrichFromFixture,
      now: Date.now() + tentative * 86_400_000,
      limit: 1,
    });
    assert.equal(passage.scanned, 1);
    assert.equal(passage.failed, 1);
    const job = await findEnrichJob(target);
    assert.equal(job?.state, "failed");
    assert.equal(job?.attempts, tentative);
    assert.ok(job?.next_try_at, "prochaine tentative planifiée");
  }

  await setFixture(true, "192.0.2.10");
  const replay = await replayEnrichJob(enqueued.id, enrichFromFixture);
  assert.equal(replay?.ok, true);
  assert.equal(replay?.job.state, "done");
  assert.equal(replay?.job.next_try_at, null);
  assert.deepEqual(replay?.job.last_result, { errors: [], value: "192.0.2.10" });
  assert.equal(await replayEnrichJob(enqueued.id, enrichFromFixture), null, "un job done est terminal");
});

test("backoff exponentiel borné et aucune boucle infinie", async () => {
  assert.deepEqual([1, 2, 3, 4].map(backoffDelayMs), [60_000, 120_000, 240_000, 480_000]);
  assert.equal(backoffDelayMs(99), 24 * 60 * 60_000, "plafond 24 h");

  const target: EnrichTarget = { type: "domain", value: `loop-${suffix}.invalid` };
  const enqueued = await enqueueEnrichment(target);
  assert.ok(enqueued);
  for (let tentative = 0; tentative < MAX_ATTEMPTS; tentative++) {
    const passage = await processDueEnrichJobs({
      target,
      enricher: alwaysFails,
      now: Date.now() + tentative * 86_400_000,
      limit: 1,
    });
    assert.equal(passage.scanned, 1, "une seule tentative par passage");
    assert.equal(passage.failed, 1);
  }
  const abandonne = await findEnrichJob(target);
  assert.equal(abandonne?.attempts, MAX_ATTEMPTS);
  assert.equal(abandonne?.state, "abandoned");
  assert.equal(abandonne?.next_try_at, null);
  const apres = await processDueEnrichJobs({
    target,
    enricher: alwaysFails,
    now: Date.now() + 30 * 86_400_000,
    limit: 10,
  });
  assert.equal(apres.scanned, 0, "un job abandonné n'est plus jamais sélectionné");
  assert.equal(await replayEnrichJob(enqueued.id, alwaysFails), null, "rejeu d'un job terminal refusé");

  for (let i = 0; i < 5; i++) {
    await enqueueEnrichment({ type: "hash", value: `lot-${suffix}-${i}` });
  }
  const lot = await processDueEnrichJobs({ enricher: alwaysFails, limit: 2 });
  assert.ok(lot.scanned <= 2, "un passage ne traite jamais plus que le lot demandé");
});

test("un échec répété reste visible avec une tentative planifiée", async () => {
  const target: EnrichTarget = { type: "domain", value: `echec-${suffix}.invalid` };
  for (let tentative = 1; tentative <= 3; tentative++) {
    const job = await recordEnrichmentFailure(target, new Error("whois indisponible"));
    assert.equal(job?.state, "failed");
    assert.equal(job?.attempts, tentative);
    assert.ok(job?.next_try_at);
  }
  const job = await findEnrichJob(target);
  assert.ok(job);
  assert.equal(job.state, "failed");
  assert.equal(job.attempts, 3);
  assert.ok(job.next_try_at);

  // Un rejeu qui échoue aussi reste visible : il n'efface ni le compteur ni
  // l'échéance, et ne déclenche aucune boucle de rejeu automatique.
  const replay = await replayEnrichJob(job.id, alwaysFails);
  assert.equal(replay?.ok, false);
  assert.equal(replay?.job.state, "failed");
  assert.equal(replay?.job.attempts, 4);
  assert.ok(replay?.job.next_try_at);

  const criterion =
    "SELECT count(*) FROM enrich_job WHERE state='failed' AND attempts >= 3 AND next_try_at IS NOT NULL";
  const result = await query<{ count: string }>(criterion);
  console.log(`${criterion} = ${result.rows[0]!.count}`);
  assert.ok(Number(result.rows[0]!.count) >= 1, "au moins un échec visible en fin de suite");
});

test("la file des échecs est exposée par la route de lecture", async () => {
  const app = Fastify({ logger: false });
  await app.register(enrichRoute, { prefix: "/api" });
  await app.ready();
  try {
    const res = await app.inject({ method: "GET", url: "/api/enrich/jobs?state=failed" });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ count: number; jobs: { state: string; attempts: number }[] }>();
    assert.ok(body.count >= 1);
    assert.ok(body.jobs.every((job) => job.state === "failed" && job.attempts >= 1));
  } finally {
    await app.close();
  }
});
