/**
 * Backfill the chain of custody for Nouvelle-Aquitaine events that were
 * admitted without a journal fact (official statements, claim-feed gaps).
 *
 * Dry run by default; `--apply` appends facts to the immutable journal.
 * Replaying `--apply` writes zero rows: an event with an admission fact is
 * never touched. Only source metadata and timestamps are copied — never the
 * event title, summary, organisation name or victim data.
 *
 *   tsx scripts/backfill-custody.mts --json=bench/results/custody-backfill.json
 *   tsx scripts/backfill-custody.mts --apply --json=...
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import { iso } from "../apps/api/src/custody/chain.js";
import { consigner } from "../apps/api/src/journal/index.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const subjectFlag = argv.find((arg) => arg.startsWith("--subject="));
const SUBJECT = subjectFlag?.slice("--subject=".length);
const jsonFlag = argv.find((arg) => arg.startsWith("--json="));
const JSON_PATH = jsonFlag?.slice("--json=".length);

type Candidate = {
  dedup_key: string;
  family: string | null;
  source_id: string | null;
  source_url: string | null;
  observed_at: string | Date | null;
  collected_at: string | Date | null;
  admission_rule: string | null;
  regional_motif: string | null;
};

export type BackfillReport = {
  scope: string;
  actor: string;
  dryRun: boolean;
  candidates: number;
  written: number;
  failed: number;
  subjects: string[];
};
async function candidates(): Promise<Candidate[]> {
  const params: unknown[] = [];
  const scope = SUBJECT ? "AND e.dedup_key = $1" : "";
  if (SUBJECT) params.push(SUBJECT);
  const { rows } = await query<Candidate>(`
    SELECT e.dedup_key, e.family, e.source_id, e.source_url,
           e.observed_at, e.collected_at, e.admission_rule, e.regional_motif
      FROM event e
     WHERE e.regional
       ${scope}
       AND NOT EXISTS (
         SELECT 1 FROM journal j
          WHERE j.subject = e.dedup_key
            AND j.kind IN ('event.admitted', 'custody.seen')
            AND btrim(j.actor) <> ''
            AND j.recorded_at IS NOT NULL
            AND j.payload <> '{}'::jsonb
       )
     ORDER BY e.id
  `, params);
  return rows;
}

async function main(): Promise<void> {
  const rows = await candidates();
  const report: BackfillReport = {
    scope: "nouvelle-aquitaine",
    actor: "backfill:custody@1",
    dryRun: !APPLY,
    candidates: rows.length,
    written: 0,
    failed: 0,
    subjects: [],
  };

  for (const row of rows) {
    const observedAt = iso(row.observed_at);
    const collectedAt = iso(row.collected_at);
    const payload = {
      sourceId: row.source_id,
      sourceUrl: row.source_url,
      observedAt,
      collectedAt,
      admissionRule: row.admission_rule,
      regionalMotif: row.regional_motif,
      family: row.family,
      reconstructed: true,
    };
    if (!APPLY) {
      report.subjects.push(row.dedup_key);
      continue;
    }
    const result = await consigner({
      kind: "event.admitted",
      subject: row.dedup_key,
      summary: `${row.source_id ?? "unknown-source"}: custody chain reconstructed from stored provenance`,
      actor: report.actor,
      payload,
      validAt: observedAt ?? collectedAt,
    });
    if (result.ok) {
      report.written += 1;
      report.subjects.push(row.dedup_key);
    } else {
      report.failed += 1;
    }
  }

  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (JSON_PATH) {
    mkdirSync(dirname(JSON_PATH), { recursive: true });
    writeFileSync(JSON_PATH, text, "utf8");
  }
  process.stdout.write(text);
  if (report.failed > 0) process.exitCode = 1;
  await closePools();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closePools().catch(() => {});
  process.exitCode = 1;
});
