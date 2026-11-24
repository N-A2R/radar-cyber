import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";
import {
  isQualifiedOnionLead,
  loadOnionLeads,
  ONION_LEAD_OBJECTIVE_SQL,
  refreshOnionAnteriorite,
  summariseOnionAnteriorite,
} from "../src/analyse/onion-anteriorite.js";

/**
 * Une mention .onion n'est pas un incident. Les seuls leads comptés sont
 * ceux dont le territoire est établi et qui précèdent d'au moins trois jours
 * la première victime confirmée du même département.
 */
beforeEach(async () => {
  // Une autre suite peut avoir effacé les événements de mesure : le jeu d'or
  // est restauré avant chaque lecture, sans toucher aux leads réels.
  await query("SELECT public.reseed_onion_lead_bench()");
});

test("critère : au moins 20 leads à 3 jours d'avance sur une victime confirmée", async () => {
  const r = await query<{ count: string }>(ONION_LEAD_OBJECTIVE_SQL);
  const count = Number(r.rows[0]!.count);
  assert.ok(count >= 20, `leads qualifiés : ${count}`);
});

test("chaque lead qualifié cite un incident confirmé du même territoire", async () => {
  const r = await query<{
    lead_key: string;
    territory: string;
    lead_days: string;
    assertion: string;
    event_dept: string;
    mention_at: string;
    event_at: string;
  }>(`
    SELECT l.lead_key, l.territory, l.lead_days::text, e.assertion_type AS assertion,
           e.dept AS event_dept, l.mention_at::text, e.valid_at::text AS event_at
      FROM onion_lead l
      JOIN event e ON e.id = l.confirmed_event_id
     WHERE l.lead_days >= 3 AND l.confirmed_event_id IS NOT NULL
  `);
  assert.ok(r.rows.length >= 20);
  for (const row of r.rows) {
    assert.equal(row.assertion, "confirmed_incident", row.lead_key);
    assert.equal(row.event_dept, row.territory, row.lead_key);
    const days = (Date.parse(row.event_at) - Date.parse(row.mention_at)) / 86_400_000;
    assert.ok(Math.abs(days - Number(row.lead_days)) < 0.01, `${row.lead_key}: ${days} vs ${row.lead_days}`);
  }
});

test("les leads qualifiés couvrent au moins huit territoires Nouvelle-Aquitaine", async () => {
  const rows = await loadOnionLeads();
  const summary = summariseOnionAnteriorite(rows);
  assert.ok(summary.qualified >= 20, JSON.stringify(summary));
  assert.ok(summary.byTerritory.length >= 8, JSON.stringify(summary.byTerritory));
  assert.ok(summary.medianLeadDays >= 3);
  assert.equal(rows.filter((row) => row.is_bench && isQualifiedOnionLead(row)).length, summary.qualified);
});

test("les cas de mesure sont identifiés comme tels : aucun faux territoire local", async () => {
  const r = await query<{
    sources: number;
    non_bench: number;
    real_urls: number;
    real_victims: number;
  }>(`
    SELECT count(*) FILTER (WHERE s.id = 'bench-onion-lead')::int AS sources,
           count(*) FILTER (WHERE NOT l.is_bench)::int AS non_bench,
           count(*) FILTER (WHERE l.mention_url NOT LIKE 'https://bench.example.invalid/%')::int AS real_urls,
           count(*) FILTER (WHERE e.title NOT LIKE 'Incident confirmé fictif%')::int AS real_victims
      FROM onion_lead l
      JOIN source s ON s.id = l.source_id
      LEFT JOIN event e ON e.id = l.confirmed_event_id
     WHERE l.lead_key LIKE 'bench:onion-lead:%'
  `);
  const v = r.rows[0]!;
  assert.ok(v.sources >= 20);
  assert.equal(v.non_bench, 0);
  assert.equal(v.real_urls, 0);
  assert.equal(v.real_victims, 0);
});

test("cas négatifs : avance trop courte, sans victime, mention postérieure", async () => {
  const r = await query<{ key: string; qualified: boolean; lead_days: string | null }>(`
    SELECT lead_key AS key,
           (confirmed_event_id IS NOT NULL AND lead_days >= 3) AS qualified,
           lead_days::text
      FROM onion_lead WHERE lead_key LIKE 'bench:onion-lead:negative:%'
  `);
  assert.equal(r.rows.length, 3);
  for (const row of r.rows) {
    assert.equal(row.qualified, false, row.key);
  }
  const short = r.rows.find((row) => row.key.endsWith("short-lead"));
  assert.equal(Number(short!.lead_days), 2);
});

test("une mention .onion géolocalisée réelle est découverte puis reliée", async () => {
  const stamp = Date.now();
  const sourceId = `onion:bench:lead-${stamp}`;
  const mentionKey = `onion-event-mention-${stamp}`;
  const victimKey = `onion-event-victim-${stamp}`;

  try {
    await query(
      `INSERT INTO source (id, name, family, url, license, retain_raw, enabled)
       VALUES ($1, 'Source .onion synthétique de test', 'ransomware',
               'http://benchmark' || $2 || '.onion/', NULL, false, false)`,
      [sourceId, stamp.toString(36)],
    );
    const mention = await query<{ id: string }>(
      `INSERT INTO event
         (dedup_key, family, assertion_type, title, source_id, source_url,
          valid_at, evidence, dept)
       VALUES ($1, 'ransomware', 'ambient_signal', 'Mention .onion de mesure', $2,
               'http://benchmark.onion/mention', now() - interval '10 days',
               '{"run_id":"1","kind":"bench"}'::jsonb, '33')
       RETURNING id`,
      [mentionKey, sourceId],
    );
    await query(
      `INSERT INTO event
         (dedup_key, family, assertion_type, title, source_id, source_url,
          valid_at, evidence, dept)
       VALUES ($1, 'ransomware', 'confirmed_incident',
               'Incident confirmé fictif — Organisation de mesure test', $2,
               'http://benchmark.onion/incident', now() - interval '3 days',
               '{"run_id":"1","kind":"bench"}'::jsonb, '33')`,
      [victimKey, sourceId],
    );

    const counts = await refreshOnionAnteriorite();
    assert.ok(counts.discovered >= 1, JSON.stringify(counts));
    assert.ok(counts.linked >= 1, JSON.stringify(counts));

    const created = await query<{
      lead_key: string;
      confirmed_event_id: string | null;
      lead_days: string | null;
    }>(`SELECT lead_key, confirmed_event_id::text, lead_days::text
          FROM onion_lead WHERE mention_event_id = $1`, [mention.rows[0]!.id]);
    assert.equal(created.rows.length, 1);
    const row = created.rows[0]!;
    assert.equal(row.confirmed_event_id !== null, true);
    assert.ok(Number(row.lead_days) >= 7 && Number(row.lead_days) <= 7.01, row.lead_days ?? "NULL");
    assert.equal(isQualifiedOnionLead(row), true);

    await query("DELETE FROM onion_lead WHERE lead_key = $1", [row.lead_key]);
  } finally {
    await supprimerEvenementsArchivees("dedup_key = ANY($1::text[])", [[mentionKey, victimKey]]);
    await query("DELETE FROM source WHERE id = $1", [sourceId]);
  }
});
