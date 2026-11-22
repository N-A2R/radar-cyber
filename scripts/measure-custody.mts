/**
 * Reproducible custody measurement on the live database.
 *
 * Definition (English, machine-readable): among Nouvelle-Aquitaine events,
 * count those with a source, an observation time and an append-only journal
 * fact naming an actor, a recording time and a stored proof. The same rule is
 * evaluated by `evaluateCustody`, used by the API and the backfill CLI.
 *
 *   DATABASE_URL=... tsx scripts/measure-custody.mts --json=bench/results/custody-na.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import { evaluateCustody, iso, type CustodyEvent, type CustodyFact } from "../apps/api/src/custody/chain.js";

const argv = process.argv.slice(2);
const jsonFlag = argv.find((arg) => arg.startsWith("--json="));
const JSON_PATH = jsonFlag?.slice("--json=".length);

const DEFINITION =
  "Complete custody chain for a Nouvelle-Aquitaine event: source id and URL, observation time, and an append-only journal admission fact with actor, recording clock and stored proof. No victim personal data.";

type EventRow = {
  dedup_key: string;
  family: string | null;
  source_id: string | null;
  source_url: string | null;
  observed_at: string | Date | null;
  collected_at: string | Date | null;
  regional: boolean;
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

export type CustodyMeasurement = {
  definition: string;
  scope: string;
  generatedAt: string;
  organisations: number;
  sources: number;
  events: number;
  regionalEvents: number;
  complete: number;
  incomplete: number;
  rate: number;
  gaps: Record<string, number>;
  samples: string[];
};

async function measure(): Promise<CustodyMeasurement> {
  const [events, totals] = await Promise.all([
    query<EventRow>(`
      SELECT dedup_key, family, source_id, source_url, observed_at, collected_at, regional
        FROM event WHERE regional ORDER BY id
    `),
    query<{ orgs: string; sources: string; events: string }>(`
      SELECT (SELECT count(*) FROM org)::text AS orgs,
             (SELECT count(*) FROM source)::text AS sources,
             (SELECT count(*) FROM event)::text AS events
    `),
  ]);

  const subjects = events.rows.map((row) => row.dedup_key);
  const factsBySubject = new Map<string, CustodyFact[]>();
  if (subjects.length > 0) {
    const { rows } = await query<FactRow>(
      `SELECT subject, kind, actor, summary, payload, valid_at, recorded_at
         FROM journal WHERE subject = ANY($1::text[]) ORDER BY recorded_at, id`,
      [subjects],
    );
    for (const row of rows) {
      const list = factsBySubject.get(row.subject) ?? [];
      list.push({
        kind: row.kind,
        actor: row.actor,
        summary: row.summary,
        payload: row.payload ?? {},
        validAt: iso(row.valid_at),
        recordedAt: iso(row.recorded_at),
      });
      factsBySubject.set(row.subject, list);
    }
  }

  const gaps: Record<string, number> = {};
  const samples: string[] = [];
  let complete = 0;
  for (const row of events.rows) {
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
    const chain = evaluateCustody(event, factsBySubject.get(row.dedup_key) ?? []);
    if (chain.complete) {
      complete += 1;
      continue;
    }
    for (const reason of chain.missing) gaps[reason] = (gaps[reason] ?? 0) + 1;
    if (samples.length < 5) samples.push(row.dedup_key);
  }

  const total = events.rows.length;
  return {
    definition: DEFINITION,
    scope: "nouvelle-aquitaine",
    generatedAt: new Date().toISOString(),
    organisations: Number(totals.rows[0]?.orgs ?? 0),
    sources: Number(totals.rows[0]?.sources ?? 0),
    events: Number(totals.rows[0]?.events ?? 0),
    regionalEvents: total,
    complete,
    incomplete: total - complete,
    rate: total === 0 ? 0 : Math.round((complete / total) * 10000) / 100,
    gaps,
    samples,
  };
}

async function main(): Promise<void> {
  const result = await measure();
  console.log(`${result.complete}/${result.regionalEvents} Nouvelle-Aquitaine events have a complete custody chain (${result.rate}%).`);
  console.log(`Incomplete: ${result.incomplete}; gaps: ${JSON.stringify(result.gaps)}`);
  console.log(`Context: ${result.organisations} organisations, ${result.sources} sources, ${result.events} events.`);
  if (JSON_PATH) {
    mkdirSync(dirname(JSON_PATH), { recursive: true });
    writeFileSync(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  await closePools();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closePools().catch(() => {});
  process.exitCode = 1;
});
