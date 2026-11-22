// @vitest-environment jsdom
/**
 * GraphView — mounted DOM test for the two interactions that matter:
 * filtering (family / search / period) and node selection with a detail panel.
 * The force-graph canvas is replaced by plain buttons calling onNodeClick;
 * the filtering and selection logic itself is the real component code.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GraphView from '../src/graph/GraphView';
import type { GraphEventInfo, GraphNode, GraphSourceInfo } from '../src/graph/graphModel';

// vi.mock factories are hoisted above imports, so React is loaded inside it.
vi.mock('react-force-graph-2d', async () => {
  const React = await import('react');
  return {
    default: ({ graphData, onNodeClick, onBackgroundClick }: {
      graphData: { nodes: GraphNode[] };
      onNodeClick: (node: GraphNode) => void;
      onBackgroundClick: () => void;
    }) => React.createElement(
      'div',
      { 'data-testid': 'graph-canvas', onClick: onBackgroundClick },
      graphData.nodes.map((node) => React.createElement('button', {
        key: node.id,
        type: 'button',
        'data-node-id': node.id,
        onClick: (event: MouseEvent) => { event.stopPropagation(); onNodeClick(node); },
      }, node.label)),
    ),
  };
});

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse('2026-11-21T12:00:00Z');
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

const events: Record<string, GraphEventInfo> = {
  '101': { title: 'Ransomware hit Acme', family: 'ransomware', severity: 4, observedAt: iso(2), sourceId: 'src-1', orgId: 10 },
  '102': { title: 'Phishing wave at Beta', family: 'phishing', severity: 2, observedAt: iso(20), sourceId: 'src-2', orgId: 20 },
  '103': { title: 'Old ransomware fact', family: 'ransomware', severity: 1, observedAt: iso(120), sourceId: 'src-1', orgId: 10 },
};
const sources: Record<string, GraphSourceInfo> = {
  'src-1': { name: 'Press Despatch', family: 'presse', url: 'https://example.test/src1' },
  'src-2': { name: 'CVE Feed', family: 'cert', url: 'https://example.test/src2' },
};
const nodes: GraphNode[] = [
  { id: 'org:10', label: 'Acme', kind: 'org', dept: 'Gironde' },
  { id: 'org:20', label: 'Beta', kind: 'org', dept: 'Rhône' },
  { id: 'dept:Gironde', label: 'Gironde', kind: 'dept' },
  { id: 'dept:Rhône', label: 'Rhône', kind: 'dept' },
  { id: 'family:ransomware', label: 'ransomware', kind: 'family' },
  { id: 'family:phishing', label: 'phishing', kind: 'family' },
];
const links = [
  { source: 'org:10', target: 'dept:Gironde', type: 'rattache' },
  { source: 'org:20', target: 'dept:Rhône', type: 'rattache' },
  { source: 'org:10', target: 'family:ransomware', type: 'has_event' },
  { source: 'org:20', target: 'family:phishing', type: 'has_event' },
];
const temporal = {
  nodes: [
    { id: 'org:99', label: 'Temporal Org', kind: 'org', validFrom: iso(30), validTo: null },
    { id: 'ip:203.0.113.7', label: '203.0.113.7', kind: 'ip', validFrom: iso(30), validTo: null },
  ],
  links: [
    { source: 'org:99', target: 'ip:203.0.113.7', type: 'dns_link', validFrom: iso(30), validTo: null },
  ],
};

let container: HTMLDivElement;
let root: Root;
let selected: (string | null)[];

function mount() {
  selected = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<GraphView
      nodes={nodes} links={links} eventsById={events} sourcesById={sources}
      now={NOW} onSelect={(id) => selected.push(id)} theme="observatoire"
    />);
  });
}

function mountTemporal() {
  selected = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<GraphView
      nodes={nodes} links={links} temporal={temporal} eventsById={events} sourcesById={sources}
      now={NOW} onSelect={(id) => selected.push(id)} theme="observatoire"
    />);
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((element) => element.textContent?.trim().startsWith(label));
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

function click(label: string) {
  act(() => { button(label).click(); });
}

function counts(): string {
  return container.querySelector('.gv-footer span')?.textContent ?? '';
}

async function flush() {
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  testGlobals.ResizeObserver = class {
    constructor(private readonly callback: (entries: unknown[]) => void) {}
    observe() {
      this.callback([{ contentRect: { width: 800, height: 600 } }]);
    }
    disconnect() {}
  };
  localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('GraphView — filters', () => {
  it('enriches the graph and filters by family', async () => {
    await mount();
    await flush();
    expect(counts()).toContain('11 nœuds');
    expect(container.querySelector('[data-node-id="event:101"]')).not.toBeNull();
    expect(container.querySelector('[data-node-id="source:src-1"]')).not.toBeNull();

    click('ransomware');
    expect(counts()).toContain('6 nœuds');
    expect(container.querySelector('[data-node-id="event:102"]')).toBeNull();
    expect(container.querySelector('[data-node-id="source:src-2"]')).toBeNull();
    expect(button('ransomware').getAttribute('aria-pressed')).toBe('true');
  });

  it('filters by search term and by period', async () => {
    await mount();
    await flush();
    const search = container.querySelector('#gv-search') as HTMLInputElement;
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setNativeValue?.call(search, 'Beta');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(counts()).toContain('5 nœuds');
    expect(container.querySelector('[data-node-id="org:10"]')).toBeNull();
    expect(container.querySelector('[data-node-id="org:20"]')).not.toBeNull();

    click('Réinitialiser');
    expect(counts()).toContain('11 nœuds');
    click('7 jours');
    expect(counts()).toContain('5 nœuds');
    expect(container.querySelector('[data-node-id="event:103"]')).toBeNull();
    expect(container.querySelector('[data-node-id="dept:Rhône"]')).toBeNull();
  });
});

describe('GraphView — selection', () => {
  it('shows the neighbourhood and typed links, and follows a link to another node', async () => {
    await mount();
    await flush();
    act(() => { (container.querySelector('[data-node-id="event:101"]') as HTMLButtonElement).click(); });

    const detail = container.querySelector('.gv-detail');
    expect(detail).not.toBeNull();
    expect(detail?.textContent).toContain('Ransomware hit Acme');
    expect(detail?.textContent).toContain('Connexions (3)');
    expect(detail?.textContent).toContain('rapporté par');
    expect(detail?.textContent).toContain('Press Despatch');
    expect(selected).toEqual(['event:101']);

    act(() => { button('Press Despatch').click(); });
    expect(container.querySelector('.gv-detail')?.textContent).toContain('Press Despatch');
    expect(container.querySelector('.gv-detail')?.textContent).toContain('https://example.test/src1');
    expect(selected).toEqual(['event:101', 'source:src-1']);

    act(() => { (container.querySelector('.gv-close') as HTMLButtonElement).click(); });
    expect(container.querySelector('.gv-detail')).toBeNull();
    expect(selected).toEqual(['event:101', 'source:src-1', null]);
  });
});

describe('GraphView — time-aware graph', () => {
  it('switches to the time-aware graph and shows each entity validity period', async () => {
    await mountTemporal();
    await flush();
    expect(button('Temporel')).not.toBeNull();
    expect(container.querySelector('[data-node-id="org:99"]')).toBeNull();

    click('Temporel');
    expect(container.querySelector('[data-node-id="org:99"]')).not.toBeNull();
    expect(container.querySelector('[data-node-id="ip:203.0.113.7"]')).not.toBeNull();
    act(() => { (container.querySelector('[data-node-id="org:99"]') as HTMLButtonElement).click(); });
    const detail = container.querySelector('.gv-detail')?.textContent ?? '';
    expect(detail).toContain('Valide depuis');
    expect(detail).toContain('toujours valide');
    expect(detail).toContain('lien DNS');

    click('Structurel');
    expect(container.querySelector('[data-node-id="org:99"]')).toBeNull();
  });
});
