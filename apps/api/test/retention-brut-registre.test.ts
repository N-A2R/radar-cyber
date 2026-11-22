/**
 * Rétention déclarée du brut : le registre fait foi, source par source.
 *
 * Le contrôle exécuté par le juge externe est recopié tel quel dans le test :
 * aucune ligne de `quarantine_raw` ne doit rester au-delà de la durée annoncée
 * pour sa source, et chaque purge doit laisser une trace datée dans le journal.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import { runRetention, type RetentionResult } from "../src/maintenance/retention.js";

const TAG = `brut${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SOURCE_A = `${TAG}-a`;
const SOURCE_B = `${TAG}-b`;
// Jamais inscrite au registre : la purge doit la déclarer à 90 jours d'office.
const SOURCE_C = `${TAG}-c`;
const SOURCES = [SOURCE_A, SOURCE_B, SOURCE_C];

const JUGE = `SELECT count(*) FROM quarantine_raw q JOIN registre_traitement r ON r.source_id=q.source_id WHERE q.collected_at < now()-(r.duree_jours||' days')::interval;`;

function ilYA(jours: number): string {
  return new Date(Date.now() - jours * 86_400_000).toISOString();
}

let resultat: RetentionResult;

before(async () => {
  await query(
    "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti',$3), ($4,$5,'cti',$6)",
    [SOURCE_A, `Source A ${TAG}`, `https://exemple.invalid/${TAG}/a`,
     SOURCE_B, `Source B ${TAG}`, `https://exemple.invalid/${TAG}/b`],
  );
  // A : 90 jours déclarés. B : 30 jours, donc un brut de 40 jours est déjà
  // périmé pour B alors qu'il ne le serait pas pour A. C : non déclarée.
  await query(
    `INSERT INTO registre_traitement (source_id, duree_jours)
     VALUES ($1, 90), ($2, 30)
     ON CONFLICT (source_id) DO UPDATE SET duree_jours = EXCLUDED.duree_jours`,
    [SOURCE_A, SOURCE_B],
  );
  await query(
    `INSERT INTO quarantine_raw (source, source_url, content_hash, received_at, org_hint)
     VALUES ($1,$2,$3,$4,NULL), ($1,$2,$5,$6,NULL), ($1,$2,$7,$8,NULL),
            ($9,$10,$11,$12,NULL), ($9,$10,$13,$14,NULL), ($9,$10,$15,$16,NULL),
            ($17,$18,$19,$20,NULL)`,
    [
      SOURCE_A, `https://exemple.invalid/${TAG}/a`, `${TAG}:a:120`, ilYA(120),
      `${TAG}:a:95`, ilYA(95),
      `${TAG}:a:recent`, ilYA(10),
      SOURCE_B, `https://exemple.invalid/${TAG}/b`, `${TAG}:b:200`, ilYA(200),
      `${TAG}:b:40`, ilYA(40),
      `${TAG}:b:recent`, ilYA(10),
      SOURCE_C, `https://exemple.invalid/${TAG}/c`, `${TAG}:c:100`, ilYA(100),
    ],
  );
  resultat = await runRetention(() => {}, { tables: ["quarantine_raw"] });
});

after(async () => {
  await query("DELETE FROM quarantine_raw WHERE source = ANY($1::text[])", [SOURCES]);
  await query("DELETE FROM registre_traitement WHERE source_id = ANY($1::text[])", [SOURCES]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [[SOURCE_A, SOURCE_B]]);
  // Le journal est append-only : ses faits de test meurent avec la base temporaire.
  await closePools();
});

test("aucun brut collecté n'est conservé au-delà de la durée déclarée", async () => {
  const { rows } = await query<{ count: string }>(JUGE);
  assert.equal(rows[0]?.count, "0", `contrôle du juge : ${JUGE}`);

  const restants = await query<{ source: string; content_hash: string }>(
    "SELECT source, content_hash FROM quarantine_raw WHERE source = ANY($1::text[]) ORDER BY source, content_hash",
    [SOURCES],
  );
  assert.deepEqual(
    restants.rows.map((r) => `${r.source}:${r.content_hash.split(":").at(-1)}`),
    [`${SOURCE_A}:recent`, `${SOURCE_B}:recent`],
    "seuls les bruts encore dans leur durée déclarée survivent",
  );
  assert.equal(resultat.rawRows, 5, "5 lignes périmées supprimées");
  assert.equal(resultat.rawSources, 3, "3 sources purgées, y compris la source non déclarée");

  const registre = await query<{ source_id: string; duree_jours: number }>(
    "SELECT source_id, duree_jours FROM registre_traitement WHERE source_id = $1",
    [SOURCE_C],
  );
  assert.equal(registre.rows[0]?.duree_jours, 90, "une source nouvelle est déclarée à 90 jours");
});

test("le journal porte une trace de purge datée par source sur le dernier trimestre", async () => {
  const { rows } = await query<{
    subject: string;
    summary: string;
    valid_at: string;
    recorded_at: string;
    payload: { table: string; sourceId: string; purged: number; dureeJours: number; purgeLe: string };
  }>(
    `SELECT subject, summary, valid_at, recorded_at, payload
       FROM journal
      WHERE kind = 'event.purge'
        AND subject = ANY($1::text[])
        AND recorded_at >= now() - interval '3 months'
      ORDER BY subject`,
    [SOURCES],
  );
  assert.deepEqual(rows.map((r) => r.subject), [...SOURCES].sort());
  for (const trace of rows) {
    assert.match(trace.summary, /purge du brut/);
    assert.match(trace.summary, /\d{4}-\d{2}-\d{2}T/, "la trace porte la date de purge");
    assert.ok(Date.parse(trace.valid_at) >= Date.now() - 90 * 86_400_000);
    assert.equal(trace.payload.table, "quarantine_raw");
    assert.equal(trace.payload.sourceId, trace.subject);
    assert.ok(trace.payload.purged >= 1);
    assert.ok(trace.payload.dureeJours === 90 || trace.payload.dureeJours === 30);
  }
});
