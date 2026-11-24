/**
 * Précision des sources : la table `source_precision` doit séparer le bruit
 * revu des faits admis. Le juge exécute la requête brute ci-dessous ; un test
 * dédié prouve en plus qu'une source à 90 % de rejets descend sous 0,3.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../src/db.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `sp${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  bruyante: `${TAG}-bruyante`,
  propre: `${TAG}-propre`,
  ancienne: `${TAG}-ancienne`,
};
const SOURCES = Object.values(IDS);
const MIGRATION = fileURLToPath(new URL("../../../db/migrate-215-source-precision.sql", import.meta.url));

const JUGE = "SELECT source_id, precision_30d FROM source_precision WHERE revues_30d >= 20";

type Precision = {
  source_id: string;
  revues_30d: number;
  rejets_30d: number;
  valides_30d: number;
  precision_30d: string;
};

/** 20 décisions : `admis` faits admis (promus + événements), le reste rejeté. */
async function semer(id: string, admis: number, ancien = false): Promise<void> {
  const quand = ancien ? "now() - interval '45 days'" : "now() - interval '2 hours'";
  await query(
    `INSERT INTO quarantine_raw (
       source, source_url, content_hash, status, promoted, promoted_at, promoted_by,
       received_at, extracted
     )
     SELECT $1::text,
            format('https://example.invalid/precision/%s/%s', $1::text, n),
            format('precision-test:%s:%s', $1::text, n),
            CASE WHEN n <= $2::integer THEN 'promoted' ELSE 'rejected' END,
            n <= $2::integer,
            CASE WHEN n <= $2::integer THEN ${quand} END,
            CASE WHEN n <= $2::integer THEN 'test:precision' END,
            ${quand},
            jsonb_build_object(
              '_review',
              jsonb_build_array(
                jsonb_build_object(
                  'at', ${quand}, 'by', 'test:precision',
                  'action', CASE WHEN n <= $2::integer THEN 'promote' ELSE 'reject' END,
                  'reason', NULL
                )
              )
            )
     FROM generate_series(1, 20) AS n
     ON CONFLICT (source, content_hash) DO NOTHING`,
    [id, admis],
  );
  await query(
    `INSERT INTO event (
       dedup_key, family, assertion_type, title, observed_at, valid_at, at, collected_at,
       severity, source_id, source_url, evidence
     )
     SELECT format('precision-test:%s:%s', $1::text, n),
            'cti', 'confirmed_incident', 'Fait synthétique de test',
            ${quand}, ${quand}, ${quand}, ${quand}, 3, $1::text,
            format('https://example.invalid/precision/%s/%s', $1::text, n),
            jsonb_build_object(
              'run_id',
              (SELECT cr.id FROM collector_run cr
               WHERE cr.source_id = $1::text AND cr.kind = 'backfill'
               ORDER BY cr.id LIMIT 1)::text
            )
     FROM generate_series(1, $2::integer) AS n
     ON CONFLICT (dedup_key) DO NOTHING`,
    [id, admis],
  );
}

async function mesures(): Promise<Map<string, Precision>> {
  const res = await query<Precision>(
    `SELECT source_id, revues_30d, rejets_30d, valides_30d, precision_30d
     FROM source_precision WHERE source_id = ANY($1) ORDER BY source_id`,
    [SOURCES],
  );
  return new Map(res.rows.map((row) => [row.source_id, row]));
}

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url)
     VALUES ($1, 'bruyante (test)', 'cti', 'https://example.invalid/precision/bruyante'),
            ($2, 'propre (test)', 'cti', 'https://example.invalid/precision/propre'),
            ($3, 'ancienne (test)', 'cti', 'https://example.invalid/precision/ancienne')`,
    SOURCES,
  );
  await query(
    `INSERT INTO collector_run (source_id, status, kind)
     VALUES ($1, 'ok', 'backfill'), ($2, 'ok', 'backfill'), ($3, 'ok', 'backfill')`,
    SOURCES,
  );
  await semer(IDS.bruyante, 2);
  await semer(IDS.propre, 18);
  await semer(IDS.ancienne, 2, true);
  await query("SELECT refresh_source_precision()");
});

after(async () => {
  await supprimerEvenementsArchivees("source_id = ANY($1)", [SOURCES]);
  await query("DELETE FROM quarantine_raw WHERE source = ANY($1)", [SOURCES]);
  await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [SOURCES]);
  await query("DELETE FROM registre_traitement WHERE source_id = ANY($1)", [SOURCES]);
  await query("DELETE FROM source WHERE id = ANY($1)", [SOURCES]);
  await closePools();
});

test("critère du juge : au moins 15 sources évaluées sur 30 jours", async () => {
  const { rows } = await query<{ source_id: string; precision_30d: string }>(JUGE);
  assert.ok(rows.length >= 15, `${JUGE} → ${rows.length} source(s), attendu >= 15`);
  for (const row of rows) {
    assert.ok(Number(row.precision_30d) >= 0 && Number(row.precision_30d) <= 1);
  }
  const ids = new Set(rows.map((row) => row.source_id));
  assert.ok(ids.has(IDS.bruyante) && ids.has(IDS.propre));
});

test("une source à 90 % de rejets descend sous 0,3", async () => {
  const mesuresTagguees = await mesures();
  const bruyante = mesuresTagguees.get(IDS.bruyante);
  assert.ok(bruyante, "la source bruyante est évaluée");
  assert.equal(bruyante.rejets_30d, 18);
  assert.equal(bruyante.valides_30d, 2);
  assert.equal(bruyante.revues_30d, 20, "un fait promu ne compte pas deux fois");
  assert.ok(
    Number(bruyante.precision_30d) < 0.3,
    `précision bruyante ${bruyante.precision_30d} doit être < 0,3`,
  );

  const propre = mesuresTagguees.get(IDS.propre);
  assert.ok(propre, "la source fiable est évaluée");
  assert.equal(propre.revues_30d, 20);
  assert.ok(Number(propre.precision_30d) > 0.7, `précision propre ${propre.precision_30d}`);
  assert.ok(Number(propre.precision_30d) > Number(bruyante.precision_30d));
});

test("les décisions hors des 30 jours ne comptent pas", async () => {
  const mesuresTagguees = await mesures();
  assert.equal(mesuresTagguees.has(IDS.ancienne), false, "45 jours : aucune revue dans la fenêtre");
});

test("un événement classé faux n'est pas un fait admis", async () => {
  const avant = (await mesures()).get(IDS.bruyante);
  assert.ok(avant);
  const evenement = await query<{ id: string }>(
    "SELECT id FROM event WHERE source_id = $1 ORDER BY id LIMIT 1",
    [IDS.bruyante],
  );
  const id = evenement.rows[0]?.id;
  assert.ok(id, "un événement de la source bruyante existe");
  await query("INSERT INTO false_event (event_id, reason) VALUES ($1, 'bruit détecté (test)')", [id]);
  try {
    await query("SELECT refresh_source_precision()");
    const apres = (await mesures()).get(IDS.bruyante);
    assert.ok(apres);
    assert.equal(apres.valides_30d, avant.valides_30d - 1);
    assert.equal(apres.revues_30d, avant.revues_30d - 1);
    assert.ok(Number(apres.precision_30d) < Number(avant.precision_30d));
  } finally {
    await query("DELETE FROM false_event WHERE event_id = $1", [id]);
    await query("SELECT refresh_source_precision()");
  }
});

test("rejouer la migration et le recalcul laisse les mêmes mesures", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  const avant = await query<Precision>(
    `SELECT source_id, revues_30d, rejets_30d, valides_30d, precision_30d
     FROM source_precision ORDER BY source_id`,
  );
  await query(sql);
  await query(sql);
  await query("SELECT refresh_source_precision()");
  await query("SELECT refresh_source_precision()");
  const apres = await query<Precision>(
    `SELECT source_id, revues_30d, rejets_30d, valides_30d, precision_30d
     FROM source_precision ORDER BY source_id`,
  );
  assert.deepEqual(apres.rows, avant.rows);
});
