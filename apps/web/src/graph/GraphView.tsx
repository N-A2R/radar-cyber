/**
 * GraphView — force-directed network of organisations, events and sources.
 *
 * Uses the `GET /api/graph` contract (`{ nodes, links }`) and enriches it
 * with the event/source indexes already loaded by the app. Toute l'interface
 * est en français ; les valeurs de données (familles, libellés) restent telles
 * qu'enregistrées.
 */
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import GraphMatrix from '../components/GraphMatrix';
import { LoadingSkeleton } from '../components/Skeleton';
import { Badge } from '@astryxdesign/core/Badge';
import { tokenVar } from '@astryxdesign/core/theme';
import {
  buildGraph,
  canonicalFamily,
  endId,
  familyOf,
  filterGraph,
  nodeRadius,
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

const KIND_ORDER = ['org', 'event', 'source', 'family', 'dept', 'group', 'asset', 'ip'];

/** Types de nœuds : jetons du pont Astryx, une seule palette pour le thème gothic. */
const KIND_VAR: Record<string, string> = {
  org: '--data-steel',
  event: '--family-phishing',
  source: '--data-green',
  family: '--family-vuln',
  dept: '--family-malware',
  group: '--family-ransomware',
  asset: '--data-green',
  ip: '--data-teal',
};

const KIND_LABEL: Record<string, string> = {
  org: 'organisation',
  event: 'événement',
  source: 'source',
  family: 'famille',
  dept: 'département',
  group: 'groupe',
  asset: 'actif',
  ip: 'adresse IP',
};

const FAMILY_VAR: Record<string, string> = {
  ransomware: '--family-ransomware',
  vuln: '--family-vuln',
  phishing: '--family-phishing',
  malware: '--family-malware',
  cert: '--family-cert',
  cert_fr: '--family-cert-fr',
  typosquat: '--family-typosquat',
  reputation: '--family-reputation',
  cti: '--family-cti',
  presse: '--family-presse',
  presse_locale: '--family-presse-locale',
};

/** Repli déterministe : uniquement des jetons, jamais une couleur littérale. */
const FALLBACK_VARS = [
  '--data-steel', '--family-phishing', '--data-green', '--family-malware',
  '--family-ransomware', '--family-cert-fr', '--family-cert',
];

const PERIODS: { label: string; days: number | null }[] = [
  { label: 'Tout', days: null },
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
  { label: '90 jours', days: 90 },
];

const BOX_LABEL: CSSProperties = { margin: '10px 0 4px', fontSize: 11, color: 'var(--muted)' };
const CHIP_WRAP: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };
const MUTED: CSSProperties = { color: 'var(--faint)', fontSize: 11 };
const COUNT: CSSProperties = { color: 'var(--faint)', fontSize: 10 };

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Le canvas ne comprend pas `var(...)` : on résout les jetons (y compris les
 * alias qui pointent vers d'autres jetons) depuis la feuille active.
 */
function resolveColor(name: string): string {
  const reference = tokenVar(name);
  if (typeof window === 'undefined') return reference;
  const styles = window.getComputedStyle(document.documentElement);
  let value = reference;
  for (let depth = 0; depth < 4 && value.includes('var('); depth += 1) {
    value = value.replace(/var\((--[\w-]+)\)/g, (_, token: string) => styles.getPropertyValue(token).trim());
  }
  return value || reference;
}

function fallbackColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return resolveColor(FALLBACK_VARS[Math.abs(hash) % FALLBACK_VARS.length]);
}

function formatDate(value: string | null | undefined): string {
  const time = observedTime(value);
  if (time === null) return '—';
  return new Date(time).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function severityColor(severity: number): string {
  if (severity >= 4) return 'var(--sev-5)';
  if (severity === 3) return 'var(--sev-3)';
  return 'var(--sev-2)';
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
  const { nodes, links, eventsById, orgsById, sourcesById, onSelect, now, temporal } = props;
  // Une seule palette gothic : l'ancien argument `theme` reste accepté mais
  // n'influe plus sur le rendu.
  const bg = resolveColor('--bg');
  const accent = resolveColor('--accent');
  const linkBase = resolveColor('--line');
  const faintLink = resolveColor('--surface-2');
  const labelInk = resolveColor('--text');
  const labelBg = resolveColor('--surface');

  const [familyFilter, setFamilyFilter] = useState<Set<string>>(() => new Set());
  const [kindFilter, setKindFilter] = useState<Set<string>>(() => new Set());
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [keyboardFocusId, setKeyboardFocusId] = useState<string | null>(null);
  const [mode, setMode] = useState<'network' | 'matrix'>('network');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeAware, setTimeAware] = useState(false);
  const sourceNodes = timeAware && temporal ? temporal.nodes : nodes;
  const sourceLinks = timeAware && temporal ? temporal.links : links;
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('graph:filtersOpen') !== '0'; } catch { return true; }
  });
  const persistFiltersOpen = (value: boolean) => {
    setFiltersOpen(value);
    try { localStorage.setItem('graph:filtersOpen', value ? '1' : '0'); } catch { /* storage may be disabled */ }
  };

  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Le conteneur du graphe n'existe qu'une fois les données chargées : un ref
  // classique resterait nul au premier rendu et l'observateur ne serait jamais
  // posé (écran vide à 271 nœuds, mesuré sur `main`). On le suit donc comme un
  // état, pour que l'effet se rejoue à son montage.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    if (!containerEl) return;
    const measure = (width: number, height: number) => {
      // Pas de plancher à 1 px : une zone réellement nulle doit rester nulle
      // pour déclencher l'état explicite au lieu d'un cadre noir de 1 px.
      setSize({ width: Math.floor(width), height: Math.floor(height) });
      setMeasured(true);
    };
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect;
          if (rect) measure(rect.width, rect.height);
        });
    // Mesure immédiate seulement si elle est exploitable : un conteneur pas
    // encore posé (0 × 0) ne doit pas écraser la première entrée de
    // l'observateur, qui arrive au cycle suivant.
    const rect = containerEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) measure(rect.width, rect.height);
    if (!observer) {
      setMeasured(true);
      return;
    }
    observer.observe(containerEl);
    return () => observer.disconnect();
  }, [containerEl]);

  const kindColors = useMemo(() => {
    const palette: Record<string, string> = {};
    for (const [kind, name] of Object.entries(KIND_VAR)) palette[kind] = resolveColor(name);
    return palette;
  }, []);

  const familyColors = useMemo(() => {
    const palette: Record<string, string> = {};
    for (const [key, name] of Object.entries(FAMILY_VAR)) palette[key] = resolveColor(name);
    return palette;
  }, []);

  const enriched = useMemo(
    () => buildGraph({ nodes: sourceNodes, links: sourceLinks, eventsById, sourcesById }),
    [sourceNodes, sourceLinks, eventsById, sourcesById],
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
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
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
        color: kindColors[kind] ?? fallbackColor(kind),
        label: KIND_LABEL[kind] ?? kind,
      }));
  }, [enriched.nodes, kindColors]);

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
    if (!fg || size.width <= 0 || size.height <= 0) return;
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

  // Keyboard traversal follows the strongest nodes first, then the label.
  const keyboardOrder = useMemo(() => {
    return [...visible.nodes].sort((a, b) => {
      const degreeDelta = (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0);
      return degreeDelta || a.label.localeCompare(b.label, 'fr');
    });
  }, [visible.nodes, degreeMap]);
  const keyboardIndex = keyboardOrder.findIndex((node) => node.id === keyboardFocusId);
  const keyboardNode = keyboardIndex >= 0 ? keyboardOrder[keyboardIndex] : null;

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

  const moveKeyboardFocus = useCallback(
    (index: number) => {
      if (keyboardOrder.length === 0) return;
      const wrapped = ((index % keyboardOrder.length) + keyboardOrder.length) % keyboardOrder.length;
      setKeyboardFocusId(keyboardOrder[wrapped].id);
    },
    [keyboardOrder],
  );

  const handleCanvasKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (keyboardOrder.length === 0) return;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          moveKeyboardFocus(keyboardIndex + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          moveKeyboardFocus(keyboardIndex < 0 ? 0 : keyboardIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          moveKeyboardFocus(0);
          break;
        case 'End':
          event.preventDefault();
          moveKeyboardFocus(keyboardOrder.length - 1);
          break;
        case 'Enter':
        case ' ':
          if (keyboardNode) {
            event.preventDefault();
            setSelectedId(keyboardNode.id);
            onSelect?.(keyboardNode.id);
          }
          break;
        case 'Escape':
          setKeyboardFocusId(null);
          break;
        default:
          break;
      }
    },
    [keyboardIndex, keyboardNode, keyboardOrder.length, moveKeyboardFocus, onSelect],
  );

  const handleCanvasFocus = useCallback(() => {
    if (keyboardFocusId === null && keyboardOrder.length > 0) setKeyboardFocusId(keyboardOrder[0].id);
  }, [keyboardFocusId, keyboardOrder]);

  // Colour encodes the node type only, so the legend stays truthful.
  const nodeColor = useCallback((node: GraphNode): string => kindColors[node.kind] ?? fallbackColor(node.kind), [kindColors]);

  const paintNode = useCallback(
    (node: NodeObject<GraphNode>, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = typeof node.id === 'string' ? node.id : '';
      const x = typeof node.x === 'number' ? node.x : 0;
      const y = typeof node.y === 'number' ? node.y : 0;
      const radius = nodeRadius(degreeMap.get(id) ?? 0);
      const dimmed = focusSet !== null && !focusSet.has(id) && id !== keyboardFocusId;

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
      if (id === keyboardFocusId) {
        // Dashed ring drawn outside the fill: keyboard focus stays visible
        // whatever the node colour and without hiding the selection ring.
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = labelInk;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const label = typeof node.label === 'string' ? node.label : '';
      if (label && !dimmed && (globalScale >= 1.6 || id === hoveredId || id === selectedId || id === keyboardFocusId)) {
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
    [accent, degreeMap, focusSet, hoveredId, keyboardFocusId, labelBg, labelInk, nodeColor, selectedId],
  );

  const paintPointerArea = useCallback(
    (node: NodeObject<GraphNode>, color: string, ctx: CanvasRenderingContext2D) => {
      const id = typeof node.id === 'string' ? node.id : '';
      const radius = nodeRadius(degreeMap.get(id) ?? 0);
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
      { label: 'Nom', value: node.label },
      { label: 'Type', value: KIND_LABEL[node.kind] ?? node.kind },
      { label: 'Degré', value: String(degreeMap.get(node.id) ?? 0) },
    ];

    if (node.kind === 'event') {
      const family = node.family ?? eventInfo?.family;
      const canonical = canonicalFamily(family);
      if (canonical) rows.push({ label: 'Famille', value: canonical, color: familyColors[canonical] });
      const severity = node.severity ?? eventInfo?.severity;
      if (typeof severity === 'number') rows.push({ label: 'Sévérité', value: `${severity}/5`, color: severityColor(severity) });
      rows.push({ label: 'Observé', value: formatDate(node.observedAt ?? eventInfo?.observedAt) });
      const sourceId = node.sourceId ?? eventInfo?.sourceId;
      if (sourceId) rows.push({ label: 'Identifiant de source', value: sourceId });
      const sourceUrl = node.sourceUrl ?? eventInfo?.sourceUrl;
      if (sourceUrl) rows.push({ label: 'URL de source', value: sourceUrl });
      const assertion = node.assertionType ?? eventInfo?.assertionType;
      if (assertion) rows.push({ label: "Type d'assertion", value: assertion });
    }
    if (node.kind === 'org') {
      rows.push({ label: "Type d'organisation", value: node.orgKind ?? orgInfo?.kind ?? '—' });
      rows.push({ label: 'Ville', value: node.city ?? orgInfo?.city ?? '—' });
      rows.push({ label: 'Département', value: node.dept ?? orgInfo?.dept ?? '—' });
    }
    if (node.kind === 'source') {
      if (sourceInfo?.family) rows.push({ label: 'Famille', value: sourceInfo.family });
      if (sourceInfo?.url) rows.push({ label: 'URL', value: sourceInfo.url });
    }
    if (node.validFrom) {
      rows.push({ label: 'Valide depuis', value: formatDate(node.validFrom) });
      rows.push({ label: "Valide jusqu'au", value: node.validTo ? formatDate(node.validTo) : 'toujours valide' });
    }
    return rows;
  }, [selection.node, degreeMap, eventsById, orgsById, sourcesById, familyColors]);

  const matrixNodes = useMemo(
    () => visible.nodes.filter((node) => node.kind !== 'event' && node.kind !== 'source'),
    [visible.nodes],
  );
  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const next = event.key === 'Home' || event.key === 'ArrowLeft' ? 'network'
      : event.key === 'End' || event.key === 'ArrowRight' ? 'matrix'
      : null;
    if (next === null) return;
    event.preventDefault();
    setMode(next);
    document.getElementById(next === 'network' ? 'gv-network-tab' : 'gv-matrix-tab')?.focus();
  }

  return (
    <div className="gv-root" style={{ backgroundColor: bg, fontFamily: 'var(--font-body)' }}>
      {props.loading && data.nodes.length === 0 ? (
        <LoadingSkeleton label="chargement du graphe…" />
      ) : null}
      <div className="gv-mode-bar" role="tablist" aria-label="Affichage du graphe">
        <button
          type="button" role="tab" id="gv-network-tab" aria-controls="gv-panel" aria-selected={mode === 'network'} tabIndex={mode === 'network' ? 0 : -1}
          className={mode === 'network' ? 'is-active' : undefined}
          onClick={() => setMode('network')}
          onKeyDown={onTabKeyDown}
        >
          Réseau
        </button>
        <button
          type="button" role="tab" id="gv-matrix-tab" aria-controls="gv-panel" aria-selected={mode === 'matrix'} tabIndex={mode === 'matrix' ? 0 : -1}
          className={mode === 'matrix' ? 'is-active' : undefined}
          onClick={() => setMode('matrix')}
          onKeyDown={onTabKeyDown}
        >
          Matrice
        </button>
      </div>

      <div className="gv-filters">
        <button type="button" className="gv-collapse" onClick={() => persistFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
          Filtres {filtersOpen ? '▾' : '▸'}
        </button>
        <Badge label={`${visible.nodes.length} nœuds`} className="gv-count-badge" />
        {filtersOpen && (
          <>
            <label className="gv-search-label" htmlFor="gv-search">Recherche</label>
            <input
              id="gv-search"
              className="gv-search"
              type="search"
              value={search}
              placeholder="Nom, identifiant ou famille…"
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Rechercher des nœuds du graphe"
            />
            <p style={BOX_LABEL}>Familles</p>
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
              {families.length === 0 && <span style={MUTED}>Aucune famille enregistrée</span>}
            </div>
            <p style={BOX_LABEL}>Types de nœuds</p>
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
            <p style={BOX_LABEL}>Période</p>
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
            {temporal ? (
              <>
                <p style={BOX_LABEL}>Modèle temporel</p>
                <div style={CHIP_WRAP}>
                  <button type="button" aria-pressed={!timeAware} onClick={() => setTimeAware(false)} style={chipStyle(!timeAware, accent)}>
                    Structurel
                  </button>
                  <button type="button" aria-pressed={timeAware} onClick={() => setTimeAware(true)} style={chipStyle(timeAware, accent)}>
                    Temporel
                  </button>
                </div>
              </>
            ) : null}
            <div className="gv-footer">
              <button
                type="button"
                onClick={resetFilters}
                disabled={familyFilter.size === 0 && kindFilter.size === 0 && periodDays === null && search === ''}
                className="gv-reset"
              >
                Réinitialiser
              </button>
              <span style={MUTED}>
                {visible.nodes.length} nœuds · {visible.links.length} liens
              </span>
            </div>
          </>
        )}
      </div>

      {enriched.nodes.length <= 5 ? (
        <div className="gv-empty" id="gv-panel" role="tabpanel" aria-labelledby="gv-network-tab">
          <p className="gv-empty-title">Le graphe ne dessine que les liens enregistrés</p>
          <p className="gv-empty-text">
            {enriched.nodes.length === 0
              ? "Aucun fait n'a encore été relié à une organisation."
              : `${enriched.nodes.length} nœuds : chaque organisation, département ou famille affiché ici doit être rattaché à un événement relié.`}
          </p>
          <p className="gv-empty-text">
            Un article de presse citant une entreprise sans correspondance dans le référentiel reste dans le fil
            mais ne crée aucun nœud. Le graphe grandit avec la qualité du rattachement, pas avec le volume collecté.
          </p>
        </div>
      ) : visible.nodes.length === 0 ? (
        <div className="gv-empty" id="gv-panel" role="tabpanel" aria-labelledby={mode === 'matrix' ? 'gv-matrix-tab' : 'gv-network-tab'}>
          <p className="gv-empty-title">Aucun nœud ne correspond à ces filtres</p>
          <p className="gv-empty-text">Essayez une autre famille, période ou recherche.</p>
          <button type="button" onClick={resetFilters} className="gv-reset">Réinitialiser les filtres</button>
        </div>
      ) : mode === 'matrix' ? (
        <div className="gv-matrix" id="gv-panel" role="tabpanel" aria-labelledby="gv-matrix-tab">
          <GraphMatrix nodes={matrixNodes} links={visible.links} />
        </div>
      ) : (
        <>
          <div
            ref={setContainerEl}
            className="gv-canvas"
            id="gv-panel"
            role="tabpanel"
            aria-labelledby="gv-network-tab"
            tabIndex={0}
            aria-label="Graphe relationnel. Flèches pour parcourir les nœuds, Entrée pour sélectionner."
            onKeyDown={handleCanvasKeyDown}
            onFocus={handleCanvasFocus}
          >
            {size.width > 0 && size.height > 0 ? (
              <ForceGraph2D<GraphNode, GraphLink>
                ref={fgRef}
                width={size.width}
                height={size.height}
                graphData={data}
                backgroundColor={bg}
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
                linkWidth={() => 1}
                onNodeHover={handleNodeHover}
                onNodeClick={handleNodeClick}
                onBackgroundClick={clearSelection}
                onNodeDragEnd={capturePositions}
                onEngineTick={capturePositions}
                onEngineStop={capturePositions}
              />
            ) : measured ? (
              <p className="gv-no-size" role="status">
                Zone de dessin mesurée à {size.width} × {size.height} px : dimensions insuffisantes pour
                tracer le graphe. Vérifiez la taille du conteneur.
              </p>
            ) : null}
            <span className="gv-keyboard-hint" aria-hidden="true">Flèches : parcourir · Entrée : sélectionner</span>
            <p className="gv-sr-status" role="status" aria-live="polite">
              {keyboardNode
                ? `Nœud ${keyboardIndex + 1} sur ${keyboardOrder.length} : ${keyboardNode.label}, ${degreeMap.get(keyboardNode.id) ?? 0} lien(s). Entrée pour sélectionner.`
                : ''}
            </p>
          </div>

          <div className="gv-zoom" role="group" aria-label="Commandes de zoom">
            <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom avant" title="Zoom avant">+</button>
            <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom arrière" title="Zoom arrière">−</button>
            <button type="button" onClick={zoomToFit} aria-label="Ajuster le graphe à la vue" title="Ajuster le graphe à la vue">Ajuster</button>
          </div>

          <div className="gv-legend" aria-label="Légende du graphe">
            <div className="gv-legend-row">
              <span className="gv-legend-key">Taille = liens</span>
              {[1, 4, 16].map((degree) => (
                <span key={degree} className="gv-legend-item">
                  <span
                    className="gv-size-sample"
                    style={{ width: nodeRadius(degree) * 2, height: nodeRadius(degree) * 2 }}
                  />
                  {degree} {degree > 1 ? 'liens' : 'lien'}
                </span>
              ))}
              <span className="gv-legend-note">surface proportionnelle au degré réel</span>
            </div>
            <div className="gv-legend-row">
              <span className="gv-legend-key">Couleur = type</span>
              {kinds.map((kind) => (
                <span key={kind.kind} className="gv-legend-item">
                  <span style={dotStyle(kind.color)} />{kind.label}
                </span>
              ))}
            </div>
            <div className="gv-legend-row">
              <span className="gv-legend-key">Liens</span>
              <span className="gv-legend-note">épaisseur constante · aucun poids dans la donnée</span>
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
        <aside className="gv-detail" aria-label="Détails du nœud">
          <header className="gv-detail-head">
            <span style={dotStyle(nodeColor(selection.node))} />
            <div className="gv-detail-title">
              <strong>{selection.node.label}</strong>
              <small>{KIND_LABEL[selection.node.kind] ?? selection.node.kind} · degré {degreeMap.get(selection.node.id) ?? 0}</small>
            </div>
            <button type="button" onClick={clearSelection} className="gv-close" aria-label="Fermer les détails">×</button>
          </header>
          <dl className="kv">
            {detailRows.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd style={row.color ? { color: row.color } : undefined}>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="gv-detail-subtitle">Connexions ({selection.incidentLinks.length})</p>
          {selection.incidentLinks.length === 0 ? (
            <p className="gv-detail-none">Aucun lien enregistré.</p>
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
