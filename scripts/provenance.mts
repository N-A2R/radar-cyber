/**
 * Reproducible provenance measurement and the blocking CI gate.
 *
 *   tsx scripts/provenance.mts measure --json=bench/results/provenance-na.json
 *   tsx scripts/provenance.mts check   --json=bench/results/provenance-na.json
 *
 * `measure` reads the live Nouvelle-Aquitaine database and writes a ledger
 * containing only source metadata, actors, recording clocks and proof keys.
 * `check` re-evaluates that ledger with the pure gate and exits 1 when any
 * fact lacks provenance. The ledger never carries event titles, journal
 * summaries, organisation names or victim data.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import { evaluateCustody, iso, PROOF_KEYS, type CustodyEvent, type CustodyFact } from "../apps/api/src/custody/chain.js";
import {
  evaluateProvenanceGate,
  PROVENANCE_SCOPE,
  type ProvenanceArtifact,
  type ProvenanceEntry,
} from "../apps/api/src/custody/gate.js";

const argv = process.argv.slice(2);
const command = argv[0];
const jsonFlag = argv.find((arg) => arg.startsWith("--json="));
const JSON_PATH = jsonFlag?.slice("--json=".length) ?? "bench/results/provenance-na.json";

const DEFINITION =
  "Zero fact without provenance: every Nouvelle-Aquitaine event carries a source id and URL, " +
  "an observation time, and an append-only admission fact with an actor, a recording clock " +
  "and allowed proof keys. No victim personal data in the ledger.";

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
  payload: Record<string, unknown> | null;
  valid_at: string | Date | null;
  recorded_at: string | Date | null;
};

/** Keep only the proof keys the custody rule is allowed to display. */
function sanitizePayload(payload: Record<string, unknown> | null): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (!payload) return clean;
  for (const key of PROOF_KEYS) {
    const value = payload[key];
    if (value !== null && value !== undefined && value !== "") clean[key] = value;
  }
  return clean;
}

async function measure(): Promise<ProvenanceArtifact> {
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
      `SELECT subject, kind, actor, payload, valid_at, recorded_at
         FROM journal WHERE subject = ANY($1::text[]) ORDER BY recorded_at, id`,
      [subjects],
    );
    for (const row of rows) {
      const list = factsBySubject.get(row.subject) ?? [];
      list.push({
        kind: row.kind,
        actor: row.actor,
        summary: "",
        payload: sanitizePayload(row.payload),
        validAt: iso(row.valid_at),
        recordedAt: iso(row.recorded_at),
      });
      factsBySubject.set(row.subject, list);
    }
  }

  const entries: ProvenanceEntry[] = events.rows.map((row) => {
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
    return { event, facts: factsBySubject.get(row.dedup_key) ?? [] };
  });

  return {
    definition: DEFINITION,
    scope: PROVENANCE_SCOPE,
    generatedAt: new Date().toISOString(),
    organisations: Number(totals.rows[0]?.orgs ?? 0),
    sources: Number(totals.rows[0]?.sources ?? 0),
    events: Number(totals.rows[0]?.events ?? 0),
    regionalEvents: entries.length,
    complete: 0,
    withoutProvenance: 0,
    rate: 0,
    gaps: {},
    entries,
  };
}

/** Fill the summary fields from the ledger itself, then let the gate judge it. */
function summarize(artifact: ProvenanceArtifact): ProvenanceArtifact {
  const gaps: Record<string, number> = {};
  let complete = 0;
  for (const entry of artifact.entries) {
    const chain = evaluateCustody(entry.event, entry.facts);
    if (chain.complete) {
      complete += 1;
      continue;
    }
    for (const reason of chain.missing) gaps[reason] = (gaps[reason] ?? 0) + 1;
  }
  const withoutProvenance = artifact.entries.length - complete;
  return {
    ...artifact,
    complete,
    withoutProvenance,
    rate: artifact.entries.length === 0 ? 0 : Math.round((complete / artifact.entries.length) * 10000) / 100,
    gaps: Object.fromEntries(Object.entries(gaps).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function resultLine(artifact: ProvenanceArtifact, verdict: ReturnType<typeof evaluateProvenanceGate>): string {
  const state = verdict.ok ? "PASS" : "FAIL";
  const line = `Provenance gate ${state}: ${verdict.withoutProvenance.length}/${artifact.regionalEvents} ` +
    `Nouvelle-Aquitaine facts without provenance.`;
  return verdict.ok ? line : `${line} Reasons: ${verdict.reasons.join(", ")}.`;
}

async function main(): Promise<void> {
  if (command === "measure") {
    const artifact = summarize(await measure());
    mkdirSync(dirname(JSON_PATH), { recursive: true });
    writeFileSync(JSON_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(resultLine(artifact, evaluateProvenanceGate(artifact)));
    console.log(`Context: ${artifact.organisations} organisations, ${artifact.sources} sources, ${artifact.events} events.`);
    console.log(`Ledger: ${JSON_PATH}`);
    await closePools();
    return;
  }

  if (command === "check") {
    let artifact: ProvenanceArtifact | null = null;
    try {
      artifact = JSON.parse(readFileSync(JSON_PATH, "utf8")) as ProvenanceArtifact;
    } catch {
      console.error("Provenance gate FAIL: unreadable-artifact.");
      process.exitCode = 1;
      return;
    }
    if (!artifact || !Array.isArray(artifact.entries)) {
      console.error("Provenance gate FAIL: invalid-artifact.");
      process.exitCode = 1;
      return;
    }
    const verdict = evaluateProvenanceGate(artifact);
    const line = resultLine(artifact, verdict);
    if (verdict.ok) console.log(line);
    else {
      console.error(line);
      if (verdict.withoutProvenance.length > 0) console.error(`Subjects: ${verdict.withoutProvenance.join(", ")}`);
    }
    process.exitCode = verdict.ok ? 0 : 1;
    return;
  }

  console.error("Usage: provenance.mts measure|check --json=<path>");
  process.exitCode = 2;
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closePools().catch(() => {});
  process.exitCode = 1;
});
