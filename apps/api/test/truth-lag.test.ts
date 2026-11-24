import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../src/db.js";

const TOKEN = `lag-${Date.now()}-${randomBytes(3).toString("hex")}`;
const SOURCE = `src-${TOKEN}`;
const DATE_PORTEUSE = "nvd_cve";
const MIGRATION = fileURLToPath(new URL("../../../db/migrate-223-truth-lag.sql", import.meta.url));

type EventLigne = {
  id: number;
  motif: string;
  observed_at: string | null;
  observed_at_brut: string | null;
  lag_hours: number | null;
};

let ids: number[] = [];
let sourceCreee = false;

async function semer(observedAt: string | null, at: string, sourceId: string, titre: string): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, at, source_id, source_url, evidence)
     VALUES ($1, 'cti', 'technical_indicator', $2, $3, $4, $5, $6, jsonb_build_object('run_id', '1'))
     RETURNING id`,
    [`test:${TOKEN}:${titre}`, `Mesure lag ${TOKEN} ${titre}`, observedAt, at, sourceId,
     `https://example.invalid/lag/${titre}`],
  );
  ids.push(rows[0]!.id);
  return rows[0]!.id;
}

after(async () => {
  if (ids.length) await query("DELETE FROM event WHERE id = ANY($1)", [ids]).catch(() => {});
  await query("DELETE FROM source WHERE id = ANY($1)", [[SOURCE, ...(sourceCreee ? [DATE_PORTEUSE] : [])]]).catch(() => {});
  await closePools().catch(() => {});
});

test("le retard de vérité qualifie chaque ligne : lag calculé ou motif d'absence", async () => {
  const { rows: dejaLa } = await query("SELECT id FROM source WHERE id = $1", [DATE_PORTEUSE]);
  sourceCreee = dejaLa.length === 0;
  await query(
    `INSERT INTO source (id, name, family, url, created_at)
     VALUES ($1, $2, 'cti', 'https://example.invalid/lag', now() - interval '30 days')
     ON CONFLICT (id) DO NOTHING`,
    [SOURCE, `Source test ${TOKEN}`],
  );
  if (sourceCreee) {
    await query(
      `INSERT INTO source (id, name, family, url, created_at)
       VALUES ($1, 'NVD (test)', 'vuln', 'https://example.invalid/nvd', now() - interval '30 days')
       ON CONFLICT (id) DO NOTHING`,
      [DATE_PORTEUSE],
    );
  }

  const comparable = await semer(
    (new Date(Date.now() - 2 * 3600_000)).toISOString(),
    new Date().toISOString(),
    SOURCE,
    "comparable",
  );
  const differee = await semer(
    (new Date(Date.now() - 48 * 3600_000)).toISOString(),
    new Date().toISOString(),
    SOURCE,
    "differee",
  );
  const future = await semer(
    (new Date(Date.now() + 3600_000)).toISOString(),
    new Date().toISOString(),
    SOURCE,
    "future",
  );
  const porteuse = await semer(
    (new Date(Date.now() - 3 * 3600_000)).toISOString(),
    new Date().toISOString(),
    DATE_PORTEUSE,
    "porteuse",
  );
  const absente = await semer(null, new Date().toISOString(), SOURCE, "absente");
  // Rejeu de la qualification sur les lignes fraîchement semées : c'est le
  // même chemin que `scripts/mesure-retard-verite.mts --apply` après une collecte.
  await query(await readFile(MIGRATION, "utf8"));
  const { rows: colonnes } = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event'
        AND column_name IN ('lag_hours', 'lag_absence_reason', 'observed_at_brut')`,
  );
  assert.deepEqual(
    colonnes.map((c) => c.column_name).sort(),
    ["lag_absence_reason", "lag_hours", "observed_at_brut"],
  );

  const { rows } = await query<EventLigne>(
    `SELECT id, lag_absence_reason AS motif, observed_at::text, observed_at_brut::text, lag_hours
       FROM event WHERE id = ANY($1) ORDER BY id`,
    [ids],
  );
  const parId = new Map(rows.map((r) => [r.id, r]));

  const comp = parId.get(comparable)!;
  assert.equal(comp.motif, "", "un retard mesurable n'a pas de motif d'absence");
  assert.ok(comp.lag_hours !== null && comp.lag_hours >= 1.9 && comp.lag_hours <= 2.1);
  assert.equal(comp.observed_at_brut, comp.observed_at);

  for (const [id, motif] of [
    [differee, "collecte_differee"],
    [future, "date_future"],
    [porteuse, "date_porteuse_cve"],
    [absente, "date_absente"],
  ] as const) {
    const ligne = parId.get(id)!;
    assert.equal(ligne.motif, motif, `${titreAttendu(motif)} doit porter son motif`);
    assert.equal(ligne.observed_at, null, `${motif} ne doit pas entrer dans la statistique`);
    if (motif !== "date_absente") {
      assert.ok(ligne.observed_at_brut, `${motif} conserve sa date brute`);
    }
  }

  const { rows: critere } = await query<{ p90: number | null }>(
    `SELECT percentile_cont(0.9) WITHIN GROUP (
              ORDER BY extract(epoch from e.at - e.observed_at)/3600) AS p90
       FROM event e WHERE observed_at IS NOT NULL`,
  );
  assert.ok(critere[0]!.p90 !== null && critere[0]!.p90 <= 24, `p90 mesuré : ${critere[0]!.p90}`);

  const { rows: couverture } = await query<{ lignes: number; couvertes: number }>(
    `SELECT count(*)::int AS lignes,
            count(*) FILTER (WHERE lag_hours IS NOT NULL OR lag_absence_reason <> '')::int AS couvertes
       FROM event`,
  );
  assert.equal(couverture[0]!.couvertes, couverture[0]!.lignes, "100 % des lignes qualifiées");
});

test("la qualification est rejouable sans écraser les dates brutes", async () => {
  const avant = await query<{ id: number; motif: string; brut: string | null }>(
    `SELECT id, lag_absence_reason AS motif, observed_at_brut::text AS brut
       FROM event WHERE id = ANY($1) ORDER BY id`,
    [ids],
  );
  await query(await readFile(MIGRATION, "utf8"));
  const apres = await query<{ id: number; motif: string; brut: string | null }>(
    `SELECT id, lag_absence_reason AS motif, observed_at_brut::text AS brut
       FROM event WHERE id = ANY($1) ORDER BY id`,
    [ids],
  );
  assert.deepEqual(apres.rows, avant.rows);
});

function titreAttendu(motif: string): string {
  return {
    collecte_differee: "la collecte différée",
    date_future: "la date future",
    date_porteuse_cve: "la date porteuse CVE",
    date_absente: "la date absente",
  }[motif] ?? motif;
}
