/**
 * Pure model for the relational graph: enrichment, filtering and selection.
 *
 * The API delivers structural nodes only (organisation, department, family,
 * group, asset). Real events and sources already loaded by the app are added
 * here from the indexes passed to GraphView. Every added node and link comes
 * from a measured field (`event.family`, `event.sourceId`, `event.orgId`) —
 * no guessed attachment, no invented data.
 */

export type GraphNodeKind =
  | 'org'
  | 'event'
  | 'source'
  | 'family'
  | 'dept'
  | 'group'
  | 'asset';

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind | string;
  family?: string;
  severity?: number;
  observedAt?: string | null;
  sourceId?: string;
  sourceUrl?: string | null;
  assertionType?: string;
  orgKind?: string;
  city?: string | null;
  dept?: string | null;
  orgId?: number | string | null;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
}

export interface GraphEventInfo {
  title?: string;
  family?: string;
  severity?: number;
  observedAt?: string | null;
  sourceId?: string;
  sourceUrl?: string | null;
  assertionType?: string;
  orgId?: number | string | null;
}

export interface GraphOrgInfo {
  kind?: string;
  city?: string | null;
  dept?: string | null;
}

export interface GraphSourceInfo {
  name?: string;
  family?: string;
  url?: string;
}

export interface GraphViewProps {
  nodes: GraphNode[];
  links: GraphLink[];
  eventsById?: Record<string, GraphEventInfo>;
  orgsById?: Record<string, GraphOrgInfo>;
  sourcesById?: Record<string, GraphSourceInfo>;
  onSelect?: (nodeId: string | null) => void;
  theme?: string;
  /** Reference time for the period filter (tests can pin it). */
  now?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Link labels shown in the legend and in the detail panel. */
export const LINK_TYPES: Record<string, string> = {
  rattache: 'located in',
  has_event: 'has event',
  contains: 'contains',
  reported_by: 'reported by',
  observed_at: 'observed at',
};

const FAMILY_ALIASES: Record<string, string> = {
  ransomware: 'ransomware',
  'rançongiciel': 'ransomware',
  rancongiciel: 'ransomware',
  vuln: 'vuln',
  'vulnérabilité': 'vuln',
  vulnerabilite: 'vuln',
  phishing: 'phishing',
  'hameçonnage': 'phishing',
  hameconnage: 'phishing',
  malware: 'malware',
  'logiciel malveillant': 'malware',
  cert_fr: 'cert_fr',
  cert: 'cert',
  typosquat: 'typosquat',
  reputation: 'reputation',
  cti: 'cti',
};

/** Canonical key for a family, whatever spelling the collectors used. */
export function canonicalFamily(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  return FAMILY_ALIASES[key] ?? key;
}

/** Timestamp of an observation, or null when the date is absent/invalid. */
export function observedTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function endId(end: string | number | { id?: string | number } | undefined): string | undefined {
  if (typeof end === 'string' || typeof end === 'number') return String(end);
  const id = end?.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

/** Strip the `kind:` prefix used by the API for cross-referenced ids. */
export function rawId(id: string): string {
  const separator = id.indexOf(':');
  return separator >= 0 ? id.slice(separator + 1) : id;
}

export function familyOf(node: GraphNode, eventsById?: Record<string, GraphEventInfo>): string | undefined {
  if (node.family) return node.family;
  if (node.kind === 'event') return eventsById?.[rawId(node.id)]?.family;
  return undefined;
}

/**
 * Add events and sources to the structural graph.
 *
 * An event is attached to its family (and to its organisation/source when
 * those ids are available). Sources with no event attached to them are left
 * out: an isolated source node would suggest a relation we cannot show.
 */
export function buildGraph(input: {
  nodes: readonly GraphNode[];
  links: readonly GraphLink[];
  eventsById?: Record<string, GraphEventInfo>;
  sourcesById?: Record<string, GraphSourceInfo>;
}): GraphData {
  const nodes: GraphNode[] = input.nodes.map((node) => ({ ...node }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const familyIds = new Map<string, string>();
  for (const node of nodes) {
    if (node.kind !== 'family') continue;
    const key = canonicalFamily(node.label ?? node.family);
    if (key && !familyIds.has(key)) familyIds.set(key, node.id);
  }

  const links: GraphLink[] = [];
  const linkKeys = new Set<string>();
  const addLink = (source: string | undefined, target: string | undefined, type: string) => {
    if (!source || !target || source === target) return;
    const key = `${source}\u0000${target}\u0000${type}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ source, target, type });
  };
  for (const link of input.links) addLink(endId(link.source), endId(link.target), link.type);

  const sourceIds = new Set<string>();
  const events = input.eventsById ?? {};
  for (const [key, info] of Object.entries(events)) {
    if (!info || typeof info !== 'object') continue;
    const id = `event:${key}`;
    if (nodeIds.has(id)) continue;

    const familyKey = canonicalFamily(info.family);
    const familyId = familyKey ? familyIds.get(familyKey) : undefined;
    const orgId = info.orgId === undefined || info.orgId === null ? undefined : String(info.orgId);
    const orgNodeId = orgId && nodeIds.has(`org:${orgId}`) ? `org:${orgId}` : undefined;
    const sourceKey = info.sourceId === undefined || info.sourceId === null ? undefined : String(info.sourceId);
    const sourceNodeId = sourceKey && input.sourcesById?.[sourceKey] ? `source:${sourceKey}` : undefined;
    // Never create a floating event: one of these three relations must exist.
    if (!familyId && !orgNodeId && !sourceNodeId) continue;

    nodes.push({
      id,
      label: info.title || key,
      kind: 'event',
      family: info.family,
      severity: info.severity,
      observedAt: info.observedAt ?? null,
      sourceId: sourceKey,
      sourceUrl: info.sourceUrl ?? null,
      assertionType: info.assertionType,
      orgId: info.orgId ?? null,
    });
    nodeIds.add(id);

    if (familyId) addLink(familyId, id, 'contains');
    if (orgNodeId) addLink(orgNodeId, id, 'observed_at');
    if (sourceNodeId) {
      addLink(id, sourceNodeId, 'reported_by');
      sourceIds.add(sourceKey!);
    }
  }

  for (const sourceKey of sourceIds) {
    const id = `source:${sourceKey}`;
    if (nodeIds.has(id)) continue;
    const info = input.sourcesById?.[sourceKey];
    nodes.push({
      id,
      label: info?.name || sourceKey,
      kind: 'source',
      family: info?.family,
    });
    nodeIds.add(id);
  }

  return { nodes, links };
}

export interface GraphFilter {
  /** Canonical family names; empty = no family filter. */
  families?: ReadonlySet<string>;
  /** Node kinds; empty = no kind filter. */
  kinds?: ReadonlySet<string>;
  /** Keep events observed in the last N days and their structural context. */
  periodDays?: number | null;
  /** Free-text search on label, id and family; matches keep their neighbours. */
  search?: string;
  now?: number;
}

/** Seed nodes plus direct neighbours and the departments of kept organisations. */
function contextualNeighbourhood(data: GraphData, seeds: ReadonlySet<string>): Set<string> {
  const kept = new Set(seeds);
  for (const link of data.links) {
    const source = endId(link.source);
    const target = endId(link.target);
    if (source && seeds.has(source) && target) kept.add(target);
    if (target && seeds.has(target) && source) kept.add(source);
  }
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  for (const link of data.links) {
    const source = endId(link.source);
    const target = endId(link.target);
    for (const [from, to] of [[source, target], [target, source]] as const) {
      if (!from || !to || !kept.has(from) || byId.get(from)?.kind !== 'org') continue;
      const other = byId.get(to);
      if (other && (other.kind === 'dept' || other.kind === 'group' || other.kind === 'asset')) kept.add(to);
    }
  }
  return kept;
}

function periodAllowList(data: GraphData, days: number, now: number): Set<string> | null {
  const dated = data.nodes.filter((node) => node.kind === 'event' && observedTime(node.observedAt) !== null);
  // Structural nodes carry no date. Without dated events, filtering them
  // would silently discard the whole graph — show everything instead.
  if (dated.length === 0) return null;

  const cutoff = now - days * 86_400_000;
  const seeds = new Set<string>();
  for (const node of dated) {
    const time = observedTime(node.observedAt)!;
    if (time >= cutoff) seeds.add(node.id);
  }
  // Events with no usable date are kept: absence of a date is not proof of age.
  for (const node of data.nodes) {
    if (node.kind === 'event' && observedTime(node.observedAt) === null) seeds.add(node.id);
  }

  return contextualNeighbourhood(data, seeds);
}

/**
 * Apply all filters together (AND). Each dimension is computed independently
 * against the full graph, then intersected, so the order of filters does not
 * change the result. Link endpoints are always both visible.
 */
export function filterGraph(data: GraphData, filter: GraphFilter = {}): GraphData {
  const allIds = new Set(data.nodes.map((node) => node.id));
  const allowed: Set<string>[] = [];

  if (filter.kinds && filter.kinds.size > 0) {
    allowed.push(new Set(data.nodes.filter((node) => filter.kinds!.has(node.kind)).map((node) => node.id)));
  }
  if (filter.families && filter.families.size > 0) {
    const seeds = new Set<string>();
    for (const node of data.nodes) {
      const key = canonicalFamily(node.kind === 'family' ? node.label : familyOf(node, undefined));
      if (key && filter.families!.has(key)) seeds.add(node.id);
    }
    allowed.push(contextualNeighbourhood(data, seeds));
  }
  if (filter.periodDays !== undefined && filter.periodDays !== null) {
    const period = periodAllowList(data, filter.periodDays, filter.now ?? Date.now());
    if (period) allowed.push(period);
  }
  const query = filter.search?.trim().toLowerCase();
  if (query) {
    const seeds = new Set<string>();
    for (const node of data.nodes) {
      const haystack = `${node.label} ${node.id} ${node.family ?? ''}`.toLowerCase();
      if (haystack.includes(query)) seeds.add(node.id);
    }
    allowed.push(contextualNeighbourhood(data, seeds));
  }

  for (const list of allowed) {
    for (const id of allIds) if (!list.has(id)) allIds.delete(id);
  }

  const nodes = data.nodes.filter((node) => allIds.has(node.id));
  const links = data.links.filter((link) => {
    const source = endId(link.source);
    const target = endId(link.target);
    return source !== undefined && target !== undefined && allIds.has(source) && allIds.has(target);
  });
  return { nodes, links };
}

export interface IncidentLink {
  type: string;
  direction: 'in' | 'out';
  otherId: string;
  otherLabel: string;
}

export interface Selection {
  node: GraphNode | null;
  /** The selected node and its direct neighbours. */
  nodeIds: Set<string>;
  incidentLinks: IncidentLink[];
}

/** Everything needed to highlight and describe the neighbourhood of a node. */
export function selectNeighborhood(data: GraphData, nodeId: string | null | undefined): Selection {
  if (!nodeId) return { node: null, nodeIds: new Set(), incidentLinks: [] };
  const node = data.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return { node: null, nodeIds: new Set(), incidentLinks: [] };

  const nodeIds = new Set<string>([nodeId]);
  const labels = new Map(data.nodes.map((candidate) => [candidate.id, candidate.label]));
  const incidentLinks: IncidentLink[] = [];
  for (const link of data.links) {
    const source = endId(link.source);
    const target = endId(link.target);
    if (source !== nodeId && target !== nodeId) continue;
    const otherId = source === nodeId ? target! : source!;
    nodeIds.add(otherId);
    incidentLinks.push({
      type: link.type,
      direction: source === nodeId ? 'out' : 'in',
      otherId,
      otherLabel: labels.get(otherId) ?? rawId(otherId),
    });
  }
  incidentLinks.sort((a, b) => a.type.localeCompare(b.type) || a.otherLabel.localeCompare(b.otherLabel));
  return { node, nodeIds, incidentLinks };
}
