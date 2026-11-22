/**
 * One-shot backfill for victim alerts that predate the immediate trigger.
 *
 * Only Nouvelle-Aquitaine organisation claims are considered. Existing alerts
 * are kept: emit_victim_alert() is idempotent. No victim title, personal data
 * or raw body is read or stored.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     RADAR_VICTIM_BACKFILL_DAYS=7 \
 *     apps/api/node_modules/.bin/tsx scripts/backfill-victim-alerts.mts
 */
import { closePools, query } from "../apps/api/src/db.js";

const DEPTS_NA = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const days = Math.max(1, Math.min(365, Number(process.env.RADAR_VICTIM_BACKFILL_DAYS ?? 7) || 7));

async function main(): Promise<void> {
  const r = await query<{ emitted: boolean }>(
    `SELECT emit_victim_alert(e.id, 'backfill') AS emitted
       FROM event e
       JOIN org o ON o.id = e.org_id
      WHERE o.dept = ANY($1::text[])
        AND e.assertion_type = 'third_party_claim'
        AND e.family IN ('ransomware', 'leaks')
        AND e.collected_at >= now() - ($2::int * interval '1 day')`,
    [DEPTS_NA, days],
  );
  console.log(`victim alerts emitted: ${r.rows.filter((row) => row.emitted).length} (window ${days} days)`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
