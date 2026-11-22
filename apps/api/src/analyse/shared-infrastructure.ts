/**
 * Deterministic detection of infrastructure shared by victims in Nouvelle-Aquitaine.
 *
 * Only organization ids and infrastructure values enter this module: no victim
 * names, no claim bodies, no e-mail addresses and no personal data. Public and
 * gray sources are treated the same; no paid source and no network call is
 * involved.
 *
 * An anchor is an infrastructure value observed for at least two distinct NA
 * victims. Two victims belong to the same cluster when a chain of shared
 * anchors connects them (union-find): a single aggregator domain is never an
 * anchor, so news sites and claim indexes cannot merge unrelated victims.
 */
import { isIP } from "node:net";

export type InfrastructureKind =
  | "leak_site"
  | "claim_evidence"
  | "event_source"
  | "dns_a"
  | "dns_aaaa"
  | "dns_mx"
  | "dns_ns";

export type InfrastructureObservation = {
  orgId: number;
  kind: InfrastructureKind;
  value: string;
};

export type SharedAnchor = {
  value: string;
  kinds: InfrastructureKind[];
  victims: number[];
};

export type SharedInfrastructureCluster = {
  id: string;
  anchors: SharedAnchor[];
  victims: number[];
  size: number;
};

export type SharedInfrastructureDetection = {
  clusters: SharedInfrastructureCluster[];
  clusterCount: number;
  victimsInClusters: number;
  sharedAnchors: number;
  observations: number;
};

const URL_KINDS: Readonly<Record<InfrastructureKind, boolean>> = {
  leak_site: true,
  claim_evidence: true,
  event_source: true,
  dns_a: false,
  dns_aaaa: false,
  dns_mx: false,
  dns_ns: false,
};

const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function cleanHost(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
  if (host.length < 6 || host.includes(" ") || host.includes("/")) return null;
  if (isIP(host) !== 0) return host;
  if (HOST_RE.test(host) && host.includes(".")) return host;
  return null;
}

/**
 * Normalizes one observation to a comparable infrastructure value.
 * URL observations are reduced to their host (paths and query strings carry
 * per-victim data and must never be published); only onion hosts and IPs are
 * kept, so claim aggregators such as ransomlook.io are excluded by design.
 */
export function normalizeInfrastructure(observation: InfrastructureObservation): string | null {
  if (typeof observation.value !== "string") return null;
  if (!URL_KINDS[observation.kind]) return cleanHost(observation.value);
  const raw = observation.value.trim();
  if (raw === "") return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host.endsWith(".onion") || isIP(host) !== 0) return cleanHost(host);
    return null;
  } catch {
    return null;
  }
}

type AnchorEntry = { value: string; kinds: Set<InfrastructureKind>; victims: Set<number> };

class UnionFind {
  private readonly parent = new Map<number, number>();

  add(id: number): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: number): number {
    const parent = this.parent.get(id);
    if (parent === undefined || parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(Math.max(ra, rb), Math.min(ra, rb));
  }

  groups(): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      const members = groups.get(root) ?? [];
      members.push(id);
      groups.set(root, members);
    }
    return groups;
  }
}

/** Builds the shared-infrastructure clusters from raw observations. */
export function detectSharedInfrastructure(
  observations: readonly InfrastructureObservation[],
): SharedInfrastructureDetection {
  const anchors = new Map<string, AnchorEntry>();
  const seen = new Set<string>();
  let normalizedCount = 0;

  for (const observation of observations) {
    if (!Number.isInteger(observation.orgId) || observation.orgId <= 0) continue;
    const value = normalizeInfrastructure(observation);
    if (value === null) continue;
    const dedupe = `${observation.orgId}|${value}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    normalizedCount += 1;
    const entry = anchors.get(value) ?? {
      value,
      kinds: new Set<InfrastructureKind>(),
      victims: new Set<number>(),
    };
    entry.kinds.add(observation.kind);
    entry.victims.add(observation.orgId);
    anchors.set(value, entry);
  }

  const union = new UnionFind();
  for (const entry of anchors.values()) {
    const victims = [...entry.victims].sort((a, b) => a - b);
    for (const victim of victims) union.add(victim);
    if (victims.length < 2) continue;
    for (const victim of victims.slice(1)) union.union(victims[0] as number, victim);
  }

  const shared = [...anchors.values()]
    .filter((entry) => entry.victims.size >= 2)
    .sort((a, b) => a.value.localeCompare(b.value));

  const clusters: SharedInfrastructureCluster[] = [];
  for (const members of union.groups().values()) {
    if (members.length < 2) continue;
    const victims = members.sort((a, b) => a - b);
    const set = new Set(victims);
    const clusterAnchors: SharedAnchor[] = shared
      .filter((entry) => [...entry.victims].every((victim) => set.has(victim)))
      .map((entry) => ({
        value: entry.value,
        kinds: [...entry.kinds].sort(),
        victims: [...entry.victims].sort((a, b) => a - b),
      }));
    if (clusterAnchors.length === 0) continue;
    clusters.push({
      id: `infra:${clusterAnchors.map((a) => a.value).join("+")}`,
      anchors: clusterAnchors,
      victims,
      size: victims.length,
    });
  }
  clusters.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));

  return {
    clusters,
    clusterCount: clusters.length,
    victimsInClusters: new Set(clusters.flatMap((c) => c.victims)).size,
    sharedAnchors: shared.length,
    observations: normalizedCount,
  };
}
