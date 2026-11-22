/**
 * MISP import connector.
 *
 * Reads the JSON shape exposed by MISP (`Event` / `Attribute` / `Tag`) and
 * returns a normalised, region-scoped list of events. Only allow-listed
 * attribute types are kept: personal identifiers (email addresses, phone
 * numbers, names, IBANs, ...) are never accepted into the radar.
 *
 * The connector is pure: no network call, no database write, no paid service.
 * The caller decides what to do with the accepted events.
 */
import { NA_DEPARTMENTS } from "../filiation/siret.js";
import { scrubText, scrubUrl, hasPersonalData } from "./privacy.js";

export type MispAttribute = {
  type?: unknown;
  value?: unknown;
  id?: unknown;
  category?: unknown;
  timestamp?: unknown;
};

export type MispEvent = {
  uuid?: unknown;
  id?: unknown;
  info?: unknown;
  date?: unknown;
  timestamp?: unknown;
  Attribute?: unknown;
  attributes?: unknown;
  Tag?: unknown;
  tags?: unknown;
  Org?: unknown;
};

export type MispIndicator = { type: string; value: string };

export type ImportedEvent = {
  id: string;
  title: string;
  observedAt: string | null;
  department: string | null;
  sourceId: string;
  sourceTrust: "gray" | "standard";
  indicators: MispIndicator[];
  attributesDropped: number;
};

export type MispImportResult = {
  accepted: ImportedEvent[];
  rejected: { id: string; reason: string }[];
  attributesDropped: number;
};

/** Observable types that carry no personal data by construction. */
const ALLOWED_TYPES: Readonly<Record<string, true>> = {
  domain: true, "ip-dst": true, "ip-src": true, url: true,
  sha256: true, sha1: true, md5: true, filename: true,
  vulnerability: true, malware: true, "threat-actor": true,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** MISP exposes one event, a list, or a `response.Event` wrapper. */
export function extractMispEvents(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  if (root === null) return [];
  const direct = root.Event ?? root.event;
  if (Array.isArray(direct)) return direct;
  if (asRecord(direct) !== null) return [direct];
  const response = asRecord(root.response);
  const nested = response?.Event ?? response?.event;
  return Array.isArray(nested) ? nested : asRecord(nested) !== null ? [nested] : [];
}

function tagNames(event: MispEvent): string[] {
  const raw = event.Tag ?? event.tags;
  return asArray(raw).flatMap((tag) => {
    if (typeof tag === "string") return [tag];
    const record = asRecord(tag);
    return typeof record?.name === "string" ? [record.name] : [];
  });
}

/** Read the region from an explicit MISP tag; a missing tag is never guessed. */
export function regionFromTags(tags: readonly string[]): string | null {
  for (const raw of tags) {
    const match = /^(?:na|region|nouvelle-aquitaine)[:=-](.+)$/i.exec(raw.trim());
    if (match === null) continue;
    const value = match[1]!.trim().toLowerCase();
    if (/^0?\d{1,2}$/.test(value)) {
      const dept = value.padStart(2, "0");
      if (NA_DEPARTMENTS[dept] === true) return dept;
      continue;
    }
    if (value === "nouvelle-aquitaine" || value === "na") return "region";
  }
  return null;
}

function observedAt(event: MispEvent): string | null {
  const raw = typeof event.date === "string" ? event.date : null;
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function attributes(event: MispEvent): { indicators: MispIndicator[]; dropped: number } {
  const indicators: MispIndicator[] = [];
  let dropped = 0;
  for (const item of asArray(event.Attribute ?? event.attributes)) {
    const attribute = asRecord(item);
    if (attribute === null || typeof attribute.value !== "string") {
      dropped++;
      continue;
    }
    const type = typeof attribute.type === "string" ? attribute.type.trim().toLowerCase() : "";
    if (ALLOWED_TYPES[type] !== true) {
      dropped++;
      continue;
    }
    const value = type === "url" ? scrubUrl(attribute.value) : scrubText(attribute.value);
    if (value === null || value.length === 0 || value.length > 512 || hasPersonalData(attribute.value)) {
      dropped++;
      continue;
    }
    indicators.push({ type, value });
  }
  return { indicators, dropped };
}

/** Normalise a MISP payload; unknown or out-of-region events are reported, never guessed. */
export function importMispEvents(payload: unknown): MispImportResult {
  const accepted: ImportedEvent[] = [];
  const rejected: MispImportResult["rejected"] = [];
  const seen = new Set<string>();
  let attributesDropped = 0;

  extractMispEvents(payload).forEach((raw, index) => {
    const event = asRecord(raw) as MispEvent | null;
    const fallbackId = `misp-index-${index}`;
    const id = typeof event?.uuid === "string" && event.uuid.trim().length > 0
      ? event.uuid.trim()
      : typeof event?.id === "string" || typeof event?.id === "number"
        ? `misp:${String(event.id)}`
        : fallbackId;

    if (event === null) {
      rejected.push({ id, reason: "invalid-event" });
      return;
    }
    const tags = tagNames(event);
    const gray = tags.some((tag) => /^(?:source[-_]trust|source)[:=]gray$/i.test(tag.trim()));
    const department = regionFromTags(tags);
    if (department === null) {
      rejected.push({ id, reason: "outside-nouvelle-aquitaine" });
      return;
    }
    if (typeof event.info !== "string" || event.info.trim().length === 0) {
      rejected.push({ id, reason: "missing-title" });
      return;
    }
    if (seen.has(id)) {
      rejected.push({ id, reason: "duplicate-uuid" });
      return;
    }

    const parsed = attributes(event);
    attributesDropped += parsed.dropped;
    seen.add(id);
    accepted.push({
      id,
      title: scrubText(event.info),
      observedAt: observedAt(event),
      department,
      sourceId: `misp:${id}`,
      sourceTrust: gray ? "gray" : "standard",
      indicators: parsed.indicators,
      attributesDropped: parsed.dropped,
    });
  });

  return { accepted, rejected, attributesDropped };
}
