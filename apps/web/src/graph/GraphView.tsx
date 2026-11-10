import ForceGraph2D from 'react-force-graph-2d';
import type { CSSProperties } from 'react';

type GNode = { id: string; label: string; kind: 'org' | 'family' | 'dept' | 'group' | 'asset' };
type GLink = { source: string; target: string; type: string };

const COLOR_BY_KIND: Record<GNode['kind'], string> = {
  org: '#38bdf8',
  family: '#f59e0b',
  dept: '#a78bfa',
  group: '#ef4444',
  asset: '#22c55e',
};

const VAL_BY_KIND: Record<GNode['kind'], number> = {
  dept: 5,
  org: 4,
  family: 3,
  group: 2,
  asset: 1,
};

const BG_BY_THEME: Record<string, string> = {
  clair: '#f5f6f8',
  souverain: '#0c0a09',
  terminal: '#000000',
  observatoire: '#0a0e14',
};

const LINK_BY_THEME: Record<string, string> = {
  clair: 'rgba(71,85,105,0.35)',
  souverain: 'rgba(148,163,184,0.35)',
  terminal: 'rgba(148,163,184,0.35)',
  observatoire: 'rgba(148,163,184,0.35)',
};

export default function GraphView(props: { nodes: GNode[]; links: GLink[]; onSelect?: (id: string) => void }) {
  const theme = typeof document === 'undefined'
    ? 'observatoire'
    : document.documentElement.dataset.theme ?? 'observatoire';
  const bg = BG_BY_THEME[theme] ?? BG_BY_THEME.observatoire;
  const containerStyle: CSSProperties = { width: '100%', height: '100%', backgroundColor: bg };

  return (
    <div style={containerStyle}>
      <ForceGraph2D
        graphData={{ nodes: props.nodes, links: props.links }}
        backgroundColor={bg}
        nodeLabel={(n) => (n as GNode).label}
        nodeColor={(n) => COLOR_BY_KIND[(n as GNode).kind] ?? '#94a3b8'}
        nodeVal={(n) => VAL_BY_KIND[(n as GNode).kind] ?? 2}
        linkColor={() => LINK_BY_THEME[theme] ?? LINK_BY_THEME.observatoire}
        cooldownTicks={120}
        onNodeClick={(node) => props.onSelect?.((node as GNode).id)}
      />
    </div>
  );
}
