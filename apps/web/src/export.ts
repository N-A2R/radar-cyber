/**
 * Workspace export: CSV and PDF, generated locally with no external service.
 *
 * Safety rules, in order:
 * 1. Only the columns declared for a workspace leave the browser. No free-text
 *    payload, raw event evidence or journal proof is ever exported.
 * 2. Rows outside Nouvelle-Aquitaine are dropped. Grey/uncertain sources are
 *    kept: uncertainty is information, not a reason to hide a row.
 * 3. Values are scrubbed of direct identifiers (email, phone, SSN, IBAN, IP)
 *    as a second line of defence. Victim personal data has no column here.
 */
import type { ViewKey } from "./contracts";

export type ExportFormat = "csv" | "pdf";
export type DataRow = Record<string, unknown>;
export type PreparedRow = Record<string, string | number | null>;
type Column = { field: string; label: string };
export const NA_DEPARTMENTS: Record<string, true> = {
  "16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
  "40": true, "47": true, "64": true, "79": true, "85": true, "86": true,
};

/** Anciens écrans encore acceptés, rouverts vers leur destination courante. */
export const LEGACY_VIEW_WORKSPACE: Record<string, ViewKey> = {
  today: "map", coverage: "map", couverture: "map", na: "map",
  affected: "map", graph: "map", directory: "map", attributions: "map",
  review: "action", alerts: "action",
  sources: "sources", "sources-dashboard": "sources", health: "sources",
  corpus: "sources", journal: "journal", dossier: "journal",
};

/** Resolve a current view or a legacy screen name to its workspace. */
export function workspaceFor(view: string): ViewKey {
  if (view === "map" || view === "action" || view === "sources" || view === "journal") return view;
  return LEGACY_VIEW_WORKSPACE[view] ?? "map";
}

/**
 * Explicit allowlist: one entry per destination. Legacy screens keep their
 * safe fields through the union of the panels they now live in; English labels
 * are shared by CSV and PDF.
 */
export const EXPORT_COLUMNS: Record<ViewKey, Column[]> = {
  map: [
    { field: "id", label: "ID" }, { field: "date", label: "Date" },
    { field: "family", label: "Family" }, { field: "title", label: "Title" },
    { field: "organisation", label: "Organisation" }, { field: "department", label: "Department" },
    { field: "source", label: "Source" }, { field: "severity", label: "Severity" },
    { field: "latitude", label: "Latitude" }, { field: "longitude", label: "Longitude" },
    { field: "events", label: "Events" }, { field: "seen", label: "Seen" },
    { field: "total", label: "Total" }, { field: "rate", label: "Rate (%)" },
    { field: "organisations", label: "Organisations" }, { field: "withEvents", label: "With events" },
    { field: "sector", label: "Sector" }, { field: "kind", label: "Kind" },
    { field: "city", label: "City" }, { field: "label", label: "Label" },
    { field: "statement", label: "Statement" }, { field: "status", label: "Status" },
    { field: "actor", label: "Actor" }, { field: "groupName", label: "Group" },
    { field: "confidence", label: "Confidence" }, { field: "level", label: "Level" },
    { field: "method", label: "Method" }, { field: "sources", label: "Sources" },
    { field: "claims", label: "Claims" },
  ],
  action: [
    { field: "id", label: "ID" }, { field: "title", label: "Title" },
    { field: "organisation", label: "Organisation" }, { field: "department", label: "Department" },
    { field: "family", label: "Family" }, { field: "source", label: "Source" },
    { field: "status", label: "Status" }, { field: "bucket", label: "Bucket" },
    { field: "date", label: "Date" }, { field: "kind", label: "Kind" },
    { field: "severity", label: "Severity" }, { field: "scope", label: "Scope" },
  ],
  sources: [
    { field: "id", label: "ID" }, { field: "name", label: "Name" },
    { field: "family", label: "Family" }, { field: "kind", label: "Kind" },
    { field: "status", label: "Status" }, { field: "lastSeen", label: "Last seen" },
    { field: "items", label: "Items" }, { field: "events", label: "Events (30d)" },
    { field: "date", label: "Date" }, { field: "sourcesActives", label: "Active sources" },
    { field: "evenements", label: "Events" }, { field: "entrees", label: "Entries" },
    { field: "department", label: "Department" }, { field: "label", label: "Label" },
    { field: "total", label: "Total" },
  ],
  journal: [
    { field: "date", label: "Date" }, { field: "kind", label: "Kind" },
    { field: "actor", label: "Actor" }, { field: "target", label: "Target" },
    { field: "decision", label: "Decision" }, { field: "section", label: "Section" },
    { field: "detail", label: "Detail" },
  ],
};

export const EXPORT_TITLES: Record<ViewKey, string> = {
  map: "Map", action: "Action", sources: "Sources", journal: "Journal",
};
function departmentCode(row: DataRow): string | null {
  for (const key of ["department", "dept", "departement"]) {
    const value = row[key];
    if (typeof value !== "string" && typeof value !== "number") continue;
    const match = String(value).match(/\b(\d{2})\b/);
    if (match) return match[1];
  }
  return null;
}

function isRegional(row: DataRow): boolean {
  const code = departmentCode(row);
  // Aggregates carry no department: every workspace feeding the registry is an
  // NA-scoped endpoint, so a missing code is not a reason to drop the row.
  return code === null || NA_DEPARTMENTS[code] === true;
}

function redact(value: string): string {
  return value
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[redacted]")
    .replace(/(?:\+33[ .-]?)?(?:0[ .-]?)?\d(?:[ .-]?\d){8}\b/g, "[redacted]")
    .replace(/\b\d{15}\b/g, "[redacted]")
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "[redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted]");
}

function cell(value: unknown): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? "yes" : "no";
  const clean = String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  return clean ? redact(clean).slice(0, 200) : null;
}

/** Project a workspace's rows onto its allowlist, after the regional filter. */
export function prepareRows(view: string, rows: DataRow[]): PreparedRow[] {
  const columns = EXPORT_COLUMNS[workspaceFor(view)];
  return rows.filter(isRegional).map((row) => {
    const prepared: PreparedRow = {};
    for (const column of columns) prepared[column.label] = cell(row[column.field]);
    return prepared;
  });
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(view: string, rows: PreparedRow[]): string {
  const labels = EXPORT_COLUMNS[workspaceFor(view)].map((column) => column.label);
  const lines = [labels.map(csvCell).join(",")];
  for (const row of rows) lines.push(labels.map((label) => csvCell(row[label] ?? null)).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** PDF text must stay ASCII: transliterate accents instead of shipping a font. */
function ascii(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e]/g, "?");
}

function pdfEscape(value: string): string {
  const flat = ascii(value).replace(/\s+/g, " ");
  return flat.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < width / 2) cut = width;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

const PAGE_LINES = 48;
const LINE_WIDTH = 108;

/** Build a valid PDF 1.4 file: local, deterministic, no paid service. */
export function buildPdf(view: string, title: string, rows: PreparedRow[]): Uint8Array {
  const labels = EXPORT_COLUMNS[workspaceFor(view)].map((column) => column.label);
  const width = Math.max(24, Math.floor(LINE_WIDTH / Math.max(1, labels.length)));
  const lines: string[] = [ascii(title).toUpperCase(), `${rows.length} rows - Nouvelle-Aquitaine`, ""];
  if (labels.length) lines.push(labels.map((label) => String(label).slice(0, width)).join(" | "));
  for (const row of rows) {
    const cells = labels.map((label) => String(row[label] ?? "").slice(0, width));
    lines.push(...wrap(cells.join(" | "), LINE_WIDTH));
  }
  if (!rows.length) lines.push("No rows on this screen.");

  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += PAGE_LINES) pages.push(lines.slice(i, i + PAGE_LINES));
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  pages.forEach((page, index) => {
    const stream = `BT\n/F1 9 Tf\n12 TL\n40 800 Td\n${page
      .map((line) => `(${pdfEscape(line)}) Tj\nT*`)
      .join("")}ET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index] + 1} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

export function toPdfBlob(view: string, title: string, rows: PreparedRow[]): Blob {
  const bytes = buildPdf(view, title, rows);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportFilename(view: string, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  return `radar-${workspaceFor(view)}-${date}.${format}`;
}
