#!/usr/bin/env -S npx tsx
/**
 * Reproducible measure of the ingestion language gate on Nouvelle-Aquitaine incidents.
 *
 * Compares the historical fr/en detector (title + summary) with the multilingual
 * admission verdict wired into `languageVerdict`. Read-only: PostgreSQL SELECTs
 * and the frozen corpus. No network calls, no victim data, no database writes.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-multilingual-admission.mts \
 *     --json=bench/results/multilingual-admission.json
 *   apps/api/node_modules/.bin/tsx scripts/measure-multilingual-admission.mts --offline
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { detectLanguage } from "../apps/api/src/collectors/filter.js";
import {
  analyseIncidents,
  incidentAdmissionVerdict,
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
const RESULT_PATH = option("--json", "bench/results/multilingual-admission.json");
const FR_ONLY = new Set(["fr"]);

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
const RULE =
  "ground truth = ids reported non-French at confidence >= 0.25 by the published incident analysis; " +
  "baseline = historical detectLanguage(title + summary); " +
  "delivered = incidentAdmissionVerdict(title, summary, RADAR_LANGUAGES=fr); " +
  "correct = language matches the ground truth (fr or en)";

function readCorpus(path: string): IncidentRecord[] {
  if (!existsSync(path)) throw new Error(`missing corpus: ${path}`);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const row = JSON.parse(line) as IncidentRecord;
      if (row.id === undefined || typeof row.title !== "string") {
        throw new Error(`invalid corpus line: ${line}`);
      }
      return row;
    });
}

async function loadLive(): Promise<IncidentRecord[]> {
  const { query, closePools } = await import("../apps/api/src/db.js");
  try {
    return (await query<IncidentRecord>(INCIDENT_SQL)).rows;
  } finally {
    await closePools();
  }
}

async function main(): Promise<void> {
  const corpus = readCorpus(CORPUS_PATH);
  const live = OFFLINE ? null : await loadLive();
  const rows = live ?? corpus;
  const nonFrench = new Set(analyseIncidents(rows).nonFrenchIds.map(String));
  const corpusIds = new Set(corpus.map((row) => String(row.id)));
  const corpusMatchesDatabase = live === null
    ? null
    : corpusIds.size === live.length && live.every((row) => corpusIds.has(String(row.id)));

  let baselineCorrect = 0;
  let admissionCorrect = 0;
  const byLanguage: Record<string, number> = {};
  const correctedIds: Array<string | number> = [];
  const wrongIds: Array<string | number> = [];
  for (const row of rows) {
    const expected = nonFrench.has(String(row.id)) ? "en" : "fr";
    const baseline = detectLanguage(`${row.title ?? ""} ${row.summary ?? ""}`).language;
    const verdict = incidentAdmissionVerdict(row.title, row.summary, FR_ONLY);
    byLanguage[verdict.language] = (byLanguage[verdict.language] ?? 0) + 1;
    if (baseline === expected) baselineCorrect++;
    if (verdict.language === expected) {
      admissionCorrect++;
      if (baseline !== expected) correctedIds.push(row.id);
    } else {
      wrongIds.push(row.id);
    }
  }

  const payload = {
    scope: "Nouvelle-Aquitaine (12 departments)",
    rule: RULE,
    totalIncidents: rows.length,
    baselineCorrect,
    admissionCorrect,
    correctedIds,
    wrongIds,
    byLanguage,
    corpusEntries: corpusIds.size,
    corpusMatchesDatabase,
    sql: { incidents: INCIDENT_SQL },
  };

  console.log(`incidents: ${rows.length}`);
  console.log(`baseline correct admissions: ${baselineCorrect}/${rows.length}`);
  console.log(`delivered correct admissions: ${admissionCorrect}/${rows.length}`);
  console.log(`corrections: ${correctedIds.length}, remaining errors: ${wrongIds.length}`);
  if (corpusMatchesDatabase !== null) {
    console.log(`corpus entries: ${corpusIds.size} (match: ${corpusMatchesDatabase})`);
  }
  if (admissionCorrect !== rows.length) throw new Error("the admission gate still mislabels incidents");
  if (corpusMatchesDatabase === false) throw new Error("corpus and database disagree: refresh the corpus before publishing");

  writeFileSync(RESULT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`written: ${RESULT_PATH}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
