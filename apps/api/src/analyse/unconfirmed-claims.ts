/**
 * Unconfirmed claims — a deterministic reading of the verified Nouvelle-Aquitaine corpus.
 *
 * The corpus labels each incident with a trust level: `etabli` (the victim or an
 * authority confirmed it), `declare` (an attacker claim, not confirmed) and
 * `rapporte` (reported by the press alone). This module counts the second group,
 * restricted to Nouvelle-Aquitaine, and never exposes victim names or free text.
 *
 * Grey public publishers are accepted as claim evidence, never as confirmation:
 * an official publisher disqualifies the row. No network, no paid service, no
 * database query — the source of truth is the versioned, cited corpus.
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

export type UnconfirmedClaim = {
  id: string;
  department: string;
  publicationDate: string | null;
  publisherKind: PublisherKind;
  incidentType: string | null;
};

export type UnconfirmedClaimsSummary = {
  scope: "Nouvelle-Aquitaine";
  definition: "declare";
  corpusTotal: number;
  count: number;
  withGreySource: number;
  byDepartment: { department: string; count: number }[];
  byPublisherKind: { press: number; grey: number; unknown: number };
  incidents: UnconfirmedClaim[];
};

/** A claim that no victim or authority has confirmed in the cited evidence. */
export function isUnconfirmedClaim(incident: CorpusIncident): boolean {
  if (incident.confiance !== "declare") return false;
  if (!NA_SET.has(incident.departement)) return false;
  const kinds = corpusPublishers(incident).map(classifyPublisher);
  if (kinds.length === 0 || kinds.includes("official")) return false;
  return true;
}

/** Counts and projects unconfirmed claims. Duplicate ids collapse to one event. */
export function detectUnconfirmedClaims(incidents: readonly CorpusIncident[]): UnconfirmedClaimsSummary {
  const seen = new Set<string>();
  const rows: UnconfirmedClaim[] = [];
  const byDepartment = new Map<string, number>();
  const byPublisherKind = { press: 0, grey: 0, unknown: 0 };
  let withGreySource = 0;

  for (const incident of incidents) {
    if (seen.has(incident.id)) continue;
    seen.add(incident.id);
    if (!isUnconfirmedClaim(incident)) continue;

    const kinds = corpusPublishers(incident).map(classifyPublisher);
    const primary = classifyPublisher(incident.preuve?.editeur);
    if (primary !== "official") byPublisherKind[primary] += 1;
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
    definition: "declare",
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
