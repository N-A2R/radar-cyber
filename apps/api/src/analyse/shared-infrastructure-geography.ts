/**
 * Geographic reach of infrastructure shared by Nouvelle-Aquitaine victims.
 *
 * Only organization ids, department codes and infrastructure hosts enter this
 * module: no victim name, no claim body, no e-mail and no personal data. Gray
 * sources stay eligible, no network call or paid source is involved.
 *
 * A cluster is "cross-department" when its victims are established in at least
 * two distinct Nouvelle-Aquitaine departments. This measures the regional
 * spread of a shared anchor, not an attribution or a causal link.
 */
import type { SharedInfrastructureDetection } from "./shared-infrastructure.js";

export type ClusterGeography = {
  id: string;
  departments: string[];
  crossDepartment: boolean;
};

export type InfrastructureGeography = {
  clusterCount: number;
  crossDepartmentClusters: number;
  departmentsCovered: number;
  clusterGeographies: ClusterGeography[];
};

/**
 * Resolves the department of each clustered victim from an explicit lookup.
 * Victims absent from the lookup are ignored rather than assigned a guessed
 * department. Department codes are deduplicated and sorted, so neither victim
 * order nor lookup insertion order changes the result.
 */
export function buildInfrastructureGeography(
  detection: SharedInfrastructureDetection,
  departmentsByOrg: ReadonlyMap<number, string>,
): InfrastructureGeography {
  const covered = new Set<string>();
  const clusterGeographies = detection.clusters.map((cluster) => {
    const departments = new Set<string>();
    for (const orgId of cluster.victims) {
      const raw = departmentsByOrg.get(orgId);
      if (typeof raw !== "string") continue;
      const dept = raw.trim();
      if (dept !== "") departments.add(dept);
    }
    const sorted = [...departments].sort();
    for (const dept of sorted) covered.add(dept);
    return {
      id: cluster.id,
      departments: sorted,
      crossDepartment: sorted.length >= 2,
    };
  });

  return {
    clusterCount: clusterGeographies.length,
    crossDepartmentClusters: clusterGeographies.filter((entry) => entry.crossDepartment).length,
    departmentsCovered: covered.size,
    clusterGeographies,
  };
}
