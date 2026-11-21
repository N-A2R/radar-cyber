/**
 * GraphView — force-directed network of organisations, events and sources.
 *
 * Uses the `GET /api/graph` contract (`{ nodes, links }`) and enriches it
 * with the event/source indexes already loaded by the app. All UI text is in
 * English; data values (family names, labels) are displayed as recorded.
 */
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import GraphMatrix from '../components/GraphMatrix';
import { LoadingSkeleton } from '../components/Skeleton';
import {
  buildGraph,
  canonicalFamily,
  endId,
  familyOf,
  filterGraph,
  observedTime,
  rawId,
  selectNeighborhood,
  LINK_TYPES,
  type GraphLink,
  type GraphNode,
  type GraphViewProps,
} from './graphModel';
import './graphview.css';

export type {
  GraphEventInfo,
  GraphLink,
  GraphNode,
  GraphNodeKind,
  GraphOrgInfo,
  GraphSourceInfo,
  GraphViewProps,
} from './graphModel';
export { buildGraph, canonicalFamily, filterGraph, selectNeighborhood } from './graphModel';

// ── Visual constants ─────────────────────────────────────────────

const KIND_ORDER = ['org', 'event', 'source', 'family', 'dept', 'group', 'asset'];

const KIND_COLOR: Record<string, string> = {
  org: '#38bdf8',
  event: '#f59e0b',
  source: '#22c55e',
  family: '#fb923c',
  dept: '#a78bfa',
  group: '#ef4444',
  asset: '#22c55e',
};

const KIND_LABEL: Record<string, string> = {
  org: 'organisation',
  event: 'event',
  source: 'source',
  family: 'family',
  dept: 'department',
  group: 'group',
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

const FALLBACK_PALETTE = ['#38bdf8', '#f59e0b', '#22c55e', '#a78bfa', '#ef4444', '#e3b341', '#db61a2'];

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

const PERIODS: { label: string; days: number | null }[] = [
  { label: 'All', days: null },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

const BOX_LABEL: CSSProperties = { margin: '10px 0 4px', fontSize: 11, color: 'var(--muted)' };
const CHIP_WRAP: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };
const MUTED: CSSProperties = { color: 'var(--faint)', fontSize: 11 };
const COUNT: CSSProperties = { color: 'var(--faint)', fontSize: 10 };

// ── Helpers ──────────────────────────────────────────────────────

function fallbackColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

function readThemeVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function formatDate(value: string | null | undefined): string {
  const time = observedTime(value);
  if (time === null) return '—';
  return new Date(time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

type DetailRow = { label: string; value: string; color?: string };

// ── Component ────────────────────────────────────────────────────

export default function GraphView(props: GraphViewProps) {
  const { nodes, links, eventsById, orgsById, sourcesById, onSelect, now } = props;
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
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mode, setMode] = useState<'network' | 'matrix'>('network');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('graph:filtersOpen') !== '0'; } catch { return true; }
  });
  const persistFiltersOpen = (value: boolean) => {
    setFiltersOpen(value);
    try { localStorage.setItem('graph:filtersOpen', value ? '1' : '0'); } catch { /* storage may be disabled */ }
  };

  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });

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

  const enriched = useMemo(
    () => buildGraph({ nodes, links, eventsById, sourcesById }),
    [nodes, links, eventsById, sourcesById],
  );

  const families = useMemo(() => {
    const found = new Map<string, string>();
    for (const node of enriched.nodes) {
      const raw = node.kind === 'family' ? node.label : familyOf(node, eventsById);
      const canonical = canonicalFamily(raw);
      if (canonical && !found.has(canonical)) {
        found.set(canonical, familyColors[canonical] ?? fallbackColor(canonical));
      }
    }
    return [...found.entries()]
      .map(([name, color]) => ({ name, color }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }, [enriched.nodes, eventsById, familyColors]);

  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of enriched.nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
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
  }, [enriched.nodes]);

  const visible = useMemo(
    () => filterGraph(enriched, { families: familyFilter, kinds: kindFilter, periodDays, search, now }),
    [enriched, familyFilter, kindFilter, periodDays, search, now],
  );

  // Nodes are mutated in place by d3 (x/y). Re-inject the known positions so
  // changing a filter never re-randomises the layout.
  const data = useMemo(() => {
    const positionedNodes: NodeObject<GraphNode>[] = visible.nodes.map((node) => {
      const position = positionsRef.current.get(node.id);
      return position ? { ...node, x: position.x, y: position.y } : { ...node };
    });
    const positionedLinks: LinkObject<GraphNode, GraphLink>[] = visible.links.map((link) => ({
      ...link,
      source: endId(link.source) ?? '',
      target: endId(link.target) ?? '',
    }));
    return { nodes: positionedNodes, links: positionedLinks };
  }, [visible]);

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (mode !== 'network') return;
    const fg = fgRef.current;
    if (!fg || size.width <= 0) return;
    const timer = setTimeout(() => {
      try { fg.zoomToFit(400, 40); } catch { /* graph unmounted meanwhile */ }
    }, 350);
    return () => clearTimeout(timer);
  }, [mode, data, size]);

  const degreeMap = useMemo(() => {
    const degrees = new Map<string, number>();
    for (const link of visible.links) {
      const source = endId(link.source);
      const target = endId(link.target);
      if (!source || !target || source === target) continue;
      degrees.set(source, (degrees.get(source) ?? 0) + 1);
      degrees.set(target, (degrees.get(target) ?? 0) + 1);
    }
    return degrees;
  }, [visible.links]);

  const selection = useMemo(() => selectNeighborhood(visible, selectedId), [visible, selectedId]);
  const hoverSelection = useMemo(
    () => (hoveredId ? selectNeighborhood(visible, hoveredId) : null),
    [hoveredId, visible],
  );
  const focusSet = selection.node ? selection.nodeIds : hoverSelection?.nodeIds ?? null;

  const capturePositions = useCallback(() => {
    const positions = positionsRef.current;
    for (const node of dataRef.current.nodes) {
      const { x, y } = node;
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        positions.set(node.id, { x, y });
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
    setPeriodDays(null);
    setSearch('');
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    try { fg.zoom(fg.zoom() * factor, 200); } catch { /* not mounted */ }
  }, []);

  const zoomToFit = useCallback(() => {
    try { fgRef.current?.zoomToFit(400, 40); } catch { /* not mounted */ }
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

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    onSelect?.(null);
  }, [onSelect]);

  const nodeColor = useCallback(
    (node: GraphNode): string => {
      if (node.kind === 'family') {
        const canonical = canonicalFamily(node.label);
        return (canonical && familyColors[canonical]) || KIND_COLOR.family;
      }
      if (node.kind === 'event') {
        const canonical = canonicalFamily(familyOf(node, eventsById));
        return (canonical && familyColors[canonical]) || KIND_COLOR.event;
      }
      const canonical = canonicalFamily(node.family);
      if (node.kind === 'source' && canonical && familyColors[canonical]) return familyColors[canonical];
      return KIND_COLOR[node.kind] ?? fallbackColor(node.kind);
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
      const dimmed = focusSet !== null && !focusSet.has(id);

      ctx.globalAlpha = dimmed ? 0.12 : 1;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(node);
      ctx.fill();
      if (id === selectedId || id === hoveredId) {
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = id === selectedId ? labelInk : accent;
        ctx.stroke();
      }

      const label = typeof node.label === 'string' ? node.label : '';
      if (label && !dimmed && (globalScale >= 1.6 || id === hoveredId || id === selectedId)) {
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
    [accent, degreeMap, focusSet, hoveredId, labelBg, labelInk, nodeColor, selectedId],
  );

  const paintPointerArea = useCallback(
    (node: NodeObject<GraphNode>, color: string, ctx: CanvasRenderingContext2D) => {
      const kind = typeof node.kind === 'string' ? node.kind : 'org';
      const id = typeof node.id === 'string' ? node.id : '';
      const radius = (KIND_RADIUS[kind] ?? 4) + Math.min(6, Math.sqrt(degreeMap.get(id) ?? 0) * 1.4);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(typeof node.x === 'number' ? node.x : 0, typeof node.y === 'number' ? node.y : 0, radius + 2, 0, Math.PI * 2);
      ctx.fill();
    },
    [degreeMap],
  );

  const detailRows = useMemo<DetailRow[]>(() => {
    if (!selection.node) return [];
    const node = selection.node;
    const id = rawId(node.id);
    const eventInfo = node.kind === 'event' ? eventsById?.[id] : undefined;
    const orgInfo = node.kind === 'org' ? orgsById?.[id] : undefined;
    const sourceInfo = node.kind === 'source' ? sourcesById?.[id] : undefined;
    const rows: DetailRow[] = [
      { label: 'Name', value: node.label },
      { label: 'Type', value: KIND_LABEL[node.kind] ?? node.kind },
      { label: 'Degree', value: String(degreeMap.get(node.id) ?? 0) },
    ];

    if (node.kind === 'event') {
      const family = node.family ?? eventInfo?.family;
      const canonical = canonicalFamily(family);
      if (canonical) rows.push({ label: 'Family', value: canonical, color: familyColors[canonical] });
      const severity = node.severity ?? eventInfo?.severity;
      if (typeof severity === 'number') rows.push({ label: 'Severity', value: `${severity}/5`, color: severityColor(severity) });
      rows.push({ label: 'Observed', value: formatDate(node.observedAt ?? eventInfo?.observedAt) });
      const sourceId = node.sourceId ?? eventInfo?.sourceId;
      if (sourceId) rows.push({ label: 'Source id', value: sourceId });
      const sourceUrl = node.sourceUrl ?? eventInfo?.sourceUrl;
      if (sourceUrl) rows.push({ label: 'Source URL', value: sourceUrl });
      const assertion = node.assertionType ?? eventInfo?.assertionType;
      if (assertion) rows.push({ label: 'Assertion', value: assertion });
    }
    if (node.kind === 'org') {
      rows.push({ label: 'Organisation kind', value: node.orgKind ?? orgInfo?.kind ?? '—' });
      rows.push({ label: 'City', value: node.city ?? orgInfo?.city ?? '—' });
      rows.push({ label: 'Department', value: node.dept ?? orgInfo?.dept ?? '—' });
    }
    if (node.kind === 'source') {
      if (sourceInfo?.family) rows.push({ label: 'Family', value: sourceInfo.family });
      if (sourceInfo?.url) rows.push({ label: 'URL', value: sourceInfo.url });
    }
    return rows;
  }, [selection.node, degreeMap, eventsById, orgsById, sourcesById, familyColors]);

  const matrixNodes = useMemo(
    () => visible.nodes.filter((node) => node.kind !== 'event' && node.kind !== 'source'),
    [visible.nodes],
  );

  return (
    <div className="gv-root" style={{ backgroundColor: bg, fontFamily: 'var(--font-body)' }}>
      {props.loading && data.nodes.length === 0 ? (
        <LoadingSkeleton label="chargement du graphe…" />
      ) : null}
      <div className="gv-mode-bar" role="tablist" aria-label="Graph display">
        <button
          type="button" role="tab" aria-selected={mode === 'network'} aria-current={mode === 'network' ? 'true' : undefined}
          className={mode === 'network' ? 'is-active' : undefined}
          onClick={() => setMode('network')}
        >
          Network
        </button>
        <button
          type="button" role="tab" aria-selected={mode === 'matrix'} aria-current={mode === 'matrix' ? 'true' : undefined}
          className={mode === 'matrix' ? 'is-active' : undefined}
          onClick={() => setMode('matrix')}
        >
          Matrix
        </button>
      </div>

      <div className="gv-filters">
        <button type="button" className="gv-collapse" onClick={() => persistFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
          Filters {filtersOpen ? '▾' : '▸'}
        </button>
        {filtersOpen && (
          <>
            <label className="gv-search-label" htmlFor="gv-search">Search</label>
            <input
              id="gv-search"
              className="gv-search"
              type="search"
              value={search}
              placeholder="Name, id or family…"
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search graph nodes"
            />
            <p style={BOX_LABEL}>Families</p>
            <div style={CHIP_WRAP}>
              {families.map((family) => {
                const active = familyFilter.has(family.name);
                return (
                  <button key={family.name} type="button" aria-pressed={active} onClick={() => toggleFamily(family.name)} style={chipStyle(active, family.color)}>
                    <span style={dotStyle(family.color)} />
                    {family.name}
                  </button>
                );
              })}
              {families.length === 0 && <span style={MUTED}>No family recorded</span>}
            </div>
            <p style={BOX_LABEL}>Node types</p>
            <div style={CHIP_WRAP}>
              {kinds.map((kind) => {
                const active = kindFilter.has(kind.kind);
                return (
                  <button key={kind.kind} type="button" aria-pressed={active} onClick={() => toggleKind(kind.kind)} style={chipStyle(active, kind.color)}>
                    <span style={dotStyle(kind.color)} />
                    {kind.label}
                    <span style={COUNT}>{kind.count}</span>
                  </button>
                );
              })}
            </div>
            <p style={BOX_LABEL}>Period</p>
            <div style={CHIP_WRAP}>
              {PERIODS.map((period) => (
                <button
                  key={period.label}
                  type="button"
                  aria-pressed={periodDays === period.days}
                  onClick={() => setPeriodDays(period.days)}
                  style={chipStyle(periodDays === period.days, accent)}
                >
                  {period.label}
                </button>
              ))}
            </div>
            <div className="gv-footer">
              <button
                type="button"
                onClick={resetFilters}
                disabled={familyFilter.size === 0 && kindFilter.size === 0 && periodDays === null && search === ''}
                className="gv-reset"
              >
                Reset
              </button>
              <span style={MUTED}>
                {visible.nodes.length} nodes · {visible.links.length} links
              </span>
            </div>
          </>
        )}
      </div>

      {enriched.nodes.length <= 5 ? (
        <div className="gv-empty">
          <p className="gv-empty-title">The graph only draws recorded links</p>
          <p className="gv-empty-text">
            {enriched.nodes.length === 0
              ? 'No fact has been linked to an organisation yet.'
              : `${enriched.nodes.length} nodes: every organisation, department or family shown here must be attached to a linked event.`}
          </p>
          <p className="gv-empty-text">
            A news article naming a business without a repository match stays in the feed but creates no node.
            The graph grows with the quality of attachment, not with collection volume.
          </p>
        </div>
      ) : visible.nodes.length === 0 ? (
        <div className="gv-empty">
          <p className="gv-empty-title">No node matches these filters</p>
          <p className="gv-empty-text">Try another family, period or search term.</p>
          <button type="button" onClick={resetFilters} className="gv-reset">Reset filters</button>
        </div>
      ) : mode === 'matrix' ? (
        <div className="gv-matrix">
          <GraphMatrix nodes={matrixNodes} links={visible.links} />
        </div>
      ) : (
        <>
          <div ref={containerRef} className="gv-canvas">
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
                  if (!focusSet) return linkBase;
                  const source = endId(link.source);
                  const target = endId(link.target);
                  return source !== undefined && target !== undefined && focusSet.has(source) && focusSet.has(target)
                    ? accent
                    : faintLink;
                }}
                linkWidth={(link) => {
                  if (!focusSet) return 1;
                  const source = endId(link.source);
                  const target = endId(link.target);
                  return source !== undefined && target !== undefined && focusSet.has(source) && focusSet.has(target) ? 1.8 : 0.4;
                }}
                onNodeHover={handleNodeHover}
                onNodeClick={handleNodeClick}
                onBackgroundClick={clearSelection}
                onNodeDragEnd={capturePositions}
                onEngineTick={capturePositions}
                onEngineStop={capturePositions}
              />
            )}
          </div>

          <div className="gv-zoom" role="group" aria-label="Zoom controls">
            <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in" title="Zoom in">+</button>
            <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out" title="Zoom out">−</button>
            <button type="button" onClick={zoomToFit} aria-label="Fit graph to view" title="Fit graph to view">Fit</button>
          </div>

          <div className="gv-legend" aria-label="Graph legend">
            <div className="gv-legend-row">
              {kinds.map((kind) => (
                <span key={kind.kind} className="gv-legend-item">
                  <span style={dotStyle(kind.color)} />{kind.label}
                </span>
              ))}
            </div>
            <div className="gv-legend-row">
              {Object.entries(LINK_TYPES).map(([type, label]) => (
                <span key={type} className="gv-legend-item">
                  <span className="gv-link-sample" />{label}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {selection.node && (
        <aside className="gv-detail" aria-label="Node details">
          <header className="gv-detail-head">
            <span style={dotStyle(nodeColor(selection.node))} />
            <div className="gv-detail-title">
              <strong>{selection.node.label}</strong>
              <small>{KIND_LABEL[selection.node.kind] ?? selection.node.kind} · degree {degreeMap.get(selection.node.id) ?? 0}</small>
            </div>
            <button type="button" onClick={clearSelection} className="gv-close" aria-label="Close details">×</button>
          </header>
          <dl className="kv">
            {detailRows.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd style={row.color ? { color: row.color } : undefined}>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="gv-detail-subtitle">Connections ({selection.incidentLinks.length})</p>
          {selection.incidentLinks.length === 0 ? (
            <p className="gv-detail-none">No recorded link.</p>
          ) : (
            <ul className="gv-connections">
              {selection.incidentLinks.map((link, index) => (
                <li key={`${link.otherId}-${link.type}-${index}`}>
                  <span className="gv-arrow" aria-hidden="true">{link.direction === 'out' ? '→' : '←'}</span>
                  <span className="gv-link-type">{LINK_TYPES[link.type] ?? link.type}</span>
                  <button type="button" onClick={() => setSelectedId(link.otherId)} title={link.otherLabel}>
                    {link.otherLabel}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}
