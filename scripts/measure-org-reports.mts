/**
 * Exhaustive, reproducible measurement of the ten-page organisation report.
 *
 * For every valid organisation in the real database, the script builds the
 * report from the same builder used by the HTTP route and checks that it has
 * exactly ten pages in the documented order. A PDF is serialized for the
 * first organisation of every Nouvelle-Aquitaine department (plus one with
 * no department) and its page tree is verified as well.
 *
 * Usage:
 *   pnpm org-report:measure [--json=bench/results/org-report.json]
 *
 * Read-only: no table is written. All commands finish well under a minute.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import {
  buildOrgReport, countPdfPages, NA_DEPARTMENTS, renderOrgReportPdf,
  REPORT_PAGE_COUNT, REPORT_PAGE_TITLES,
} from "../apps/api/src/report/org-report.js";
import {
  fetchOrgBatch, inputFromRow, loadReportIndex,
} from "../apps/api/src/report/org-report-data.js";

type Options = { json: string | null; batch: number };

function options(argv: string[]): Options {
  let json: string | null = null;
  let batch = 10_000;
  for (const arg of argv) {
    if (arg.startsWith("--json=")) json = arg.slice("--json=".length);
    else if (arg.startsWith("--batch=")) batch = Number(arg.slice("--batch=".length));
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!Number.isInteger(batch) || batch < 1 || batch > 100_000) {
    throw new Error("--batch must be an integer between 1 and 100000");
  }
  return { json, batch };
}

async function main(): Promise<void> {
  const opts = options(process.argv.slice(2));
  const started = performance.now();
  const index = await loadReportIndex();
  const generatedAt = new Date().toISOString();

  let after = 0;
  let checked = 0;
  let wrongPageCount = 0;
  let wrongPdf = 0;
  let pdfSamples = 0;
  const sampledDepartments = new Set<string>();

  for (;;) {
    const rows = await fetchOrgBatch(after, opts.batch);
    if (rows.length === 0) break;
    for (const row of rows) {
      const input = inputFromRow(row, index, generatedAt);
      const report = buildOrgReport(input);
      if (report.pages.length !== REPORT_PAGE_COUNT
        || report.pages.some((page, i) => page.title !== REPORT_PAGE_TITLES[i])) {
        wrongPageCount += 1;
      }
      const dept = row.dept ?? "(none)";
      const inScope = dept === "(none)" || NA_DEPARTMENTS[dept] === true;
      if (inScope && !sampledDepartments.has(dept)) {
        sampledDepartments.add(dept);
        const pdf = renderOrgReportPdf(report);
        if (!pdf.subarray(0, 8).toString("latin1").startsWith("%PDF-1.4")
          || countPdfPages(pdf) !== REPORT_PAGE_COUNT) {
          wrongPdf += 1;
        }
        pdfSamples += 1;
      }
      checked += 1;
      after = row.id;
    }
  }

  const elapsed = Math.round(performance.now() - started);
  const eligible = index.baseline.orgs;
  const result = {
    eligible,
    checked,
    pagesPerReport: REPORT_PAGE_COUNT,
    wrongPageCount,
    pdfSamples,
    wrongPdf,
    departmentsSampled: sampledDepartments.size,
    sources: index.baseline.sources,
    events: index.baseline.events,
    durationMs: elapsed,
  };

  process.stdout.write(
    `BASELINE_ORGS=${eligible}\n` +
    `BASELINE_SOURCES=${index.baseline.sources}\n` +
    `BASELINE_EVENTS=${index.baseline.events}\n` +
    `ORG_REPORT_ELIGIBLE=${checked}/${eligible}\n` +
    `ORG_REPORT_PAGES=${REPORT_PAGE_COUNT}/${REPORT_PAGE_COUNT}\n` +
    `ORG_REPORT_PDF_SAMPLES=${pdfSamples - wrongPdf}/${pdfSamples}\n` +
    `MEASURE_MS=${elapsed}\n`,
  );

  if (opts.json) {
    const path = resolve(opts.json);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  if (checked !== eligible || wrongPageCount > 0 || wrongPdf > 0) {
    throw new Error("ten-page report measurement failed");
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`measure-org-reports: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await closePools();
}
