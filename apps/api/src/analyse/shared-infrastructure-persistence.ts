/**
 * Cross-checks the geographic and temporal reuse of infrastructure shared by
 * Nouvelle-Aquitaine victims.
 *
 * Only organization ids, department codes, infrastructure hosts and dates enter
 * the inputs; the output keeps only cluster ids, department codes, day spans
 * and booleans. No victim name, no claim body, no e-mail and no personal data.
 * Gray sources stay eligible; there is no network call and no paid source.
 *
 * A cluster is "persistent" when the same shared anchor links victims established
 * in at least two distinct NA departments and was observed on at least two
 * distinct UTC days. This combines two already measured dimensions into a single
 * stronger signal for regional watch; it is neither an attribution nor proof of
 * a coordinated campaign.
 */
import type { InfrastructureGeography } from "./shared-infrastructure-geography.js";
import type { InfrastructureTimeline } from "./shared-infrastructure-timeline.js";

export type ClusterPersistence = {
  id: string;
  departments: string[];
  reuseDays: number;
  crossDepartment: boolean;
  dated: boolean;
  persistent: boolean;
};

export type InfrastructurePersistence = {
  clusterCount: number;
  persistentClusters: number;
  clusters: ClusterPersistence[];
};

/**
 * Joins geography and timeline by cluster id. An entry missing from either
 * input is never treated as satisfying the other dimension; input order does
 * not change the result.
 */
export function buildInfrastructurePersistence(
  geography: InfrastructureGeography,
  timeline: InfrastructureTimeline,
): InfrastructurePersistence {
  const byId = new Map(timeline.clusterTimelines.map((entry) => [entry.id, entry]));
  const clusters = geography.clusterGeographies.map((place) => {
    const dated = byId.get(place.id);
    const isDated = dated?.dated === true;
    return {
      id: place.id,
      departments: place.departments,
      reuseDays: dated?.reuseDays ?? 0,
      crossDepartment: place.crossDepartment,
      dated: isDated,
      persistent: place.crossDepartment && isDated,
    };
  });

  return {
    clusterCount: clusters.length,
    persistentClusters: clusters.filter((cluster) => cluster.persistent).length,
    clusters,
  };
}
