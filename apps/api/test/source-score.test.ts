/**
 * `source_score` : une ligne par source active, classée par fraîcheur,
 * rendement et taux d'erreur.
 *
 * Le piège couvert ici est celui de l'ancien écran « sources » : une source
 * qui répond (last_ok_at récent) sans produire le moindre item restait
 * affichée comme saine. Toute source fraîche sans rendement doit donc être
 * marquée muette.
 *
 * Le recalcul est vérifié sur l'instantané : deux appels successifs de
 * refresh_source_score() doivent laisser exactement les mêmes lignes, et
 * rejouer la migration ne doit rien changer à la vue.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../src/db.js";

const TAG = `ss${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  productive: `${TAG}-productive`,
  vide: `${TAG}-vide`,
  jamais: `${TAG}-jamais`,
  dormante: `${TAG}-dormante`,
  inactive: `${TAG}-inactive`,
};
const MIGRATION = fileURLToPath(new URL("../../../db/migrate-200-source-score.sql", import.meta.url));

type Score = {
  source_id: string;
  fraicheur: string;
  runs_30d: number;
  errors_30d: number;
  items_in_30d: string;
  yield_30d: string;
  taux_erreur: string | null;
  muette: boolean;
  score: number;
  classement: string;
};

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, enabled, last_ok_at)
     VALUES ($1, 'productive (test)', 'cti', 'https://exemple.invalid/p', true, now()),
            ($2, 'vide (test)', 'cti', 'https://exemple.invalid/v', true, now()),
            ($3, 'jamais (test)', 'cti', 'https://exemple.invalid/j', true, NULL),
            ($4, 'dormante (test)', 'cti', 'https://exemple.invalid/d', true, now() - interval '40 days'),
            ($5, 'inactive (test)', 'cti', 'https://exemple.invalid/i', false, now())`,
    [IDS.productive, IDS.vide, IDS.jamais, IDS.dormante, IDS.inactive],
  );

  await query(
    `INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new, error)
     VALUES ($1, now() - interval '2 days', now() - interval '2 days' + interval '1 minute', 'ok', 10, 2, NULL),
            ($1, now() - interval '1 day', now() - interval '1 day' + interval '1 minute', 'error', 10, 0, 'panne test'),
            ($1, now() - interval '3 hours', now() - interval '3 hours' + interval '1 minute', 'ok', 10, 3, NULL),
            ($2, now() - interval '4 hours', now() - interval '4 hours' + interval '1 minute', 'ok', 12, 0, NULL),
            ($3, now() - interval '4 hours', now() - interval '4 hours' + interval '1 minute', 'ok', 5, 7, NULL),
            ($4, now() - interval '25 days', now() - interval '25 days' + interval '1 minute', 'ok', 4, 1, NULL),
            ($4, now() - interval '20 days', now() - interval '20 days' + interval '1 minute', 'ok', 3, 1, NULL)`,
    [IDS.productive, IDS.vide, IDS.inactive, IDS.dormante],
  );
});

after(async () => {
  await query("DELETE FROM source_score_snapshot WHERE source_id = ANY($1)", [Object.values(IDS)]);
  await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [Object.values(IDS)]);
  await query("DELETE FROM source WHERE id = ANY($1)", [Object.values(IDS)]);
  await closePools();
});

async function scoresTaggues(): Promise<Map<string, Score>> {
  const res = await query<Score>(
    `SELECT source_id, fraicheur, runs_30d, errors_30d, items_in_30d, yield_30d,
            taux_erreur, muette, score, classement
     FROM source_score WHERE source_id = ANY($1) ORDER BY source_id`,
    [Object.values(IDS)],
  );
  return new Map(res.rows.map((row) => [row.source_id, row]));
}

test("la vue couvre exactement les sources actives", async () => {
  const res = await query<{ vue: string; actives: string }>(
    `SELECT (SELECT count(*) FROM source_score)::text AS vue,
            (SELECT count(*) FROM source WHERE enabled)::text AS actives`,
  );
  assert.equal(res.rows[0].vue, res.rows[0].actives);
});

test("une source fraîche sans rendement est marquée muette", async () => {
  const res = await query<{ coupables: string }>(
    `SELECT count(*)::text AS coupables FROM source_score
     WHERE last_ok_at > now() - interval '7 days'
       AND yield_30d < 1 AND muette IS NOT TRUE`,
  );
  assert.equal(res.rows[0].coupables, "0");
});

test("le score distingue productive, muette, dormante et jamais tentée", async () => {
  const scores = await scoresTaggues();

  const productive = scores.get(IDS.productive);
  assert.ok(productive);
  assert.equal(productive.fraicheur, "fraiche");
  assert.equal(productive.runs_30d, 3);
  assert.equal(productive.errors_30d, 1);
  assert.equal(productive.items_in_30d, "30");
  assert.equal(productive.yield_30d, "5");
  assert.equal(productive.taux_erreur, "0.3333");
  assert.equal(productive.muette, false);
  assert.equal(productive.score, 68);
  assert.equal(productive.classement, "fragile");

  const vide = scores.get(IDS.vide);
  assert.ok(vide);
  assert.equal(vide.yield_30d, "0");
  assert.equal(vide.muette, true);
  assert.equal(vide.classement, "muette");

  const jamais = scores.get(IDS.jamais);
  assert.ok(jamais);
  assert.equal(jamais.fraicheur, "jamais");
  assert.equal(jamais.runs_30d, 0);
  assert.equal(jamais.taux_erreur, null);
  assert.equal(jamais.muette, true);

  const dormante = scores.get(IDS.dormante);
  assert.ok(dormante);
  assert.equal(dormante.fraicheur, "dormante");
  assert.equal(dormante.yield_30d, "2");
  assert.equal(dormante.muette, false, "une source qui produit encore n'est pas muette");
  assert.equal(dormante.classement, "dormante");

  assert.equal(scores.has(IDS.inactive), false, "une source désactivée n'a pas de score");
});

test("le recalcul est idempotent, y compris en rejouant la migration", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  const avant = await scoresTaggues();

  await query(sql);
  await query(sql);
  assert.deepEqual(await scoresTaggues(), avant, "rejouer la migration ne change pas la vue");

  const premier = await query<{ total: number }>("SELECT refresh_source_score() AS total");
  const second = await query<{ total: number }>("SELECT refresh_source_score() AS total");
  assert.equal(premier.rows[0].total, second.rows[0].total);

  const snapshots = await query<Score>(
    `SELECT source_id, fraicheur, runs_30d, errors_30d, items_in_30d, yield_30d,
            taux_erreur, muette, score, classement
     FROM source_score_snapshot ORDER BY source_id`,
  );
  const apres = new Map(snapshots.rows.map((row) => [row.source_id, row]));
  for (const [id, score] of avant) {
    assert.deepEqual(apres.get(id), score, `instantané périmé pour ${id}`);
  }
  assert.equal(new Set(snapshots.rows.map((row) => row.source_id)).size, snapshots.rows.length);
});
