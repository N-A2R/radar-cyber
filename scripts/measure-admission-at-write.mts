/**
 * Reproducible measurement of the custody write boundary.
 *
 * The archived backfill report shows that all 112 historical Nouvelle-Aquitaine
 * admissions were written by `backfill:custody@1` — 0/112 were recorded at
 * write time. This script inserts fresh regional events through raw SQL, the
 * same way an external writer (`na-gap`) does, and counts how many obtain a
 * complete admission fact in the same transaction. The rule reused for the
 * count is `evaluateCustody`, the one used by the API and the backfill.
 *
 *   DATABASE_URL=... tsx scripts/measure-admission-at-write.mts \
 *     --json=bench/results/admission-at-write.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";
import { evaluateCustody, iso, type CustodyEvent, type CustodyFact } from "../apps/api/src/custody/chain.js";

const argv = process.argv.slice(2);
const jsonFlag = argv.find((arg) => arg.startsWith("--json="));
const JSON_PATH = jsonFlag?.slice("--json=".length);

const SAMPLE = 12;
const ACTOR = "custody:write-boundary@1";
const BACKFILL_ACTOR = "backfill:custody@1";
const OBSERVED = "2026-11-22T10:00:00.000Z";
const DEFINITION =
  "A Nouvelle-Aquitaine event has a live admission when its INSERT itself writes an append-only admission fact with an actor, a recording clock and stored proof. No victim personal data.";

type FactRow = {
  subject: string;
  kind: string;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
  valid_at: string | Date | null;
  recorded_at: string | Date | null;
};

type Measurement = {
  definition: string;
  scope: string;
  generatedAt: string;
  actor: string;
  before: { liveAtWrite: number; events: number; actor: string };
  after: {
    events: number;
    complete: number;
    liveWritten: number;
    backfilled: number;
    noVictimData: boolean;
    rate: number;
  };
};


type EventRow = {
  dedup_key: string;
  family: string | null;
  source_id: string | null;
  source_url: string | null;
  observed_at: string | Date | null;
  collected_at: string | Date | null;
  regional: boolean;
};

function archivedBefore(): { liveAtWrite: number; events: number; actor: string } {
  const report = JSON.parse(readFileSync("bench/results/custody-backfill.json", "utf8")) as {
    actor: string;
    written: number;
    subjects: string[];
  };
  return { liveAtWrite: 0, events: report.written, actor: report.actor };
}

async function measure(): Promise<Measurement> {
  const before = archivedBefore();
  const db = await createTestDatabase();
  // db.ts creates its pools at import time; point them at the disposable DB
  // before loading it so the measurement never touches the live database.
  process.env.DATABASE_URL = db.url;
  const { query, closePools } = await import("../apps/api/src/db.js");
  const runId = Date.now().toString(36);
  const subjects: string[] = [];
  const title = `Synthetic ${runId} - victim name must never be journaled`;
  try {
    for (let i = 0; i < SAMPLE; i++) {
      const subject = `measure-write-boundary-${runId}-${i}`;
      subjects.push(subject);
      // No app-level consigner: this is what an external writer does.
      await query(
        `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at,
                            source_id, source_url, evidence, regional, regional_motif)
         VALUES ($1,'cti','ambient_signal',$2,$3,'ransomlook',
                 'https://example.invalid/write-boundary-proof',
                 '{"run_id":"1"}'::jsonb, true,'nouvelle-aquitaine')`,
        [subject, title, OBSERVED],
      );
    }
    const [eventRows, factRows] = await Promise.all([
      query<EventRow>(
        `SELECT dedup_key, family, source_id, source_url, observed_at, collected_at, regional
           FROM event WHERE dedup_key = ANY($1::text[]) ORDER BY dedup_key`,
        [subjects],
      ),
      query<FactRow>(
        `SELECT subject, kind, actor, summary, payload, valid_at, recorded_at
           FROM journal WHERE subject = ANY($1::text[]) ORDER BY subject, recorded_at`,
        [subjects],
      ),
    ]);
    const facts = new Map<string, CustodyFact[]>();
    for (const row of factRows.rows) {
      const list = facts.get(row.subject) ?? [];
      list.push({
        kind: row.kind,
        actor: row.actor,
        summary: row.summary,
        payload: row.payload ?? {},
        validAt: iso(row.valid_at),
        recordedAt: iso(row.recorded_at),
      });
      facts.set(row.subject, list);
    }
    let complete = 0;
    let liveWritten = 0;
    let backfilled = 0;
    let leaked = false;
    for (const row of eventRows.rows) {
      const event: CustodyEvent = {
        dedupKey: row.dedup_key,
        family: row.family,
        title: null,
        sourceId: row.source_id,
        sourceUrl: row.source_url,
        observedAt: iso(row.observed_at),
        collectedAt: iso(row.collected_at),
        regional: row.regional,
      };
      const chain = evaluateCustody(event, facts.get(row.dedup_key) ?? []);
      if (chain.complete) complete += 1;
      const list = facts.get(row.dedup_key) ?? [];
      if (list.some((fact) => fact.actor === ACTOR)) liveWritten += 1;
      if (list.some((fact) => fact.actor === BACKFILL_ACTOR)) backfilled += 1;
      if (list.some((fact) => JSON.stringify(fact).includes(runId))) leaked = true;
    }
    return {
      definition: DEFINITION,
      scope: "nouvelle-aquitaine",
      generatedAt: new Date().toISOString(),
      actor: ACTOR,
      before,
      after: {
        events: eventRows.rows.length,
        complete,
        liveWritten,
        backfilled,
        noVictimData: !leaked,
        rate: eventRows.rows.length === 0 ? 0 : Math.round((complete / eventRows.rows.length) * 10000) / 100,
      },
    };
  } finally {
    await closePools().catch(() => {});
    await dropTestDatabase(db);
  }
}

async function main(): Promise<void> {
  const result = await measure();
  const { after, before } = result;
  console.log(`${after.liveWritten}/${after.events} fresh NA events journal their admission at write time (${after.rate}%).`);
  console.log(`Backfilled: ${after.backfilled}; historical before: ${before.liveAtWrite}/${before.events} live.`);
  if (JSON_PATH) {
    mkdirSync(dirname(JSON_PATH), { recursive: true });
    writeFileSync(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
