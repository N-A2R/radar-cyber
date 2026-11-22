/**
 * Reproducible measurement of the custody reclassification boundary.
 *
 * Events can be admitted into the radar outside Nouvelle-Aquitaine and only
 * later reclassified (`regional = true`), for instance by backfill-regional.
 * The insert trigger from migration 064 never sees that transition. This
 * script inserts fresh non-regional events through raw SQL, reclassifies them
 * with the same UPDATE shape, and counts how many obtain a live admission
 * fact in the same transaction. The shared `evaluateCustody` rule is used for
 * the completeness count; the advertised rate uses the live-writer count,
 * not the completeness count.
 *
 *   DATABASE_URL=... tsx scripts/measure-reclassification-boundary.mts \
 *     --json=bench/results/reclassification-boundary.json \
 *     --baseline=bench/results/reclassification-before.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";
import { evaluateCustody, iso, type CustodyEvent, type CustodyFact } from "../apps/api/src/custody/chain.js";

const argv = process.argv.slice(2);
const jsonFlag = argv.find((arg) => arg.startsWith("--json="));
const JSON_PATH = jsonFlag?.slice("--json=".length);
const baselineFlag = argv.find((arg) => arg.startsWith("--baseline="));
const BASELINE_PATH = baselineFlag?.slice("--baseline=".length);

const SAMPLE = 12;
const ACTOR = "custody:write-boundary@1";
const BACKFILL_ACTOR = "backfill:custody@1";
const OBSERVED = "2026-11-22T10:00:00.000Z";
const DEFINITION =
  "A Nouvelle-Aquitaine event reclassified from outside the region journals its admission in the same UPDATE, with an actor, a recording clock and stored proof. No victim personal data.";

type Counts = { events: number; liveWritten: number; rate: number };

type Measurement = {
  definition: string;
  scope: string;
  generatedAt: string;
  actor: string;
  before: Counts | null;
  after: Counts & {
    complete: number;
    liveAtInsert: number;
    backfilled: number;
    noVictimData: boolean;
  };
};

type FactRow = {
  subject: string;
  kind: string;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
  valid_at: string | Date | null;
  recorded_at: string | Date | null;
};

type EventRow = {
  dedup_key: string;
  family: string | null;
  source_id: string | null;
  source_url: string | null;
  observed_at: string | Date | null;
  collected_at: string | null;
  regional: boolean;
};

function rate(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 10000) / 100;
}

function loadBaseline(): Counts | null {
  if (!BASELINE_PATH || !existsSync(BASELINE_PATH)) return null;
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { after: Counts };
  return baseline.after;
}

async function measure(): Promise<Measurement> {
  const db = await createTestDatabase();
  // db.ts creates its pools at import time: point them to the disposable DB
  // before loading it, so no measurement ever touches the live database.
  process.env.DATABASE_URL = db.url;
  const { query, closePools } = await import("../apps/api/src/db.js");
  const runId = Date.now().toString(36);
  const subjects: string[] = [];
  const title = `Synthetic ${runId} - victim name must never be journaled`;
  try {
    for (let i = 0; i < SAMPLE; i++) {
      const subject = `measure-reclassification-${runId}-${i}`;
      subjects.push(subject);
      await query(
        `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at,
                            source_id, source_url, evidence, regional, regional_motif)
         VALUES ($1,'cti','ambient_signal',$2,$3,'ransomlook',
                 'https://example.invalid/reclassification-proof',
                 '{"run_id":"1"}'::jsonb, false,'hors-region')`,
        [subject, title, OBSERVED],
      );
    }

    const insertedFacts = await query<{ subject: string }>(
      `SELECT subject FROM journal
        WHERE subject = ANY($1::text[]) AND kind IN ('event.admitted','custody.seen')`,
      [subjects],
    );
    const liveAtInsert = new Set(insertedFacts.rows.map((row) => row.subject)).size;

    await query(
      `UPDATE event SET regional = true, regional_motif = 'nouvelle-aquitaine'
        WHERE dedup_key = ANY($1::text[]) AND regional = false`,
      [subjects],
    );

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

    const events = eventRows.rows.length;
    return {
      definition: DEFINITION,
      scope: "nouvelle-aquitaine",
      generatedAt: new Date().toISOString(),
      actor: ACTOR,
      before: loadBaseline(),
      after: {
        events,
        liveWritten,
        rate: rate(liveWritten, events),
        complete,
        liveAtInsert,
        backfilled,
        noVictimData: !leaked,
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
  console.log(`${after.liveWritten}/${after.events} reclassified NA events journal their admission in the UPDATE (${after.rate}%).`);
  if (before) {
    console.log(`Before: ${before.liveWritten}/${before.events} (${before.rate}%).`);
  }
  console.log(`At insert: ${after.liveAtInsert}; backfilled: ${after.backfilled}; complete: ${after.complete}; no victim data: ${after.noVictimData}.`);
  if (JSON_PATH) {
    mkdirSync(dirname(JSON_PATH), { recursive: true });
    writeFileSync(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
