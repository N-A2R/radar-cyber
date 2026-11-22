/**
 * Reproducible measurement of the OpenCTI export and MISP import connectors.
 *
 * Read-only on the production-shaped database: it counts the real state,
 * exports the Nouvelle-Aquitaine events as a STIX 2.1 bundle, feeds the
 * equivalent MISP JSON back through the importer and compares identifiers.
 * One email attribute per MISP event is a deliberate probe: the importer must
 * drop it. No network call, no paid service, no database write.
 *
 *   DATABASE_URL=postgres://... apps/api/node_modules/.bin/tsx scripts/measure-connectors.mts
 *   DATABASE_URL=postgres://... apps/api/node_modules/.bin/tsx scripts/measure-connectors.mts \
 *     --out=bench/results/connectors-opencti-misp.json
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { exportToOpenCti, type ExportEventRow, type StixObject } from "../apps/api/src/connectors/opencti.js";
import { importMispEvents } from "../apps/api/src/connectors/misp.js";
import { hasPersonalData } from "../apps/api/src/connectors/privacy.js";

const NA_DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const output = process.argv.slice(2).find((arg) => arg.startsWith("--out="))?.slice(6);
if (output !== undefined && !/^[A-Za-z0-9_./-]+$/.test(output)) {
  throw new Error("invalid --out path");
}

type Row = {
  id: number;
  dedup_key: string;
  family: string;
  title: string;
  observed_at: Date | string | null;
  collected_at: Date | string | null;
  severity: number;
  confidence: string | null;
  source_id: string;
  source_url: string | null;
  regional: boolean;
  org_id: number | null;
  org_name: string | null;
  org_dept: string | null;
  org_domain: string | null;
  source_name: string;
  source_relevance: string;
};

const NA_SQL = `SELECT e.id, e.dedup_key, e.family, e.title, e.observed_at, e.collected_at,
                       e.severity, e.confidence, e.source_id, e.source_url, e.regional,
                       e.org_id, o.name AS org_name, o.dept AS org_dept, o.domain AS org_domain,
                       s.name AS source_name, s.relevance AS source_relevance
                  FROM event e
                  LEFT JOIN org o ON o.id = e.org_id
                  LEFT JOIN source s ON s.id = e.source_id
                 WHERE e.regional = true OR o.dept = ANY($1::text[])
                 ORDER BY e.id`;

function toExportRow(row: Row): ExportEventRow {
  return {
    id: row.id,
    dedupKey: row.dedup_key,
    family: row.family,
    title: row.title,
    observedAt: row.observed_at,
    collectedAt: row.collected_at,
    severity: row.severity,
    confidence: row.confidence,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    sourceRelevance: row.source_relevance,
    regional: row.regional,
    orgId: row.org_id,
    orgName: row.org_name,
    orgDept: row.org_dept,
    orgDomain: row.org_domain,
  };
}

/** Build a MISP event from an exported STIX report; the email is a privacy probe. */
function toMisp(report: StixObject): Record<string, unknown> {
  const labels = (report.labels ?? []) as string[];
  const dept = labels.find((label) => String(label).startsWith("department:"))?.slice("department:".length);
  const tags = dept && dept !== "unspecified" ? [{ name: `na:${dept}` }] : [{ name: "region:nouvelle-aquitaine" }];
  if (labels.includes("source-trust:gray")) tags.push({ name: "source-trust:gray" });
  const references = (report.external_references ?? []) as { url?: string }[];
  const attributes: Record<string, string>[] = [{ type: "email", value: "victim.probe@example.invalid" }];
  if (references[0]?.url !== undefined) attributes.push({ type: "url", value: references[0].url });
  return {
    uuid: String(report.id).replace("report--", ""),
    info: report.name,
    date: String(report.published).slice(0, 10),
    Tag: tags,
    Attribute: attributes,
  };
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const totals = await query<{ organizations: string; sources: string; events: string }>(
    `SELECT (SELECT count(*) FROM org)::text AS organizations,
            (SELECT count(*) FROM source)::text AS sources,
            (SELECT count(*) FROM event)::text AS events`,
  );
  const rows = await query<Row>(NA_SQL, [NA_DEPARTMENTS]);
  const exported = exportToOpenCti(rows.rows.map(toExportRow));
  const reports = exported.bundle.objects.filter((object) => object.type === "report");
  const bundleJson = JSON.stringify(exported.bundle);
  const imported = importMispEvents({ Event: reports.map(toMisp) });

  const exportedIds = reports.map((report) => String(report.id).replace("report--", ""));
  const importedIds = new Set(imported.accepted.map((event) => event.id));
  const roundTripMatched = exportedIds.filter((id) => importedIds.has(id)).length;
  const coverage = exported.exported === 0 ? 0 : Number((100 * roundTripMatched / exported.exported).toFixed(2));
  const personalDataLeaks = hasPersonalData(bundleJson) ? 1 : 0;
  const state = totals.rows[0];

  const result = {
    generatedAt: new Date().toISOString(),
    state: {
      organizations: Number(state?.organizations),
      sources: Number(state?.sources),
      events: Number(state?.events),
    },
    export: {
      naEvents: rows.rowCount,
      exported: exported.exported,
      stixObjects: exported.bundle.objects.length,
      graySources: exported.graySources,
      skippedOutsideRegion: exported.skipped.length,
      personalDataLeaks,
    },
    import: {
      mispEvents: reports.length,
      accepted: imported.accepted.length,
      rejected: imported.rejected.length,
      personalAttributesDropped: imported.attributesDropped,
      roundTripMatched,
    },
    objective: {
      exportAndImportTested: roundTripMatched,
      coveragePercent: coverage,
      passed: coverage === 100 && personalDataLeaks === 0 && imported.rejected.length === 0,
    },
    durationMs: Math.round(performance.now() - startedAt),
  };

  console.log(JSON.stringify(result, null, 2));
  if (output !== undefined) {
    writeFileSync(fileURLToPath(new URL(`../${output}`, import.meta.url)), `${JSON.stringify(result, null, 2)}\n`);
  }
  if (!result.objective.passed) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
