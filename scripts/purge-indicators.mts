/**
 * Purge des indicateurs non actionnables.
 *
 * Le filtre anti-bruit (`collectors/filter.ts`) ne s'applique qu'à l'ingestion ;
 * ce script réapplique la même politique à l'historique. Idempotent : une valeur
 * déjà supprimée n'est pas revue.
 *
 * Usage :
 *   pnpm exec tsx scripts/purge-indicators.mts [--dry-run]
 *
 * Une sauvegarde de sécurité est créée dans `indicator_pre_purge` (id, type, value)
 * si elle n'existe pas. Pour restaurer : `INSERT INTO indicator SELECT ...` après
 * avoir ré-ingéré les sources (les indicateurs sont des données dérivées).
 */
import { loadActiveIndex, isActionableIndicator } from "../apps/api/src/collectors/filter.js";
import { ingestQuery } from "../apps/api/src/db.js";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 5000;
const DELETE_CHUNK = 2000;

async function main(): Promise<void> {
  // Sauvegarde de sécurité (unique, jamais écrasée).
  await ingestQuery("CREATE TABLE IF NOT EXISTS indicator_pre_purge AS SELECT id, type, value FROM indicator WITH NO DATA");
  const { rows: [{ n }] } = await ingestQuery<{ n: string }>("SELECT count(*)::text AS n FROM indicator_pre_purge");
  if (Number(n) === 0) {
    console.log("sauvegarde indicator_pre_purge…");
    await ingestQuery("INSERT INTO indicator_pre_purge SELECT id, type, value FROM indicator");
  }

  const index = await loadActiveIndex();
  console.log(`index : ${index.domains.size} domaine(s), ${index.ips.size} IP, ${index.cves.size} CVE(s)`);
  console.log(DRY_RUN ? "DRY-RUN : rien ne sera supprimé" : "purge réelle");

  const byReason: Record<string, number> = {};
  let cursor = 0;
  let total = 0;
  let kept = 0;
  let deleted = 0;
  const startedAt = Date.now();

  for (;;) {
    const { rows } = await ingestQuery<{ id: string; type: string; value: string }>(
      "SELECT id::text AS id, type, value FROM indicator WHERE id > $1 ORDER BY id LIMIT $2",
      [cursor, BATCH],
    );
    if (rows.length === 0) break;

    const doomed: number[] = [];
    for (const row of rows) {
      total++;
      const verdict = isActionableIndicator(row.value, row.type, index);
      byReason[verdict.reason] = (byReason[verdict.reason] ?? 0) + 1;
      if (verdict.keep) kept++;
      else doomed.push(Number(row.id));
    }
    cursor = Number(rows[rows.length - 1].id);

    if (doomed.length > 0 && !DRY_RUN) {
      for (let i = 0; i < doomed.length; i += DELETE_CHUNK) {
        await ingestQuery("DELETE FROM indicator WHERE id = ANY($1)", [doomed.slice(i, i + DELETE_CHUNK)]);
      }
    }
    deleted += doomed.length;

    if (total % 200_000 < BATCH) {
      const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`${total} lus · ${kept} gardés · ${deleted} ${DRY_RUN ? "à supprimer" : "supprimés"} · ${secs}s`);
    }

    if (rows.length < BATCH) break;
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`FINAL : ${total} lus, ${kept} gardés, ${deleted} ${DRY_RUN ? "à supprimer" : "supprimés"} en ${secs}s`);
  console.log("motifs :", byReason);
  if (!DRY_RUN) await ingestQuery("VACUUM ANALYZE indicator");
}

await main();
process.exit(0);
