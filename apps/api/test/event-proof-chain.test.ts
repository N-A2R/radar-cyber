/**
 * Chaîne de preuve sur `event` (migration 206).
 *
 * Un événement doit citer l'URL qui l'établit et le run de collecte qui l'a
 * produit ; ce run doit exister dans `collector_run` tant que l'événement le
 * cite. Ces tests exercent la contrainte telle qu'un producteur la rencontre :
 * par une insertion SQL incomplète, qui doit être refusée.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closePools, query } from "../src/db.js";
import { ligneObjectifPreuve, verifierDeclarationObjectifPreuve } from "../src/collecte/objectif.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const MESURE_OBJECTIF = {
  verificationsOk: 7,
  verificationsTotal: 7,
  sansPreuve: 0,
};
const LIGNE_OBJECTIF =
  "OBJECTIF : atteint — 7/7 vérifications de la chaîne de preuve, 0 événements sans preuve sur 30 jours / 7/7 vérifications, 0 sans preuve";

const TAG = `proof${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const next = () => `${TAG}-${++seq}`;
const createdEvents: string[] = [];
const createdRuns: number[] = [];

after(async () => {
  if (createdEvents.length > 0) {
    await supprimerEvenementsArchivees("dedup_key = ANY($1::text[])", [createdEvents]).catch(() => {});
  }
  // Les runs cités ne peuvent partir qu'après leurs événements.
  for (const runId of createdRuns) {
    await query("DELETE FROM collector_run WHERE id=$1", [runId]).catch(() => {});
  }
  await closePools();
});

async function newRun(sourceId = "ransomlook"): Promise<number> {
  const { rows } = await query<{ id: string }>(
    "INSERT INTO collector_run (source_id, status, kind) VALUES ($1, 'ok', 'live') RETURNING id",
    [sourceId],
  );
  const id = Number(rows[0]?.id);
  createdRuns.push(id);
  return id;
}

function insertEvent(fields: {
  dedupKey: string;
  sourceUrl?: string | null;
  evidence?: Record<string, unknown>;
}): Promise<unknown> {
  createdEvents.push(fields.dedupKey);
  return query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at,
                        source_id, source_url, evidence)
     VALUES ($1, 'cti', 'ambient_signal', $2, now(), 'ransomlook', $3, $4::jsonb)`,
    [fields.dedupKey, "Preuve de test", fields.sourceUrl ?? null, JSON.stringify(fields.evidence ?? {})],
  );
}

type PgError = { code?: string; constraint?: string; message?: string };

async function rejection(promise: Promise<unknown>): Promise<PgError> {
  try {
    await promise;
  } catch (error) {
    return error as PgError;
  }
  assert.fail("l'insertion incomplète aurait dû être rejetée");
}

test("les deux CHECK de preuve existent sur event", async () => {
  const { rows } = await query<{ conname: string }>(
    `SELECT conname FROM pg_constraint
      WHERE conrelid = 'event'::regclass AND contype = 'c'
        AND conname IN ('event_source_url_required', 'event_run_id_required')
      ORDER BY conname`,
  );
  assert.deepEqual(rows.map((r) => r.conname), ["event_run_id_required", "event_source_url_required"]);
});

test("un événement sans source_url est rejeté", async () => {
  const err = await rejection(insertEvent({
    dedupKey: next(),
    sourceUrl: null,
    evidence: { run_id: "1" },
  }));
  assert.equal(err.code, "23514");
  assert.equal(err.constraint, "event_source_url_required");
});

test("une source_url vide est rejetée", async () => {
  const err = await rejection(insertEvent({
    dedupKey: next(),
    sourceUrl: "   ",
    evidence: { run_id: "1" },
  }));
  assert.equal(err.code, "23514");
});

test("un événement sans run_id est rejeté", async () => {
  const err = await rejection(insertEvent({
    dedupKey: next(),
    sourceUrl: "https://example.invalid/proof",
    evidence: { feed: "sans run" },
  }));
  // Le trigger de résolution tranche avant les CHECK : même code, message plus
  // précis que la contrainte déclarative seule.
  assert.equal(err.code, "23514");
  assert.match(String(err.message), /evidence\.run_id/);
});

test("un run_id qui ne résout pas dans collector_run est rejeté", async () => {
  const err = await rejection(insertEvent({
    dedupKey: next(),
    sourceUrl: "https://example.invalid/proof",
    evidence: { run_id: "999999999" },
  }));
  assert.equal(err.code, "23503");
});

test("une preuve complète est acceptée, citée, et son run est protégé", async () => {
  const runId = await newRun();
  const dedupKey = next();
  await insertEvent({
    dedupKey,
    sourceUrl: "https://example.invalid/proof/complete",
    evidence: { run_id: String(runId), feed: "Preuve de test" },
  });

  const { rows } = await query<{ run_id: string; source_url: string }>(
    "SELECT evidence->>'run_id' AS run_id, source_url FROM event WHERE dedup_key=$1",
    [dedupKey],
  );
  assert.equal(rows[0]?.run_id, String(runId));
  assert.equal(rows[0]?.source_url, "https://example.invalid/proof/complete");

  const { rows: resolution } = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM collector_run WHERE id = $1::bigint",
    [rows[0]?.run_id],
  );
  assert.equal(resolution[0]?.n, 1);

  // La preuve ne peut pas disparaître sous l'événement qui s'en réclame.
  const err = await rejection(query("DELETE FROM collector_run WHERE id=$1", [runId]));
  assert.equal(err.code, "23503");

  await supprimerEvenementsArchivees("dedup_key = $1", [dedupKey]);
  await query("DELETE FROM collector_run WHERE id=$1", [runId]);
  createdEvents.splice(createdEvents.indexOf(dedupKey), 1);
  createdRuns.splice(createdRuns.indexOf(runId), 1);
});

test("critère : aucun événement des 30 derniers jours sans preuve", async () => {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM event
      WHERE at >= now() - interval '30 days'
        AND (source_url IS NULL OR evidence->>'run_id' IS NULL)`,
  );
  assert.equal(rows[0]?.n, 0);
});

test("objectif : la mesure produit la ligne déclarée", () => {
  assert.equal(ligneObjectifPreuve(MESURE_OBJECTIF), LIGNE_OBJECTIF);
});

test("rapport : la ligne OBJECTIF mesurée est déclarée une seule fois", () => {
  const rapport = readFileSync(new URL("../../../docs/chaine-de-preuve.md", import.meta.url), "utf8");
  assert.equal(verifierDeclarationObjectifPreuve(rapport, LIGNE_OBJECTIF), true);
  assert.equal(verifierDeclarationObjectifPreuve(rapport, "OBJECTIF : atteint — 1 / 1"), false);
});
