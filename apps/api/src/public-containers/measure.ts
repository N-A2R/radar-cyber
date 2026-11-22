/**
 * Measurement of publicly accessible containers holding Nouvelle-Aquitaine
 * data. The baseline is read from the real database; the container count is
 * recomputed from the versioned redacted corpus, offline and deterministically.
 *
 * No query selects a summary, a body, a victim name or any contact detail.
 */
import { query } from "../db.js";
import { NA_DEPARTMENTS } from "./detect.js";
import {
  countAccessible,
  type ContainerCorpus,
  type ContainerCount,
} from "./corpus.js";

const NA_LIST = NA_DEPARTMENTS.map((code) => `'${code}'`).join(", ");

export const SQL = {
  baseline: `SELECT (SELECT count(*) FROM org)::int AS organizations,
                    (SELECT count(*) FROM org WHERE dept IN (${NA_LIST}))::int AS "naOrganizations",
                    (SELECT count(*) FROM source)::int AS sources,
                    (SELECT count(*) FROM event)::int AS events`,
} as const;

export type PublicContainerMeasurement = ContainerCount & {
  scope: "nouvelle-aquitaine";
  basis: "anonymous-public-metadata";
  candidatesScanned: number;
  corpusCollectedAt: string;
  baseline: { organizations: number; naOrganizations: number; sources: number; events: number };
  measuredAt: string;
};

export async function measurePublicContainers(corpus: ContainerCorpus): Promise<PublicContainerMeasurement> {
  const { rows } = await query<{
    organizations: number;
    naOrganizations: number;
    sources: number;
    events: number;
  }>(SQL.baseline);
  const baseline = rows[0] ?? { organizations: 0, naOrganizations: 0, sources: 0, events: 0 };
  return {
    scope: "nouvelle-aquitaine",
    basis: "anonymous-public-metadata",
    ...countAccessible(corpus),
    candidatesScanned: corpus.candidatesScanned,
    corpusCollectedAt: corpus.collectedAt,
    baseline: {
      organizations: Number(baseline.organizations),
      naOrganizations: Number(baseline.naOrganizations),
      sources: Number(baseline.sources),
      events: Number(baseline.events),
    },
    measuredAt: new Date().toISOString(),
  };
}
