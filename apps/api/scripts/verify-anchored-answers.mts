#!/usr/bin/env -S npx tsx
/**
 * Rejeu du critère : 100 questions en français, réponses ancrées dans `event`.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx apps/api/scripts/verify-anchored-answers.mts \
 *     --json=bench/results/NA-anchored-answers.json
 *
 * Contrôles : tout identifiant cité existe dans `event` ; toute affirmation a
 * une URL de source et un run résolu ; aucune phrase n'est rendue sans citation.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../src/db.js";
import { NA_DEPARTMENTS } from "../src/geo/commune-index.js";
import { answerAnchored } from "../src/search/anchored-answer.js";

const TOTAL = 100;
const OBJECTIVE_PASS = 90;
const DEPARTMENT_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "16": "Charente",
  "17": "Charente-Maritime",
  "19": "Corrèze",
  "23": "Creuse",
  "24": "Dordogne",
  "33": "Gironde",
  "40": "Landes",
  "47": "Lot-et-Garonne",
  "64": "Pyrénées-Atlantiques",
  "79": "Deux-Sèvres",
  "86": "Vienne",
  "87": "Haute-Vienne",
});

interface CorpusRow {
  id: string;
  title: string;
  organisation: string;
  department: string;
  observed_at: Date | string;
}

interface ReplayResult {
  question: string;
  citedEventIds: number[];
  assertions: number;
  allIdsExist: boolean;
  everyAssertionSourced: boolean;
  orphanCitations: number[];
  pass: boolean;
}

function buildQuestion(row: CorpusRow, template: number): string {
  const department = DEPARTMENT_LABEL[row.department] ?? `département ${row.department}`;
  const year = new Date(row.observed_at).getUTCFullYear();
  const organisation = row.organisation.trim();
  const templates = [
    `Quels événements concernent ${organisation} (${department}) en ${year} ?`,
    `Quelles preuves sont associées à ${organisation} en ${year} ?`,
    `Que s'est-il passé pour ${organisation} dans le ${department} en ${year} ?`,
    `Quels événements sont enregistrés pour ${organisation} en ${department} (${year}) ?`,
  ];
  return templates[template % templates.length];
}

async function main(): Promise<void> {
  const jsonPath = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
    ?? "bench/results/NA-anchored-answers.json";

  const corpus = await query<CorpusRow>(
    `SELECT e.id::text AS id, e.title, o.name AS organisation, o.dept AS department, e.observed_at
     FROM event e
     JOIN org o ON o.id = e.org_id
     WHERE o.dept = ANY($1::text[])
       AND e.observed_at IS NOT NULL
       AND e.source_url IS NOT NULL AND btrim(e.source_url) <> ''
       AND e.evidence->>'run_id' IS NOT NULL
       AND coalesce(e.evidence->>'synthetic', 'false') <> 'true'
       AND e.source_id NOT LIKE 'injection-%'
     ORDER BY e.id
     LIMIT $2`,
    [[...NA_DEPARTMENTS], Math.ceil(TOTAL / 4)],
  );
  const questions = corpus.rows.flatMap((row, rowIndex) =>
    [0, 1, 2, 3].map((template) => buildQuestion(row, rowIndex * 4 + template)),
  ).slice(0, TOTAL);
  if (questions.length < TOTAL) {
    throw new Error(`${questions.length} questions générables, ${TOTAL} requises`);
  }

  const results: ReplayResult[] = [];
  let unsourcedAssertions = 0;
  for (const question of questions) {
    const answer = await answerAnchored(question);
    const found = await query<{ id: number }>(
      "SELECT id FROM event WHERE id = ANY($1::bigint[])",
      [answer.citedEventIds],
    );
    const existing = new Set(found.rows.map((item) => Number(item.id)));
    const citedInText = [...answer.answer.matchAll(/\[event:(\d+)\]/g)].map((match) => Number(match[1]));
    const orphanCitations = [...new Set([...citedInText, ...answer.citedEventIds])]
      .filter((id) => !existing.has(id));
    const allIdsExist = answer.citedEventIds.length > 0 && orphanCitations.length === 0;
    const everyAssertionSourced = answer.assertions.length > 0 && answer.assertions.every((assertion) => {
      return assertion.phrase.includes(`[event:${assertion.source.eventId}]`)
        && assertion.phrase.includes(assertion.source.url)
        && assertion.source.runId.length > 0
        && assertion.source.sourceId.length > 0;
    });
    if (!everyAssertionSourced) unsourcedAssertions += answer.assertions.filter((assertion) => {
      return !assertion.phrase.includes(`[event:${assertion.source.eventId}]`)
        || !assertion.phrase.includes(assertion.source.url)
        || assertion.source.runId.length === 0;
    }).length;
    results.push({
      question,
      citedEventIds: answer.citedEventIds,
      assertions: answer.assertions.length,
      allIdsExist,
      everyAssertionSourced,
      orphanCitations,
      pass: allIdsExist && everyAssertionSourced,
    });
  }

  const passed = results.filter((result) => result.pass).length;
  const rate = Number(((passed / TOTAL) * 100).toFixed(1));
  const report = {
    date: new Date().toISOString(),
    questions: TOTAL,
    objective: { passRate: `${OBJECTIVE_PASS}%`, unsourcedAssertions: 0 },
    measured: { passed, passRate: `${rate}%`, unsourcedAssertions },
    failures: results.filter((result) => !result.pass).slice(0, 10),
  };
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (passed < OBJECTIVE_PASS || unsourcedAssertions > 0) process.exitCode = 1;
}

main()
  .finally(() => closePools())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
