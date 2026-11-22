/**
 * OpenCTI export connector.
 *
 * Produces a STIX 2.1 bundle from Nouvelle-Aquitaine events only. The input is
 * an allow-listed projection of the database: summaries, evidence, precise
 * coordinates and any other free text never reach this module. Every emitted
 * string still goes through the shared privacy scrubber.
 *
 * Nothing is sent over the network: the bundle is returned to the caller,
 * which can write it to a file or hand it to an OpenCTI importer. No paid
 * service and no server dependency are involved.
 */
import { createHash } from "node:crypto";
import { scrubText, scrubUrl } from "./privacy.js";
import { NA_DEPARTMENTS } from "../filiation/siret.js";

export type ExportEventRow = {
  id: number | string;
  dedupKey?: string;
  family: string;
  title: string;
  observedAt?: string | Date | null;
  collectedAt?: string | Date | null;
  severity?: number | null;
  confidence?: string | null;
  sourceId: string;
  sourceUrl?: string | null;
  sourceName?: string | null;
  sourceRelevance?: string | null;
  regional?: boolean | null;
  orgId?: number | null;
  orgName?: string | null;
  orgDept?: string | null;
  orgDomain?: string | null;
};

export type StixObject = Record<string, unknown>;

export type StixBundle = {
  type: "bundle";
  id: string;
  spec_version: "2.1";
  objects: StixObject[];
};

export type ExportSkip = { id: number | string; reason: string };

export type OpenCtiExport = {
  bundle: StixBundle;
  exported: number;
  graySources: number;
  skipped: ExportSkip[];
};

const NAMESPACE = "radar-cyber/opencti-connector/v1";
const RADAR_IDENTITY_ID = stixId("identity", "radar-cyber");
const REGION_LOCATION_ID = stixId("location", "nouvelle-aquitaine");
const EPOCH = "1970-01-01T00:00:00.000Z";

/** Deterministic, valid-looking STIX identifier (UUID v5 shape). */
function stixId(type: string, seed: string): string {
  const hex = createHash("sha256").update(`${NAMESPACE}:${type}:${seed}`).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "5";
  chars[16] = "a";
  const uuid = chars.join("");
  return `${type}--${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function department(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (/^\d$/.test(raw)) return `0${raw}`;
  return /^\d{2,3}$/.test(raw) ? raw : null;
}

/** A row qualifies only with an explicit regional verdict or an NA organisation. */
export function isNouvelleAquitaine(row: ExportEventRow): boolean {
  if (row.regional === true) return true;
  const dept = department(row.orgDept);
  return dept !== null && NA_DEPARTMENTS[dept] === true;
}

function reportFor(row: ExportEventRow): StixObject {
  const key = String(row.dedupKey ?? row.id);
  const identifyingDate = iso(row.observedAt) ?? iso(row.collectedAt) ?? EPOCH;
  const dept = department(row.orgDept);
  const naDept = dept !== null && NA_DEPARTMENTS[dept] === true ? dept : "unspecified";
  const isGray = String(row.sourceRelevance ?? "").toLowerCase() === "context";
  const sourceName = scrubText(row.sourceName) || scrubText(row.sourceId);
  const reference: StixObject = { source_name: sourceName };
  const url = scrubUrl(row.sourceUrl);
  if (url !== null) reference.url = url;

  const report: StixObject = {
    type: "report",
    spec_version: "2.1",
    id: stixId("report", key),
    created_by_ref: RADAR_IDENTITY_ID,
    created: identifyingDate,
    modified: identifyingDate,
    published: identifyingDate,
    name: scrubText(row.title),
    report_types: ["threat-report"],
    labels: [
      "nouvelle-aquitaine",
      `department:${naDept}`,
      `family:${scrubText(row.family).toLowerCase()}`,
      `source-trust:${isGray ? "gray" : "standard"}`,
    ],
    object_refs: [RADAR_IDENTITY_ID, REGION_LOCATION_ID],
    external_references: [reference],
  };
  const orgName = scrubText(row.orgName);
  if (orgName.length > 0) report.description = `Organisation: ${orgName}`;
  return report;
}

/** Build the bundle. Input order does not change the output. */
export function exportToOpenCti(rows: readonly ExportEventRow[]): OpenCtiExport {
  const ordered = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true }));
  const skipped: ExportSkip[] = [];
  const reports: StixObject[] = [];
  let graySources = 0;

  for (const row of ordered) {
    if (!isNouvelleAquitaine(row)) {
      skipped.push({ id: row.id, reason: "outside-nouvelle-aquitaine" });
      continue;
    }
    if (String(row.sourceRelevance ?? "").toLowerCase() === "context") graySources++;
    reports.push(reportFor(row));
  }

  const identity: StixObject = {
    type: "identity",
    spec_version: "2.1",
    id: RADAR_IDENTITY_ID,
    created: EPOCH,
    modified: EPOCH,
    name: "Radar Cyber Nouvelle-Aquitaine",
    identity_class: "organization",
  };
  const location: StixObject = {
    type: "location",
    spec_version: "2.1",
    id: REGION_LOCATION_ID,
    created: EPOCH,
    modified: EPOCH,
    name: "Nouvelle-Aquitaine",
    region: "nouvelle-aquitaine",
  };

  return {
    bundle: {
      type: "bundle",
      id: stixId("bundle", ordered.map((row) => String(row.id)).join(",")),
      spec_version: "2.1",
      objects: [identity, location, ...reports],
    },
    exported: reports.length,
    graySources,
    skipped,
  };
}
