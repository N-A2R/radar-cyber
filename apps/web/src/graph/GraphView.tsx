/**
 * GraphView — graphe force-dirigé (react-force-graph-2d) du réseau
 * organisations / événements / sources.
 *
 * Contrat de données : celui de `GET /api/graph` → `{ nodes, links }`.
 * Chaque nœud porte au minimum `{ id, label, kind }` (kind : org, event,
 * source, family, dept, group, asset). Les champs optionnels (`family`,
 * `severity`, `observedAt`, `sourceId`, `assertionType`, `orgKind`, `city`,
 * `dept`) enrichissent le panneau détail et les filtres ; ils peuvent être
 * portés par le nœud ou fournis par les index `eventsById` / `orgsById` /
 * `sourcesById` (clé = id brut, sans préfixe `org:` / `event:` / `source:`).
 *
 * Props :
 * - `nodes`, `links` : graphe brut (contrat /api/graph, inchangé).
 * - `eventsById?`    : `{ [id]: { title?, family?, severity?, observedAt?, sourceId?, assertionType? } }`
 * - `orgsById?`      : `{ [id]: { kind?, city?, dept? } }`
 * - `sourcesById?`   : `{ [id]: { name?, family?, url? } }`
 * - `onSelect?`      : appelé avec l'id du nœud cliqué (null = fond cliqué).
 * - `theme?`         : forcer la variante ('observatoire' | 'terminal' |
 *                      'souverain' | 'clair'). Défaut : data-theme du document.
 *
 * Câblage App.tsx recommandé :
 *   const eventsById = useMemo(() => Object.fromEntries(events.map((e) => [e.id, e])), [events]);
 *   const orgsById = useMemo(() => Object.fromEntries(orgs.map((o) => [String(o.id), o])), [orgs]);
 *   <GraphView nodes={graph.nodes} links={graph.links}
 *              eventsById={eventsById} orgsById={orgsById}
 *              onSelect={setSelected} theme={theme} />
 *
 * Les filtres (famille, type de nœud) recalculent `graphData` en réinjectant
 * les x/y connus des nœuds conservés : le layout n'est jamais re-randomisé.
 */
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import GraphMatrix from '../components/GraphMatrix';
import type { Graph } from '../api';

// ── Types ────────────────────────────────────────────────────────

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
}

export interface GraphOrgInfo {
  kind?: string;
  city?: string | null;
  dept?: string | null;
}

export interface GraphSourceInfo {
  name?: string;
  family?: string;
  url?: string | null;
}

export interface GraphViewProps {
  nodes: GraphNode[];
  links: GraphLink[];
  eventsById?: Record<string, GraphEventInfo>;
  orgsById?: Record<string, GraphOrgInfo>;
  sourcesById?: Record<string, GraphSourceInfo>;
  onSelect?: (nodeId: string | null) => void;
  theme?: string;
}

// ── Constantes visuelles ─────────────────────────────────────────

const KIND_ORDER: string[] = ['org', 'event', 'source', 'family', 'dept', 'group', 'asset'];

const KIND_COLOR: Record<string, string> = {
  org: '#38bdf8',
  event: '#f59e0b',
  source: '#22c55e',
  family: '#f59e0b',
  dept: '#a78bfa',
  group: '#ef4444',
  asset: '#22c55e',
};

const KIND_LABEL: Record<string, string> = {
  org: 'organisation',
  event: 'événement',
  source: 'source',
  family: 'famille',
  dept: 'département',
  group: 'groupe',
  asset: 'asset',
};

const KIND_RADIUS: Record<string, number> = {
  family: 6,
  dept: 5,
  org: 5,
  event: 4,
  source: 4,
  group: 4,
  asset: 3,
};

const FALLBACK_PALETTE: string[] = [
  '#38bdf8',
  '#f59e0b',
  '#22c55e',
  '#a78bfa',
  '#ef4444',
  '#e3b341',
  '#db61a2',
];

const FAMILY_FALLBACK: Record<string, string> = {
  ransomware: '#f85149',
  vuln: '#d29922',
  phishing: '#a371f7',
  malware: '#db61a2',
  cert_fr: '#4da3ff',
  cert: '#4da3ff',
  typosquat: '#e3b341',
  reputation: '#8b949e',
  cti: '#6e7681',
};

const FAMILY_VAR: Record<string, string> = {
  ransomware: '--ransomware',
  vuln: '--vuln',
  phishing: '--phishing',
  malware: '--malware',
  cert_fr: '--cert',
  cert: '--cert',
  typosquat: '--typosquat',
  reputation: '--reputation',
  cti: '--cti',
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

const BG_BY_THEME: Record<string, string> = {
  clair: '#f5f6f8',
  souverain: '#0c0a09',
  terminal: '#000000',
  observatoire: '#0a0e14',
};

const LINK_COLOR_BY_THEME: Record<string, string> = {
  clair: 'rgba(71,85,105,0.35)',
  souverain: 'rgba(148,163,184,0.30)',
  terminal: 'rgba(148,163,184,0.30)',
  observatoire: 'rgba(148,163,184,0.30)',
};

const BOX_TITLE: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--faint)',
};

const BOX_LABEL: CSSProperties = { margin: '10px 0 4px', fontSize: 11, color: 'var(--muted)' };
const CHIP_WRAP: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };
const MUTED: CSSProperties = { color: 'var(--faint)', fontSize: 11 };
const COUNT: CSSProperties = { color: 'var(--faint)', fontSize: 10 };
const LEGEND_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: 'var(--muted)',
  lineHeight: '18px',
};
const FOOTER_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 };
const RESET_STYLE: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--muted)',
  fontSize: 11,
  padding: '2px 8px',
  cursor: 'pointer',
};

const DETAIL_STYLE: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 6,
  width: 280,
  maxWidth: 'calc(100% - 24px)',
  maxHeight: 'calc(100% - 24px)',
  overflowY: 'auto',
  padding: 'var(--space-3)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
};

const DETAIL_HEADER: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 };
const DETAIL_TITLE: CSSProperties = { display: 'block', fontSize: 14, lineHeight: 1.3, overflowWrap: 'break-word' };
const DETAIL_SUB: CSSProperties = { color: 'var(--faint)', fontSize: 11 };
const CLOSE_STYLE: CSSProperties = {
  marginLeft: 'auto',
  padding: 0,
  background: 'transparent',
  border: 'none',
  color: 'var(--muted)',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
};

// ── Helpers ──────────────────────────────────────────────────────

function canonicalFamily(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase();
  return FAMILY_ALIASES[key] ?? key;
}

function fallbackColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

function readThemeVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function rawId(id: string): string {
  const separator = id.indexOf(':');
  return separator >= 0 ? id.slice(separator + 1) : id;
}

function endId(end: string | number | NodeObject<GraphNode> | undefined): string | undefined {
  if (typeof end === 'string' || typeof end === 'number') return String(end);
  if (end) {
    const id = end.id;
    return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
  }
  return undefined;
}

function familyOf(node: GraphNode, eventsById?: Record<string, GraphEventInfo>): string | undefined {
  if (node.family) return node.family;
  if (node.kind === 'event') return eventsById?.[rawId(node.id)]?.family;
  return undefined;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
}

function severityColor(severity: number): string {
  if (severity >= 4) return '#f85149';
  if (severity === 3) return '#d29922';
  return '#3fb950';
}

function dotStyle(color: string): CSSProperties {
  return { width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 auto' };
}

function chipStyle(active: boolean, color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 8px',
    fontSize: 11,
    lineHeight: '18px',
    borderRadius: 999,
    cursor: 'pointer',
    border: `1px solid ${active ? color : 'var(--border)'}`,
    background: active ? 'var(--surface-2)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
  };
}

function overlayStyle(position: CSSProperties): CSSProperties {
  return {
    position: 'absolute',
    zIndex: 5,
    maxWidth: 250,
    padding: 'var(--space-3)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
    ...position,
  };
}

const MODE_BAR: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 6,
  display: 'flex',
  gap: 4,
  padding: 4,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
};

function modeButtonStyle(active: boolean): CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 11,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: active ? 'var(--text)' : 'var(--muted)',
    background: active ? 'var(--surface-2)' : 'transparent',
    border: '1px solid ' + (active ? 'var(--border)' : 'transparent'),
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
  };
}

// ── Composant ────────────────────────────────────────────────────

export default function GraphView(props: GraphViewProps) {
  const { nodes, links, eventsById, orgsById, sourcesById, onSelect } = props;
  const theme =
    props.theme ??
    (typeof document === 'undefined' ? 'observatoire' : document.documentElement.dataset.theme ?? 'observatoire');
  const bg = BG_BY_THEME[theme] ?? BG_BY_THEME.observatoire;
  const accent = readThemeVar('--accent', '#4da3ff');
  const linkBase = LINK_COLOR_BY_THEME[theme] ?? LINK_COLOR_BY_THEME.observatoire;
  const faintLink = theme === 'clair' ? 'rgba(71,85,105,0.10)' : 'rgba(148,163,184,0.10)';
  const labelInk = theme === 'clair' ? '#17202b' : '#ffffff';
  const labelBg = theme === 'clair' ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.62)';

  const [familyFilter, setFamilyFilter] = useState<Set<string>>(() => new Set());
  const [kindFilter, setKindFilter] = useState<Set<string>>(() => new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mode, setMode] = useState<'network' | 'matrix'>('matrix');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('graph:filtersOpen') !== '0'; } catch { return true; }
  });
  const persistFiltersOpen = (v: boolean) => { setFiltersOpen(v); try { localStorage.setItem('graph:filtersOpen', v ? '1' : '0'); } catch {} };

  const matrixNodes = useMemo(
    () =>
      nodes.filter(
        (node): node is GraphNode & { kind: Graph['nodes'][number]['kind'] } =>
          node.kind === 'org' ||
          node.kind === 'family' ||
          node.kind === 'dept' ||
          node.kind === 'group' ||
          node.kind === 'asset',
      ),
    [nodes],
  );

  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const familyColors = useMemo(() => {
    const palette: Record<string, string> = {};
    for (const [key, varName] of Object.entries(FAMILY_VAR)) {
      palette[key] = readThemeVar(varName, FAMILY_FALLBACK[key] ?? fallbackColor(key));
    }
    return palette;
  }, [theme]);

  const families = useMemo(() => {
    const found = new Map<string, string>();
    for (const node of nodes) {
      const raw =
        node.kind === 'family' ? node.label : node.kind === 'event' ? familyOf(node, eventsById) : undefined;
      const canonical = canonicalFamily(raw);
      if (canonical && !found.has(canonical)) {
        found.set(canonical, familyColors[canonical] ?? fallbackColor(canonical));
      }
    }
    return [...found.entries()]
      .map(([name, color]) => ({ name, color }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [nodes, eventsById, familyColors]);

  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
    return [...counts.entries()]
      .sort(([a], [b]) => {
        const ia = KIND_ORDER.indexOf(a);
        const ib = KIND_ORDER.indexOf(b);
        return (ia === -1 ? KIND_ORDER.length : ia) - (ib === -1 ? KIND_ORDER.length : ib) || a.localeCompare(b);
      })
      .map(([kind, count]) => ({
        kind,
        count,
        color: KIND_COLOR[kind] ?? fallbackColor(kind),
        label: KIND_LABEL[kind] ?? kind,
      }));
  }, [nodes]);

  const data = useMemo<{ nodes: NodeObject<GraphNode>[]; links: LinkObject<GraphNode, GraphLink>[] }>(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const kindOk = (node: GraphNode) => kindFilter.size === 0 || kindFilter.has(node.kind);
    const base = nodes.filter(kindOk);
    const baseIds = new Set(base.map((node) => node.id));
    const baseLinks = links.filter((link) => {
      const source = endId(link.source);
      const target = endId(link.target);
      return source !== undefined && target !== undefined && baseIds.has(source) && baseIds.has(target);
    });

    let kept: Set<string> | null = null;
    if (familyFilter.size > 0) {
      const anchors = new Set<string>();
      for (const node of base) {
        if (node.kind === 'family' && familyFilter.has(canonicalFamily(node.label) ?? '')) anchors.add(node.id);
        else if (node.kind === 'event' && familyFilter.has(canonicalFamily(familyOf(node, eventsById)) ?? ''))
          anchors.add(node.id);
      }
      if (anchors.size > 0) {
        const adjacency = new Map<string, string[]>();
        for (const link of baseLinks) {
          const source = endId(link.source);
          const target = endId(link.target);
          if (source === undefined || target === undefined) continue;
          const fromSource = adjacency.get(source) ?? [];
          fromSource.push(target);
          adjacency.set(source, fromSource);
          const fromTarget = adjacency.get(target) ?? [];
          fromTarget.push(source);
          adjacency.set(target, fromTarget);
        }
        const closure = new Set(anchors);
        const queue = [...anchors];
        while (queue.length > 0) {
          const current = queue.pop();
          if (current === undefined) continue;
          for (const neighbor of adjacency.get(current) ?? []) {
            if (closure.has(neighbor)) continue;
            const node = nodeById.get(neighbor);
            if (node && node.kind !== 'family' && node.kind !== 'event') {
              closure.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
        kept = closure;
      }
    }

    const keepSet: Set<string> | null = kept;
    const visibleNodes =
      keepSet === null ? base : base.filter((node) => keepSet === null || keepSet.has(node.id));
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleLinks = baseLinks.filter((link) => {
      const source = endId(link.source);
      const target = endId(link.target);
      return source !== undefined && target !== undefined && visibleIds.has(source) && visibleIds.has(target);
    });

    // Préserve le layout : on réinjecte les coordonnées connues des nœuds conservés.
    const positionedNodes: NodeObject<GraphNode>[] = visibleNodes.map((node) => {
      const position = positionsRef.current.get(node.id);
      return position ? { ...node, x: position.x, y: position.y } : { ...node };
    });
    const positionedLinks: LinkObject<GraphNode, GraphLink>[] = visibleLinks.map((link) => ({
      ...link,
      source: endId(link.source) ?? '',
      target: endId(link.target) ?? '',
    }));

    return { nodes: positionedNodes, links: positionedLinks };
  }, [nodes, links, kindFilter, familyFilter, eventsById]);

  useEffect(() => {
    if (mode !== 'network') return;
    const fg = fgRef.current;
    if (!fg || size.width <= 0) return;
    // 350 ms : le temps que la simulation ait placé les nœuds ; plus tôt,
    // zoomToFit cadre le vide.
    const t = setTimeout(() => {
      try {
        fg.zoomToFit(400, 40);
      } catch {
        // Le graphe peut être démonté entre-temps : rien à faire.
      }
    }, 350);
    return () => clearTimeout(t);
  }, [mode, data, size]);
  // Référence vers le dernier graphe injecté : force-graph mute les objets
  // (x/y) en place, ce qui permet de capturer les positions sans accéder au
  // graphe interne (API du wrapper limitée).
  const dataRef = useRef(data);
  dataRef.current = data;

  const { degreeMap, neighborMap } = useMemo(() => {
    const degrees = new Map<string, number>();
    const neighbors = new Map<string, Set<string>>();
    const addEdge = (a: string, b: string) => {
      if (a === b) return;
      degrees.set(a, (degrees.get(a) ?? 0) + 1);
      degrees.set(b, (degrees.get(b) ?? 0) + 1);
      const toA = neighbors.get(a) ?? new Set<string>();
      toA.add(b);
      neighbors.set(a, toA);
      const toB = neighbors.get(b) ?? new Set<string>();
      toB.add(a);
      neighbors.set(b, toB);
    };
    for (const link of data.links) {
      const source = endId(link.source);
      const target = endId(link.target);
      if (source !== undefined && target !== undefined) addEdge(source, target);
    }
    return { degreeMap: degrees, neighborMap: neighbors };
  }, [data.links]);

  const hoveredNodeId = useMemo(() => {
    if (!hoveredId) return null;
    return data.nodes.some((node) => node.id === hoveredId) ? hoveredId : null;
  }, [hoveredId, data.nodes]);

  const highlightSet = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    const neighbors = neighborMap.get(hoveredNodeId);
    if (neighbors) for (const neighbor of neighbors) set.add(neighbor);
    return set;
  }, [hoveredNodeId, neighborMap]);

  const selectedNode = useMemo(() => {
    if (!selectedId) return null;
    return data.nodes.find((node) => node.id === selectedId) ?? null;
  }, [selectedId, data.nodes]);

  const capturePositions = useCallback(() => {
    const positions = positionsRef.current;
    for (const node of dataRef.current.nodes) {
      const id = node.id;
      if (typeof id !== 'string') continue;
      const { x, y } = node;
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        positions.set(id, { x, y });
      }
    }
  }, []);

  const toggleFamily = useCallback((name: string) => {
    setFamilyFilter((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleKind = useCallback((kind: string) => {
    setKindFilter((previous) => {
      const next = new Set(previous);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFamilyFilter(new Set());
    setKindFilter(new Set());
  }, []);

  const handleNodeHover = useCallback((node: NodeObject<GraphNode> | null) => {
    setHoveredId(node && typeof node.id === 'string' ? node.id : null);
  }, []);

  const handleNodeClick = useCallback(
    (node: NodeObject<GraphNode>) => {
      const id = typeof node.id === 'string' ? node.id : null;
      setSelectedId(id);
      onSelect?.(id);
    },
    [onSelect],
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedId(null);
    onSelect?.(null);
  }, [onSelect]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    onSelect?.(null);
  }, [onSelect]);

  const nodeColor = useCallback(
    (node: NodeObject<GraphNode>): string => {
      const kind = typeof node.kind === 'string' ? node.kind : 'org';
      if (kind === 'family') {
        const canonical = canonicalFamily(node.label);
        return (canonical && familyColors[canonical]) || KIND_COLOR.family;
      }
      if (kind === 'event') {
        const canonical = canonicalFamily(familyOf(node, eventsById));
        return (canonical && familyColors[canonical]) || KIND_COLOR.event;
      }
      return KIND_COLOR[kind] ?? fallbackColor(kind);
    },
    [eventsById, familyColors],
  );

  const paintNode = useCallback(
    (node: NodeObject<GraphNode>, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = typeof node.id === 'string' ? node.id : '';
      const kind = typeof node.kind === 'string' ? node.kind : 'org';
      const x = typeof node.x === 'number' ? node.x : 0;
      const y = typeof node.y === 'number' ? node.y : 0;
      const radius = (KIND_RADIUS[kind] ?? 4) + Math.min(6, Math.sqrt(degreeMap.get(id) ?? 0) * 1.4);
      const dimmed = highlightSet !== null && !highlightSet.has(id);

      ctx.globalAlpha = dimmed ? 0.12 : 1;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(node);
      ctx.fill();

      if (id === selectedId || id === hoveredNodeId) {
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = id === selectedId ? labelInk : accent;
        ctx.stroke();
      }

      const label = typeof node.label === 'string' ? node.label : '';
      if (label && !dimmed && (globalScale >= 1.6 || id === hoveredNodeId || id === selectedId)) {
        const fontSize = 11 / globalScale;
        const padding = 2 / globalScale;
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const width = ctx.measureText(label).width;
        ctx.fillStyle = labelBg;
        ctx.fillRect(x - width / 2 - padding, y + radius + padding, width + padding * 2, fontSize + padding * 2);
        ctx.fillStyle = labelInk;
        ctx.fillText(label, x, y + radius + padding * 1.5);
      }
      ctx.globalAlpha = 1;
    },
    [accent, degreeMap, highlightSet, hoveredNodeId, labelBg, labelInk, nodeColor, selectedId],
  );

  const paintPointerArea = useCallback(
    (node: NodeObject<GraphNode>, color: string, ctx: CanvasRenderingContext2D) => {
      const id = typeof node.id === 'string' ? node.id : '';
      const kind = typeof node.kind === 'string' ? node.kind : 'org';
      const radius = (KIND_RADIUS[kind] ?? 4) + Math.min(6, Math.sqrt(degreeMap.get(id) ?? 0) * 1.4);
      const x = typeof node.x === 'number' ? node.x : 0;
      const y = typeof node.y === 'number' ? node.y : 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.fill();
    },
    [degreeMap],
  );

  const detailRows = useMemo(() => {
    if (!selectedNode) return [];
    const rows: { label: string; value: string; color?: string }[] = [];
    const id = rawId(selectedNode.id);
    const eventInfo = selectedNode.kind === 'event' ? eventsById?.[id] : undefined;
    const orgInfo = selectedNode.kind === 'org' ? orgsById?.[id] : undefined;
    const sourceInfo = selectedNode.kind === 'source' ? sourcesById?.[id] : undefined;

    rows.push({ label: 'nom', value: selectedNode.label });
    rows.push({ label: 'type', value: KIND_LABEL[selectedNode.kind] ?? selectedNode.kind });
    rows.push({ label: 'degré', value: String(degreeMap.get(selectedNode.id) ?? 0) });

    if (selectedNode.kind === 'event') {
      rows.push({ label: 'titre', value: eventInfo?.title ?? selectedNode.label });
      const family = selectedNode.family ?? eventInfo?.family;
      const canonical = canonicalFamily(family);
      if (canonical) rows.push({ label: 'famille', value: canonical, color: familyColors[canonical] });
      const severity = selectedNode.severity ?? eventInfo?.severity;
      if (typeof severity === 'number') rows.push({ label: 'sévérité', value: `${severity}/5`, color: severityColor(severity) });
      rows.push({ label: 'date', value: formatDate(selectedNode.observedAt ?? eventInfo?.observedAt) });
      const sourceId = selectedNode.sourceId ?? eventInfo?.sourceId;
      if (sourceId) rows.push({ label: 'source', value: sourceId });
      const assertion = selectedNode.assertionType ?? eventInfo?.assertionType;
      if (assertion) rows.push({ label: 'assertion', value: assertion });
    }

    if (selectedNode.kind === 'org') {
      rows.push({ label: 'kind', value: selectedNode.orgKind ?? orgInfo?.kind ?? '—' });
      rows.push({ label: 'ville', value: selectedNode.city ?? orgInfo?.city ?? '—' });
      rows.push({ label: 'dept', value: selectedNode.dept ?? orgInfo?.dept ?? '—' });
    }

    if (selectedNode.kind === 'source') {
      if (sourceInfo?.family) rows.push({ label: 'famille', value: sourceInfo.family });
      if (sourceInfo?.url) rows.push({ label: 'url', value: sourceInfo.url });
    }

    return rows;
  }, [selectedNode, degreeMap, eventsById, orgsById, sourcesById, familyColors]);

  const detailColor = selectedNode ? nodeColor(selectedNode) : KIND_COLOR.org;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: bg,
        fontFamily: 'var(--font-body)',
      }}
    >
      <div style={MODE_BAR} role="tablist" aria-label="affichage du graphe">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'network'}
          aria-current={mode === 'network' ? 'true' : undefined}
          className={mode === 'network' ? 'is-active' : undefined}
          onClick={() => setMode('network')}
          style={modeButtonStyle(mode === 'network')}
        >
          réseau
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'matrix'}
          aria-current={mode === 'matrix' ? 'true' : undefined}
          className={mode === 'matrix' ? 'is-active' : undefined}
          onClick={() => setMode('matrix')}
          style={modeButtonStyle(mode === 'matrix')}
        >
          matrice
        </button>
      </div>

      {mode === 'matrix' ? (
        <div style={{ position: 'absolute', inset: 0, padding: '44px 12px 12px', display: 'flex', minHeight: 0 }}>
          <GraphMatrix nodes={matrixNodes} links={links} />
        </div>
      ) : (
        <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
        {size.width > 0 && (
          <ForceGraph2D<GraphNode, GraphLink>
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={data}
            backgroundColor={bg}
            nodeRelSize={8}
            cooldownTicks={120}
            warmupTicks={30}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={paintPointerArea}
            linkColor={(link) => {
              if (!hoveredNodeId) return linkBase;
              const source = endId(link.source);
              const target = endId(link.target);
              return source === hoveredNodeId || target === hoveredNodeId ? accent : faintLink;
            }}
            linkWidth={(link) => {
              if (!hoveredNodeId) return 1;
              const source = endId(link.source);
              const target = endId(link.target);
              return source === hoveredNodeId || target === hoveredNodeId ? 1.8 : 0.4;
            }}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            onNodeDragEnd={capturePositions}
            onEngineTick={capturePositions}
            onEngineStop={capturePositions}
          />
        )}
      </div>

      <div style={overlayStyle({ top: 12, left: 12 })}>
        <button type="button" onClick={() => persistFiltersOpen(!filtersOpen)} style={{ ...BOX_TITLE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          filtres {filtersOpen ? '▾' : '▸'}
        </button>
        {filtersOpen && (
          <>
        <p style={BOX_LABEL}>familles</p>
        <div style={CHIP_WRAP}>
          {families.map((family) => {
            const active = familyFilter.has(family.name);
            return (
              <button
                key={family.name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFamily(family.name)}
                style={chipStyle(active, family.color)}
              >
                <span style={dotStyle(family.color)} />
                {family.name}
              </button>
            );
          })}
          {families.length === 0 && <span style={MUTED}>aucune famille</span>}
        </div>
        <p style={BOX_LABEL}>nœuds</p>
        <div style={CHIP_WRAP}>
          {kinds.map((kind) => {
            const active = kindFilter.has(kind.kind);
            return (
              <button
                key={kind.kind}
                type="button"
                aria-pressed={active}
                onClick={() => toggleKind(kind.kind)}
                style={chipStyle(active, kind.color)}
              >
                <span style={dotStyle(kind.color)} />
                {kind.label}
                <span style={COUNT}>{kind.count}</span>
              </button>
            );
          })}
        </div>
        <div style={FOOTER_ROW}>
          <button
            type="button"
            onClick={resetFilters}
            disabled={familyFilter.size === 0 && kindFilter.size === 0}
            style={{ ...RESET_STYLE, opacity: familyFilter.size === 0 && kindFilter.size === 0 ? 0.45 : 1 }}
          >
            réinitialiser
          </button>
          <span style={MUTED}>
            {data.nodes.length} nœuds · {data.links.length} liens
          </span>
        </div>
          </>
        )}
      </div>
      {selectedNode && (
        <aside style={DETAIL_STYLE}>
          <header style={DETAIL_HEADER}>
            <span style={dotStyle(detailColor)} />
            <div style={{ minWidth: 0 }}>
              <strong style={DETAIL_TITLE}>{selectedNode.label}</strong>
              <small style={DETAIL_SUB}>
                {KIND_LABEL[selectedNode.kind] ?? selectedNode.kind} · degré {degreeMap.get(selectedNode.id) ?? 0}
              </small>
            </div>
            <button type="button" onClick={closeDetail} style={CLOSE_STYLE} aria-label="fermer le panneau">
              ×
            </button>
          </header>
          <dl className="kv">
            {detailRows.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd style={row.color ? { color: row.color } : undefined}>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        </aside>
      )}
        </>
      )}
    </div>
  );
}
