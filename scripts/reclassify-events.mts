/**
 * Reclasse en `presse` les événements qui ne parlent pas de cyber.
 *
 * Constat mesuré (2026-11-10) : sur 7 251 événements, la famille `cti` en
 * contient 2 129 dont 8,8 % seulement mentionnent un terme cyber ; les autres
 * sont de la presse régionale agrégée sous une étiquette cyber parce que la
 * source a été déclarée cyber. La porte `collectors/classify.ts` corrige les
 * collectes futures ; ce script applique la même règle à l'historique.
 *
 * Garanties :
 *   - `--dry-run` par défaut : la transaction complète est exécutée puis
 *     annulée, rien ne persiste.
 *   - `--apply` : copie chaque ligne visée dans `event_reclass_archive`
 *     (ligne complète en jsonb) puis bascule `family` en une transaction.
 *   - Les familles `ransomware` et `cert_fr` ne sont jamais modifiées, ni les
 *     sources de l'allowlist cyber. Aucune ligne n'est supprimée.
 *
 * Usage : pnpm exec tsx scripts/reclassify-events.mts [--apply]
 */
import { closePools, withClient } from "../apps/api/src/db.js";
import { classifyFamily, isFamily, type Family } from "../apps/api/src/collectors/classify.js";

const APPLY = process.argv.includes("--apply");
const PROTECTED: readonly string[] = ["ransomware", "cert_fr"];

interface EventRow {
  id: string;
  family: string;
  title: string;
  summary: string | null;
  source_id: string;
  source_name: string;
}

const ARCHIVE_DDL = `
CREATE TABLE IF NOT EXISTS event_reclass_archive (
  event_id   bigint PRIMARY KEY,
  old_family text   NOT NULL,
  new_family text   NOT NULL,
  source_id  text   NOT NULL,
  row_data   jsonb  NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
)`;

async function distribution(client: import("pg").PoolClient): Promise<Map<string, number>> {
  const res = await client.query<{ family: string; n: string }>(
    "SELECT family, count(*)::text AS n FROM event GROUP BY family ORDER BY family"
  );
  return new Map(res.rows.map((r) => [r.family, Number(r.n)]));
}

function showDistribution(label: string, dist: Map<string, number>): void {
  const parts = [...dist.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${f}=${n}`);
  console.log(`${label} : ${parts.join("  ")}`);
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  await withClient(async (client) => {
    const { rows } = await client.query<EventRow>(
      `SELECT e.id::text AS id, e.family, e.title, e.summary, e.source_id, s.name AS source_name
         FROM event e JOIN source s ON s.id = e.source_id
        ORDER BY e.id`
    );

    const targets: Array<{ id: string; oldFamily: Family; sourceId: string }> = [];
    for (const row of rows) {
      if (PROTECTED.includes(row.family)) continue;
      if (!isFamily(row.family)) continue;
      const next = classifyFamily({
        title: row.title,
        summary: row.summary,
        sourceFamily: row.family,
        sourceName: row.source_name,
      });
      if (next !== row.family) targets.push({ id: row.id, oldFamily: row.family, sourceId: row.source_id });
    }

    console.log(`scannés : ${rows.length} événement(s), visés : ${targets.length}`);
    if (targets.length === 0) {
      console.log("rien à reclasser");
      return;
    }

    const before = await distribution(client);
    const after = new Map(before);
    const families = new Set(targets.map((t) => t.oldFamily));
    for (const f of families) {
      const moved = targets.filter((t) => t.oldFamily === f).length;
      after.set(f, (after.get(f) ?? 0) - moved);
      after.set("presse", (after.get("presse") ?? 0) + moved);
    }
    showDistribution("avant", before);
    showDistribution("après", after);

    await client.query("BEGIN");
    try {
      await client.query(ARCHIVE_DDL);
      const ids = targets.map((t) => Number(t.id));
      const archived = await client.query(
        `INSERT INTO event_reclass_archive (event_id, old_family, new_family, source_id, row_data)
         SELECT e.id, e.family, 'presse', e.source_id, to_jsonb(e)
           FROM event e
          WHERE e.id = ANY($1::bigint[])
            AND e.family NOT IN ('ransomware','cert_fr')
         ON CONFLICT (event_id) DO NOTHING`,
        [ids]
      );
      const updated = await client.query(
        `UPDATE event SET family = 'presse'
          WHERE id = ANY($1::bigint[])
            AND family NOT IN ('ransomware','cert_fr')
            AND family <> 'presse'`,
        [ids]
      );
      console.log(`archivés : ${archived.rowCount ?? 0} ligne(s), basculés : ${updated.rowCount ?? 0}`);

      if (APPLY) {
        await client.query("COMMIT");
        console.log("APPLY : transaction validée");
      } else {
        await client.query("ROLLBACK");
        console.log("DRY-RUN : transaction annulée, aucune donnée modifiée");
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const check = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM event WHERE family = 'presse'");
    console.log(`presse en base maintenant : ${check.rows[0]?.n ?? "?"}`);
  });

  console.log(`terminé en ${Date.now() - startedAt} ms`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
