/**
 * Digital-twin attack propagation on the real regional knowledge graph.
 *
 * The simulation is deliberately evidence-based: an attack starts on an
 * organization, reaches the events that targeted it, then moves through
 * typed correlation links (threat actor, product, reporting source, grey
 * publication host, shared domain). Only organizations are counted as
 * impacted; every other node is a pivot. No label, title or free text is
 * ever consumed or emitted.
 *
 * Taxonomy links (`contains`, `located_in`) are excluded: family membership
 * and department location are not observable exposure paths.
 */

export type GraphNode = {
  id: string;
  kind: string;
  dept?: string | null;
  label?: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: string;
  validFrom: string | Date;
  validTo?: string | Date | null;
};

export const PROPAGATION_RELATIONS: readonly string[] = [
  "targeted_by",
  "claims",
  "attributed_to",
  "mentions_product",
  "produced_by",
  "reported_by",
  "published_on",
  "owns_domain",
  "dns_link",
  "resolves_to",
];

export const EXCLUDED_RELATIONS: readonly string[] = ["contains", "located_in"];

/** Adjacency in both directions: graph relations are evidence links, not attack flows. */
export type Adjacency = Map<string, Map<string, Set<string>>>;

function timestamp(value: string | Date): number {
  if (value instanceof Date) return value.getTime();
  return Date.parse(value);
}

/** An edge exists at `at` when its validity interval contains that instant. */
export function isEdgeActiveAt(edge: GraphEdge, at: Date): boolean {
  const start = timestamp(edge.validFrom);
  if (!Number.isFinite(start) || start > at.getTime()) return false;
  if (edge.validTo === null || edge.validTo === undefined) return true;
  const end = timestamp(edge.validTo);
  return !Number.isFinite(end) || end > at.getTime();
}

/** Stage 1: build the undirected, typed, time-filtered propagation adjacency. */
export function buildAdjacency(
  edges: readonly GraphEdge[],
  options: { at: Date; types?: readonly string[] } = { at: new Date(0) },
): Adjacency {
  const allowed = options.types ?? PROPAGATION_RELATIONS;
  const adjacency: Adjacency = new Map();
  const link = (from: string, to: string, type: string) => {
    let targets = adjacency.get(from);
    if (!targets) {
      targets = new Map();
      adjacency.set(from, targets);
    }
    let types = targets.get(to);
    if (!types) {
      types = new Set();
      targets.set(to, types);
    }
    types.add(type);
  };
  for (const edge of edges) {
    if (!allowed.includes(edge.type) || !isEdgeActiveAt(edge, options.at)) continue;
    link(edge.source, edge.target, edge.type);
    link(edge.target, edge.source, edge.type);
  }
  return adjacency;
}

/**
 * Stage 2: pick the most exposed organization: the one with the most valid
 * `targeted_by` events. Ties are broken by id so the measurement is stable.
 */
export function selectSeedOrg(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  at: Date,
): { orgId: string; targetedEvents: number } {
  const orgIds = new Set(nodes.filter((node) => node.kind === "org").map((node) => node.id));
  const counts = new Map<string, number>();
  for (const edge of edges) {
    if (edge.type !== "targeted_by" || !isEdgeActiveAt(edge, at)) continue;
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
  }
  let best: { orgId: string; targetedEvents: number } | undefined;
  for (const [orgId, targetedEvents] of counts) {
    if (!orgIds.has(orgId)) continue;
    if (!best || targetedEvents > best.targetedEvents ||
        (targetedEvents === best.targetedEvents && orgId < best.orgId)) {
      best = { orgId, targetedEvents };
    }
  }
  if (!best) throw new Error("No targeted organization in the graph snapshot");
  return best;
}

export type HopExpansion = {
  next: string[];
  traversed: number;
  types: string[];
};

/** Stage 3: expand one hop, counting each newly reached node only once. */
export function expandHop(
  frontier: readonly string[],
  adjacency: Adjacency,
  visited: ReadonlySet<string>,
): HopExpansion {
  const next = new Set<string>();
  const types = new Set<string>();
  let traversed = 0;
  for (const id of frontier) {
    const targets = adjacency.get(id);
    if (!targets) continue;
    for (const [target, linkTypes] of targets) {
      if (visited.has(target) || next.has(target)) continue;
      next.add(target);
      traversed += 1;
      for (const type of linkTypes) types.add(type);
    }
  }
  return { next: [...next].sort(), traversed, types: [...types].sort() };
}

export type HopRecord = {
  hop: number;
  nodes: number;
  organizations: number;
  traversed: number;
  types: string[];
};

export type SimulationResult = {
  seedOrgId: string;
  maxHops: number;
  observationTime: string;
  reachedOrgIds: string[];
  secondaryOrgIds: string[];
  hops: HopRecord[];
  traversed: number;
  typesUsed: string[];
};

/** Stage 4: hop-limited breadth-first propagation from one organization. */
export function simulatePropagation(options: {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  seedOrgId: string;
  at: Date;
  maxHops?: number;
  types?: readonly string[];
}): SimulationResult {
  const maxHops = options.maxHops ?? 4;
  if (!Number.isInteger(maxHops) || maxHops < 0) {
    throw new Error("maxHops must be a non-negative integer");
  }
  const orgIds = new Set(options.nodes.filter((node) => node.kind === "org").map((node) => node.id));
  if (!orgIds.has(options.seedOrgId)) throw new Error("Seed organization is not in the graph snapshot");

  const adjacency = buildAdjacency(options.edges, { at: options.at, types: options.types });
  const visited = new Set<string>([options.seedOrgId]);
  let frontier: string[] = [options.seedOrgId];
  const reached = new Set<string>([options.seedOrgId]);
  const secondary = new Set<string>();
  const hops: HopRecord[] = [];
  const typesUsed = new Set<string>();
  let traversed = 0;

  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
    const expansion = expandHop(frontier, adjacency, visited);
    if (expansion.next.length === 0) break;
    for (const id of expansion.next) visited.add(id);
    const organizations = expansion.next.filter((id) => orgIds.has(id));
    for (const id of organizations) {
      reached.add(id);
      secondary.add(id);
    }
    traversed += expansion.traversed;
    for (const type of expansion.types) typesUsed.add(type);
    hops.push({
      hop,
      nodes: expansion.next.length,
      organizations: organizations.length,
      traversed: expansion.traversed,
      types: expansion.types,
    });
    frontier = expansion.next;
  }

  return {
    seedOrgId: options.seedOrgId,
    maxHops,
    observationTime: options.at.toISOString(),
    reachedOrgIds: [...reached].sort(),
    secondaryOrgIds: [...secondary].sort(),
    hops,
    traversed,
    typesUsed: [...typesUsed].sort(),
  };
}

export type RunSummary = {
  seeds: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  distribution: Record<string, number>;
};

/** Stage 5: summarize one simulation per organization of the snapshot. */
export function summarizeRuns(counts: readonly number[]): RunSummary {
  if (counts.length === 0) throw new Error("At least one run is required");
  const sorted = [...counts].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
  const distribution: Record<string, number> = {};
  for (const count of sorted) distribution[String(count)] = (distribution[String(count)] ?? 0) + 1;
  return {
    seeds: counts.length,
    mean: Number((counts.reduce((sum, count) => sum + count, 0) / counts.length).toFixed(3)),
    median,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    distribution,
  };
}

/**
 * Stage 6: whitelist the measurement payload. Labels are deliberately not
 * read from nodes, so victim names can never reach the report or the bench.
 */
export function buildMeasurement(input: {
  measuredAt: string;
  database: string;
  baseline: { organizations: number; sources: number; events: number };
  observationTime: string;
  graph: {
    entities: number;
    relations: number;
    relationsByType: Record<string, number>;
    organizationsOutsideNouvelleAquitaine: number;
  };
  seed: { orgId: string; targetedEvents: number };
  reference: SimulationResult;
  allRuns: RunSummary;
  nodes: readonly GraphNode[];
}) {
  return {
    measuredAt: input.measuredAt,
    database: input.database,
    scope: "Nouvelle-Aquitaine; grey sources included",
    baseline: input.baseline,
    graph: input.graph,
    model: {
      relationTypes: [...PROPAGATION_RELATIONS],
      excludedRelationTypes: [...EXCLUDED_RELATIONS],
      maxHops: input.reference.maxHops,
      observationTime: input.observationTime,
      seed: input.seed,
    },
    propagation: {
      reachedOrganizations: input.reference.reachedOrgIds.length,
      secondaryOrganizations: input.reference.secondaryOrgIds.length,
      traversedEdges: input.reference.traversed,
      edgeTypesUsed: input.reference.typesUsed,
      hops: input.reference.hops,
      reachedOrgIds: input.reference.reachedOrgIds,
    },
    allOrganizations: input.allRuns,
  };
}
