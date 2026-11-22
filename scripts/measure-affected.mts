#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the "Am I affected?" assistant.
 *
 * Reads the real regional database, writes nothing. The first figure is a
 * full-corpus SQL count of Nouvelle-Aquitaine organizations with at least one
 * structured, source-backed statement. The second figure replays the actual
 * assistant code on a deterministic sample: 60 organizations with observations
 * and 60 organizations spread by hash over the whole region.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-affected.mts
 *
 * Writes bench/results/affected-assistant.json.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAffectedReport,
  hasVerifiableEvidence,
  NA_DEPARTMENTS,
  type Organization,
} from "../apps/api/src/affected/model.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
process.env.DATABASE_URL = url;
const displayed = new URL(url);
displayed.password = "***";

/** Share the declared objective with the French report; anything below fails. */
const TARGET_COVERAGE_PERCENT = 99;
const PERSONAL_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PERSONAL_PHONE = /(?<!\d)(?:\+?33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/;

const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query("SET statement_timeout = '20000ms'");
  const departments = Object.keys(NA_DEPARTMENTS);

  const baseline = await client.query<{
    organizations: string;
    na_organizations: string;
    sources: string;
    events: string;
  }>(
    `SELECT (SELECT count(*)::text FROM org) AS organizations,
            (SELECT count(*)::text FROM org WHERE dept = ANY($1::text[])) AS na_organizations,
            (SELECT count(*)::text FROM source) AS sources,
            (SELECT count(*)::text FROM event) AS events`,
    [departments],
  );

  /** Same evidence rule as the assistant's registry statements, in one pass. */
  const coverage = await client.query<{ total: string; covered: string }>(
    `WITH na AS (
       SELECT o.id FROM org o WHERE o.dept = ANY($1::text[])
     ), evidenced AS (
       SELECT o.id
         FROM org o
        WHERE o.dept = ANY($1::text[])
          AND ((o.entity_source IS NOT NULL AND o.entity_code IS NOT NULL)
               OR o.siren IS NOT NULL OR o.geo_source IS NOT NULL)
       UNION
       SELECT DISTINCT e.org_id
         FROM event e JOIN org o ON o.id = e.org_id
        WHERE o.dept = ANY($1::text[]) AND e.org_id IS NOT NULL
     )
     SELECT (SELECT count(*)::text FROM na) AS total,
            (SELECT count(*)::text FROM evidenced) AS covered`,
    [departments],
  );

  const [withEvents, spread] = await Promise.all([
    client.query<{ id: number }>(
      `SELECT DISTINCT o.id FROM event e JOIN org o ON o.id = e.org_id
        WHERE o.dept = ANY($1::text[]) ORDER BY o.id DESC LIMIT 60`,
      [departments],
    ),
    client.query<{ id: number }>(
      `SELECT id FROM org WHERE dept = ANY($1::text[])
        ORDER BY md5(id::text), id LIMIT 60`,
      [departments],
    ),
  ]);
  const sampleIds = [...new Set([...withEvents.rows, ...spread.rows].map((r) => r.id))];

  const { findOrganization, listObservations } = await import("../apps/api/src/affected/query.js");
  const { closePools } = await import("../apps/api/src/db.js");

  let answers = 0;
  let answersWithEvidence = 0;
  let statements = 0;
  let statementsWithEvidence = 0;
  let personalDataLeaks = 0;
  const leakDetails: Array<{ organizationId: number; reason: string }> = [];
  let outsideRegionAnswers = 0;
  let missingStatements = 0;
  try {
    for (const id of sampleIds) {
      const org: Organization | null = await findOrganization({ id });
      if (!org) continue;
      const report = buildAffectedReport(org, await listObservations(id));
      answers += 1;
      const serialized = JSON.stringify(report);
      const reason = PERSONAL_EMAIL.test(serialized)
        ? "email"
        : PERSONAL_PHONE.test(serialized)
          ? "phone"
          : serialized.includes("raw_body")
            ? "raw-body"
            : null;
      if (reason) {
        personalDataLeaks += 1;
        if (leakDetails.length < 5) leakDetails.push({ organizationId: id, reason });
      }
      if (report.scope !== "nouvelle-aquitaine" || report.organization.region !== "Nouvelle-Aquitaine") {
        outsideRegionAnswers += 1;
      }
      if (report.statements.length === 0) missingStatements += 1;
      if (report.statements.every(hasVerifiableEvidence)) answersWithEvidence += 1;
      statements += report.summary.statements;
      statementsWithEvidence += report.summary.withEvidence;
    }
  } finally {
    await closePools();
  }

  const total = Number(coverage.rows[0]!.total);
  const covered = Number(coverage.rows[0]!.covered);
  const coveragePercent = total === 0 ? 0 : Math.round((10_000 * covered) / total) / 100;
  const baselineRow = baseline.rows[0]!;
  const result = {
    measuredAt: new Date().toISOString(),
    database: displayed.toString(),
    objective: `at least ${TARGET_COVERAGE_PERCENT}% of Nouvelle-Aquitaine organizations have an evidence-backed statement`,
    baseline: {
      organizations: Number(baselineRow.organizations),
      naOrganizations: Number(baselineRow.na_organizations),
      sources: Number(baselineRow.sources),
      events: Number(baselineRow.events),
    },
    fullCorpus: {
      naOrganizations: total,
      withEvidenceBackedStatement: covered,
      coveragePercent,
      targetPercent: TARGET_COVERAGE_PERCENT,
      targetMet: coveragePercent >= TARGET_COVERAGE_PERCENT,
    },
    replayedSample: {
      organizations: answers,
      withEvidenceBackedAnswer: answersWithEvidence,
      statements,
      statementsWithEvidence,
      personalDataLeaks,
      leakDetails,
      outsideRegionAnswers,
      missingStatements,
    },
    passed:
      coveragePercent >= TARGET_COVERAGE_PERCENT &&
      answers > 0 &&
      answersWithEvidence === answers &&
      statements === statementsWithEvidence &&
      personalDataLeaks === 0 &&
      outsideRegionAnswers === 0 &&
      missingStatements === 0,
  };

  const out = join(process.cwd(), "bench/results/affected-assistant.json");
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(`NA organizations with an evidence-backed statement: ${covered} / ${total} (${coveragePercent}%)`);
  console.log(`replayed answers with evidence: ${answersWithEvidence} / ${answers}`);
  console.log(`statements with evidence: ${statementsWithEvidence} / ${statements}`);
  console.log(`personal data leaks: ${personalDataLeaks}; outside-region answers: ${outsideRegionAnswers}`);
  console.log(`result: ${result.passed ? "PASS" : "FAIL"}; written: ${out}`);
  if (!result.passed) process.exitCode = 1;
} finally {
  await client.end();
}
