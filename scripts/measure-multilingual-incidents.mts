#!/usr/bin/env -S npx tsx
/**
 * Reproducible measure of incidents detected outside French in Nouvelle-Aquitaine.
 *
 * Read-only by default: PostgreSQL SELECTs plus the versioned corpus. No
 * network calls, no victim data, no writes unless --write-corpus is explicit.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-multilingual-incidents.mts \
 *     --json=bench/results/multilingual-incidents.json
 *   apps/api/node_modules/.bin/tsx scripts/measure-multilingual-incidents.mts --offline
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  analyseIncidents,
  MIN_CONFIDENCE,
  NA_DEPARTMENTS,
  type IncidentRecord,
} from "../apps/api/src/multilingualIncidents/index.js";

const argv = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const found = argv.find((arg) => arg.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : fallback;
};
const OFFLINE = argv.includes("--offline");
const CORPUS_PATH = option("--corpus", "bench/corpus/incidents-multilingues-na.jsonl");
const RESULT_PATH = option("--json", "bench/results/multilingual-incidents.json");

const NA_CODES = Object.keys(NA_DEPARTMENTS).map((code) => `'${code}'`).join(", ");
const INCIDENT_SQL = `
  SELECT e.id::text AS id, e.title, e.summary, e.assertion_type, e.regional,
         o.dept AS department, e.source_id
    FROM event e
    LEFT JOIN org o ON o.id = e.org_id
   WHERE e.assertion_type IN ('confirmed_incident', 'third_party_claim')
     AND (e.regional OR o.dept IN (${NA_CODES}))
   ORDER BY e.id
`;
const BASELINE_SQL = `
  SELECT (SELECT count(*)::int FROM source) AS sources,
         (SELECT count(*)::int FROM event) AS events
`;
const RULE =
  "incident = assertion_type in (confirmed_incident, third_party_claim); " +
  "Nouvelle-Aquitaine = event.regional or the linked org department is one of the 12 NA codes; " +
  "language = exclusive function-word and strong-phrase scoring on title + summary, " +
  `undetermined on ties or fewer than two word hits, non-French requires confidence >= ${MIN_CONFIDENCE}`;

interface Row extends IncidentRecord {
  source_id: string | null;
}
const PERSONAL_DATA = /[\w.+-]+@[\w-]+\.[\w.-]+|\b0[1-9](?:[ .-]?\d{2}){4}\b/g;

/** Leak summaries can contain contact details: never freeze them in a corpus. */
function redact(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(PERSONAL_DATA, "[redacted]");
}

function readCorpus(path: string): Row[] {
  if (!existsSync(path)) {
    if (argv.includes("--write-corpus")) return [];
    throw new Error(`missing corpus: ${path}`);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const row = JSON.parse(line) as Row;
      if (row.id === undefined || typeof row.title !== "string") {
        throw new Error(`invalid corpus line: ${line}`);
      }
      return row;
    });
}

async function loadLive(): Promise<{ rows: Row[]; baseline: Record<string, number> }> {
  const { query, closePools } = await import("../apps/api/src/db.js");
  try {
    const [incidents, baseline] = await Promise.all([
      query<Row>(INCIDENT_SQL),
      query<Record<string, number>>(BASELINE_SQL),
    ]);
    return { rows: incidents.rows, baseline: baseline.rows[0] ?? {} };
  } finally {
    await closePools();
  }
}

function nonFrenchBySource(rows: Row[], ids: Set<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (!ids.has(String(row.id))) continue;
    const source = row.source_id ?? "unknown";
    result[source] = (result[source] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

async function main(): Promise<void> {
  const corpus = readCorpus(CORPUS_PATH);
  const live = OFFLINE ? null : await loadLive();
  const rows = live?.rows ?? corpus;
  const analysis = analyseIncidents(rows);
  const nonFrenchIds = new Set(analysis.nonFrenchIds.map(String));
  const corpusIds = new Set(corpus.map((row) => String(row.id)));
  const corpusMatchesDatabase = live === null
    ? null
    : corpusIds.size === live.rows.length && live.rows.every((row) => corpusIds.has(String(row.id)));

  const payload = {
    scope: "Nouvelle-Aquitaine (12 departments)",
    rule: RULE,
    inScopeIncidents: analysis.inScopeIncidents,
    nonFrenchIncidents: analysis.nonFrenchIncidents,
    byLanguage: analysis.byLanguage,
    nonFrenchBySource: nonFrenchBySource(rows, nonFrenchIds),
    nonFrenchIds: analysis.nonFrenchIds,
    corpusEntries: corpusIds.size,
    corpusMatchesDatabase,
    baseline: live?.baseline ?? null,
    sql: { incidents: INCIDENT_SQL, baseline: BASELINE_SQL },
  };

  console.log(`in-scope incidents: ${analysis.inScopeIncidents}`);
  console.log(`incidents detected outside French: ${analysis.nonFrenchIncidents}`);
  console.log(`by language: ${JSON.stringify(analysis.byLanguage)}`);
  if (corpusMatchesDatabase !== null) {
    console.log(`corpus entries: ${corpusIds.size} (match: ${corpusMatchesDatabase})`);
  }
  writeFileSync(RESULT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`written: ${RESULT_PATH}`);

  if (argv.includes("--write-corpus")) {
    if (OFFLINE || !live) throw new Error("--write-corpus requires a live database");
    const lines = live.rows.map((row) => JSON.stringify({
      ...row,
      title: redact(row.title),
      summary: redact(row.summary),
    })).join("\n");
    writeFileSync(CORPUS_PATH, `${lines}\n`, "utf8");
    console.log(`written: ${CORPUS_PATH}`);
  }
  if (corpusMatchesDatabase === false) {
    throw new Error("corpus and database disagree: refresh the corpus before publishing");
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
