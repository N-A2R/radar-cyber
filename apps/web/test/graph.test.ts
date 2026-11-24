/**
 * Graph model — unit tests for enrichment, filtering and selection.
 * Run: pnpm -F @radar/web exec vitest run test/graph.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  filterGraph,
  NODE_RADIUS_MAX,
  NODE_RADIUS_MIN,
  nodeRadius,
  observedTime,
  selectNeighborhood,
  type GraphData,
  type GraphEventInfo,
  type GraphLink,
  type GraphNode,
  type GraphSourceInfo,
} from '../src/graph/graphModel';
import { parseEventTime } from '../src/map/timeline';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

const events: Record<string, GraphEventInfo> = {
  '101': {
    title: 'Ransomware hit Acme', family: 'ransomware', severity: 4,
    observedAt: iso(2), sourceId: 'src-1', assertionType: 'observation', orgId: 10,
  },
  '102': {
    title: 'Phishing wave at Beta', family: 'phishing', severity: 2,
    observedAt: iso(20), sourceId: 'src-2', orgId: 20,
  },
  '103': {
    title: 'Unrelated old fact', family: 'ransomware', severity: 1,
    observedAt: iso(120), sourceId: 'src-1', orgId: 10,
  },
  '104': { title: 'No recorded attachment', family: 'vuln', observedAt: iso(1) },
};

const sources: Record<string, GraphSourceInfo> = {
  'src-1': { name: 'Press Despatch', family: 'presse', url: 'https://example.test/src1' },
  'src-2': { name: 'CVE Feed', family: 'cert', url: 'https://example.test/src2' },
};

function fixture(): GraphData {
  return buildGraph({
    nodes: [
      { id: 'org:10', label: 'Acme', kind: 'org', dept: 'Gironde' },
      { id: 'org:20', label: 'Beta', kind: 'org', dept: 'Rhône' },
      { id: 'dept:Gironde', label: 'Gironde', kind: 'dept' },
      { id: 'dept:Rhône', label: 'Rhône', kind: 'dept' },
      { id: 'family:ransomware', label: 'ransomware', kind: 'family' },
      { id: 'family:phishing', label: 'phishing', kind: 'family' },
    ],
    links: [
      { source: 'org:10', target: 'dept:Gironde', type: 'rattache' },
      { source: 'org:20', target: 'dept:Rhône', type: 'rattache' },
      { source: 'org:10', target: 'family:ransomware', type: 'has_event' },
      { source: 'org:20', target: 'family:phishing', type: 'has_event' },
    ],
    eventsById: events,
    sourcesById: sources,
  });
}

const ids = (data: GraphData) => data.nodes.map((node) => node.id);
const linkTypes = (data: GraphData) => data.links.map((link) => link.type);

describe('nodeRadius', () => {
  it('grows with the real degree inside readable bounds', () => {
    expect(nodeRadius(0)).toBe(NODE_RADIUS_MIN);
    expect(nodeRadius(null)).toBe(NODE_RADIUS_MIN);
    expect(nodeRadius(Number.NaN)).toBe(NODE_RADIUS_MIN);
    expect(nodeRadius(1)).toBeGreaterThan(nodeRadius(0));
    expect(nodeRadius(16)).toBeGreaterThan(nodeRadius(4));
    expect(nodeRadius(10_000)).toBe(NODE_RADIUS_MAX);
  });
});

describe('buildGraph', () => {
  it('adds events and sources as nodes with measured, typed links', () => {
    const graph = fixture();
    expect(ids(graph)).toEqual(expect.arrayContaining(['event:101', 'event:102', 'event:103', 'source:src-1', 'source:src-2']));
    expect(ids(graph)).not.toContain('event:104'); // no family, org or source to attach to
    expect(linkTypes(graph)).toEqual(expect.arrayContaining(['contains', 'reported_by', 'observed_at', 'rattache', 'has_event']));
    expect(graph.links).toContainEqual({ source: 'event:101', target: 'source:src-1', type: 'reported_by' });
    expect(graph.links).toContainEqual({ source: 'org:10', target: 'event:101', type: 'observed_at' });
    expect(graph.links).toContainEqual({ source: 'family:ransomware', target: 'event:101', type: 'contains' });
    expect(new Set(ids(graph)).size).toBe(graph.nodes.length); // no duplicate node
  });
});

describe('filterGraph', () => {
  it('filters by family and keeps the attached organisation, department and source', () => {
    const filtered = filterGraph(fixture(), { families: new Set(['ransomware']) });
    expect(ids(filtered)).toEqual(expect.arrayContaining([
      'family:ransomware', 'event:101', 'event:103', 'org:10', 'dept:Gironde', 'source:src-1',
    ]));
    expect(ids(filtered)).not.toContain('event:102');
    expect(ids(filtered)).not.toContain('family:phishing');
    expect(ids(filtered)).not.toContain('source:src-2');
    expect(filtered.links.every((link) => ids(filtered).includes(link.source) && ids(filtered).includes(link.target))).toBe(true);
  });

  it('filters by period using observed dates and keeps the structural context', () => {
    const filtered = filterGraph(fixture(), { periodDays: 7, now: NOW });
    expect(ids(filtered)).toEqual(expect.arrayContaining([
      'event:101', 'family:ransomware', 'org:10', 'dept:Gironde', 'source:src-1',
    ]));
    expect(ids(filtered)).not.toContain('event:102'); // 20 days old
    expect(ids(filtered)).not.toContain('event:103'); // 120 days old
    expect(ids(filtered)).not.toContain('dept:Rhône');
    expect(filtered.links.every((link) => ids(filtered).includes(link.source) && ids(filtered).includes(link.target))).toBe(true);
  });

  it('combines family, period and search as intersections', () => {
    const filtered = filterGraph(fixture(), {
      families: new Set(['ransomware']), periodDays: 7, now: NOW, search: 'acme',
    });
    expect(ids(filtered)).toEqual(expect.arrayContaining(['event:101', 'org:10', 'family:ransomware', 'source:src-1']));
    expect(ids(filtered)).not.toContain('event:103'); // right family, wrong period
    expect(ids(filtered)).not.toContain('dept:Rhône');
  });

  it('filters by node kind and returns an empty graph when nothing matches', () => {
    const onlySources = filterGraph(fixture(), { kinds: new Set(['source']) });
    expect(ids(onlySources).sort()).toEqual(['source:src-1', 'source:src-2']);
    expect(onlySources.links).toEqual([]);
    expect(filterGraph(fixture(), { search: 'does not exist' }).nodes).toEqual([]);
  });

  it('keeps every node when the graph has no dated event', () => {
    const undated: GraphData = {
      nodes: [{ id: 'org:1', label: 'Acme', kind: 'org' }],
      links: [],
    };
    expect(filterGraph(undated, { periodDays: 7, now: NOW }).nodes).toEqual(undated.nodes);
  });
});

describe('selectNeighborhood', () => {
  it('returns the selected node, its neighbours and typed incident links', () => {
    const selection = selectNeighborhood(fixture(), 'event:101');
    expect(selection.node?.label).toBe('Ransomware hit Acme');
    expect([...selection.nodeIds].sort()).toEqual([
      'event:101', 'family:ransomware', 'org:10', 'source:src-1',
    ].sort());
    expect(selection.incidentLinks).toContainEqual({
      type: 'reported_by', direction: 'out', otherId: 'source:src-1', otherLabel: 'Press Despatch',
    });
    expect(selection.incidentLinks).toContainEqual({
      type: 'contains', direction: 'in', otherId: 'family:ransomware', otherLabel: 'ransomware',
    });
  });

  it('returns an empty selection for a missing or null id', () => {
    for (const id of [null, undefined, 'event:999']) {
      const selection = selectNeighborhood(fixture(), id);
      expect(selection.node).toBeNull();
      expect(selection.nodeIds.size).toBe(0);
      expect(selection.incidentLinks).toEqual([]);
    }
  });
});

describe('graph at 500 nodes', () => {
  it('builds, filters and selects without pathological cost', () => {
    const structural: GraphNode[] = [];
    const links: GraphLink[] = [];
    const events: Record<string, GraphEventInfo> = {};
    const sources: Record<string, GraphSourceInfo> = {};
    for (let i = 0; i < 10; i += 1) structural.push({ id: `family:f${i}`, label: `f${i}`, kind: 'family' });
    for (let i = 0; i < 30; i += 1) structural.push({ id: `dept:d${i}`, label: `d${i}`, kind: 'dept' });
    for (let i = 0; i < 140; i += 1) {
      structural.push({ id: `org:${i}`, label: `Organisation ${i}`, kind: 'org' });
      links.push({ source: `org:${i}`, target: `dept:d${i % 30}`, type: 'rattache' });
      links.push({ source: `org:${i}`, target: `family:f${i % 10}`, type: 'has_event' });
    }
    for (let i = 0; i < 280; i += 1) {
      events[String(i)] = {
        title: `Event ${i}`, family: `f${i % 10}`, observedAt: iso(i / 24),
        sourceId: `s${i % 40}`, orgId: i % 140,
      };
    }
    for (let i = 0; i < 40; i += 1) sources[`s${i}`] = { name: `Source ${i}`, family: 'presse' };

    const started = performance.now();
    const graph = buildGraph({ nodes: structural, links, eventsById: events, sourcesById: sources });
    const buildMs = performance.now() - started;
    const filteredStart = performance.now();
    const filtered = filterGraph(graph, { families: new Set(['f0']), periodDays: 7, now: NOW });
    const filterMs = performance.now() - filteredStart;
    const selection = selectNeighborhood(graph, 'event:0');

    expect(graph.nodes.length).toBe(500);
    expect(graph.links.length).toBe(1120);
    expect(filtered.nodes.length).toBeGreaterThan(0);
    expect(selection.nodeIds.size).toBeGreaterThan(1);
    // Generous ceiling: catches an accidental O(n²) regression, not CI jitter.
    expect(buildMs).toBeLessThan(1000);
    expect(filterMs).toBeLessThan(1000);
    console.log(
      `[graph perf] 500 nodes / ${graph.links.length} links: build ${buildMs.toFixed(1)} ms, filter ${filterMs.toFixed(1)} ms`,
    );
  });
});

describe('PostgreSQL timestamps in the graph', () => {
  it('shares the map parser for PostgreSQL offsets', () => {
    const pg = '2026-11-21 15:00:00+01';
    expect(observedTime(pg)).toBe(parseEventTime(pg));
    expect(observedTime(pg)).toBe(Date.parse('2026-11-21T15:00:00+01:00'));
    expect(observedTime('not-a-date')).toBeNull();
  });

  it('excludes unparsable dates from every rolling window', () => {
    const graph: GraphData = {
      nodes: [
        { id: 'event:recent', label: 'PG récent', kind: 'event', observedAt: '2026-11-21 15:00:00+01' },
        { id: 'event:old', label: 'PG ancien', kind: 'event', observedAt: '2026-10-01 08:00:00+01' },
        { id: 'event:broken', label: 'Date illisible', kind: 'event', observedAt: '21/11/2026 15:00' },
      ],
      links: [],
    };
    for (const days of [7, 30, 90]) {
      const ids = filterGraph(graph, { periodDays: days, now: NOW }).nodes.map((node) => node.id);
      expect(ids).toEqual(days === 90 ? ['event:recent', 'event:old'] : ['event:recent']);
    }
  });
});
