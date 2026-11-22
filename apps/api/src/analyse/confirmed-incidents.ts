/**
 * Confirmed incidents — a deterministic reading of the verified Nouvelle-Aquitaine corpus.
 *
 * The corpus labels each incident with a trust level: `etabli` (the victim or an
 * authority confirmed it), `declare` (an unconfirmed attacker claim) and
 * `rapporte` (reported by the press alone). This module counts the first group,
 * restricted to Nouvelle-Aquitaine, and never exposes victim names or free text.
 *
 * The confirmation comes from the verified corpus label, not from a publisher
 * name: grey public publishers remain leads, never confirmation. No network, no
 * paid service, no database query.
 */
import {
  classifyPublisher,
  corpusPublishers,
  NA_DEPARTMENTS,
  type CorpusIncident,
  type PublisherKind,
} from "./press-only.js";

export { classifyPublisher, NA_DEPARTMENTS };
export type { CorpusIncident };

const NA_SET = new Set<string>(NA_DEPARTMENTS);

export type ConfirmedIncident = {
  id: string;
  department: string;
  publicationDate: string | null;
  publisherKind: PublisherKind;
  incidentType: string | null;
};

export type ConfirmedIncidentsSummary = {
  scope: "Nouvelle-Aquitaine";
  definition: "etabli";
  corpusTotal: number;
  count: number;
  withGreySource: number;
  byDepartment: { department: string; count: number }[];
  byPublisherKind: { press: number; grey: number; official: number; unknown: number };
  incidents: ConfirmedIncident[];
};

/** An incident the verified corpus records as confirmed by a victim or authority. */
export function isConfirmedIncident(incident: CorpusIncident): boolean {
  if (incident.confiance !== "etabli") return false;
  if (!NA_SET.has(incident.departement)) return false;
  return corpusPublishers(incident).length > 0;
}

/** Counts and projects confirmed incidents. Duplicate ids collapse to one event. */
export function detectConfirmedIncidents(incidents: readonly CorpusIncident[]): ConfirmedIncidentsSummary {
  const seen = new Set<string>();
  const rows: ConfirmedIncident[] = [];
  const byDepartment = new Map<string, number>();
  const byPublisherKind = { press: 0, grey: 0, official: 0, unknown: 0 };
  let withGreySource = 0;

  for (const incident of incidents) {
    if (seen.has(incident.id)) continue;
    seen.add(incident.id);
    if (!isConfirmedIncident(incident)) continue;

    const kinds = corpusPublishers(incident).map(classifyPublisher);
    const primary = classifyPublisher(incident.preuve?.editeur);
    byPublisherKind[primary] += 1;
    if (kinds.includes("grey")) withGreySource += 1;
    byDepartment.set(incident.departement, (byDepartment.get(incident.departement) ?? 0) + 1);

    rows.push({
      id: incident.id,
      department: incident.departement,
      publicationDate: incident.datePublique ?? null,
      publisherKind: primary,
      incidentType: incident.type ?? null,
    });
  }

  rows.sort((a, b) =>
    (b.publicationDate ?? "").localeCompare(a.publicationDate ?? "") || a.id.localeCompare(b.id));

  return {
    scope: "Nouvelle-Aquitaine",
    definition: "etabli",
    corpusTotal: incidents.length,
    count: rows.length,
    withGreySource,
    byDepartment: [...byDepartment.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => a.department.localeCompare(b.department)),
    byPublisherKind,
    incidents: rows,
  };
}
