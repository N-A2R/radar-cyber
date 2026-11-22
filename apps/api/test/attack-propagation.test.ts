/**
 * Digital-twin propagation: one test per observable behavior.
 * All fixtures are synthetic; no victim data and no production row is used.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAdjacency,
  buildMeasurement,
  expandHop,
  isEdgeActiveAt,
  selectSeedOrg,
  simulatePropagation,
  summarizeRuns,
  type GraphEdge,
  type GraphNode,
} from "../src/attack-propagation.js";

const AT = new Date("2026-11-21T16:33:01Z");
const START = "2026-11-01T00:00:00Z";
const CLOSED = "2026-11-10T00:00:00Z";

const nodes: GraphNode[] = [
  { id: "org:A", kind: "org", dept: "33", label: "Jane Doe victim must never appear" },
  { id: "org:B", kind: "org", dept: "17" },
  { id: "org:C", kind: "org", dept: "64" },
  { id: "org:D", kind: "org", dept: "87" },
  { id: "event:1", kind: "event" },
  { id: "event:2", kind: "event" },
  { id: "event:3", kind: "event" },
  { id: "event:4", kind: "event" },
  { id: "event:expired", kind: "event" },
  { id: "event:future", kind: "event" },
  { id: "source:S", kind: "source" },
  { id: "domain:H", kind: "domain" },
  { id: "group:G", kind: "group" },
  { id: "family:F", kind: "family" },
  { id: "dept:33", kind: "dept" },
];

const edges: GraphEdge[] = [
  { source: "org:A", target: "event:1", type: "targeted_by", validFrom: START },
  { source: "org:A", target: "event:2", type: "targeted_by", validFrom: START },
  { source: "org:B", target: "event:3", type: "targeted_by", validFrom: START },
  { source: "org:C", target: "event:4", type: "targeted_by", validFrom: START },
  { source: "event:1", target: "source:S", type: "reported_by", validFrom: START },
  { source: "event:3", target: "source:S", type: "reported_by", validFrom: START },
  { source: "event:3", target: "domain:H", type: "published_on", validFrom: START },
  { source: "event:4", target: "domain:H", type: "published_on", validFrom: START },
  { source: "group:G", target: "event:4", type: "claims", validFrom: START },
  { source: "org:D", target: "group:G", type: "attributed_to", validFrom: START },
  { source: "event:1", target: "family:F", type: "contains", validFrom: START },
  { source: "org:A", target: "dept:33", type: "located_in", validFrom: START },
  { source: "org:D", target: "event:expired", type: "targeted_by", validFrom: START, validTo: CLOSED },
  { source: "org:D", target: "event:future", type: "targeted_by", validFrom: "2026-12-01T00:00:00Z" },
];

test("temporal filter keeps open links and drops closed or future ones", () => {
  assert.equal(isEdgeActiveAt(edges[0]!, AT), true);
  assert.equal(isEdgeActiveAt(edges[12]!, AT), false);
  assert.equal(isEdgeActiveAt(edges[13]!, AT), false);
  assert.equal(isEdgeActiveAt({ ...edges[0]!, validFrom: "2026-11-21T16:33:01Z" }, AT), true);
  assert.equal(isEdgeActiveAt({ ...edges[0]!, validFrom: "invalid" }, AT), false);
});

test("typed adjacency follows evidence pivots both ways and skips taxonomy", () => {
  const adjacency = buildAdjacency(edges, { at: AT });
  assert.deepEqual([...adjacency.get("source:S")!.keys()].sort(), ["event:1", "event:3"]);
  assert.equal(adjacency.get("event:1")!.get("source:S")!.has("reported_by"), true);
  assert.equal(adjacency.get("org:B")!.get("event:3")!.has("targeted_by"), true);
  assert.equal(adjacency.has("family:F"), false);
  assert.equal(adjacency.get("org:A")!.has("dept:33"), false);
  assert.equal(adjacency.get("org:D")?.has("event:expired") ?? false, false);
  assert.equal(adjacency.get("org:D")?.has("event:future") ?? false, false);
});

test("seed selection picks the organization with the most targeted events", () => {
  assert.deepEqual(selectSeedOrg(nodes, edges, AT), { orgId: "org:A", targetedEvents: 2 });
});

test("seed selection breaks ties by organization id", () => {
  const tied: GraphEdge[] = [
    { source: "org:Z", target: "event:1", type: "targeted_by", validFrom: START },
    { source: "org:A", target: "event:2", type: "targeted_by", validFrom: START },
  ];
  assert.deepEqual(selectSeedOrg(nodes, tied, AT), { orgId: "org:A", targetedEvents: 1 });
});

test("one hop counts each newly reached node once and ignores visited nodes", () => {
  const adjacency = buildAdjacency(edges, { at: AT });
  const expansion = expandHop(["event:1", "event:3"], adjacency, new Set(["org:A"]));
  assert.deepEqual(expansion.next, ["domain:H", "org:B", "source:S"]);
  assert.equal(expansion.traversed, 3);
  assert.deepEqual(expansion.types, ["published_on", "reported_by", "targeted_by"]);
});

test("propagation counts organizations only and stops at the hop limit", () => {
  const short = simulatePropagation({ nodes, edges, seedOrgId: "org:A", at: AT, maxHops: 1 });
  assert.deepEqual(short.reachedOrgIds, ["org:A"]);
  assert.deepEqual(short.hops.map((hop) => hop.organizations), [0]);

  const full = simulatePropagation({ nodes, edges, seedOrgId: "org:A", at: AT, maxHops: 8 });
  assert.deepEqual(full.reachedOrgIds, ["org:A", "org:B", "org:C", "org:D"]);
  assert.deepEqual(full.secondaryOrgIds, ["org:B", "org:C", "org:D"]);
  assert.equal(full.hops.length, 7);
  assert.equal(full.traversed, 10);
  assert.deepEqual(full.typesUsed, [
    "attributed_to", "claims", "published_on", "reported_by", "targeted_by",
  ]);
});

test("propagation through a removed relation type no longer reaches its pivots", () => {
  const types = ["targeted_by", "claims", "attributed_to", "mentions_product", "produced_by",
    "published_on", "owns_domain", "dns_link", "resolves_to"];
  const result = simulatePropagation({
    nodes, edges, seedOrgId: "org:A", at: AT, maxHops: 8, types,
  });
  assert.deepEqual(result.reachedOrgIds, ["org:A"]);
  assert.equal(result.typesUsed.includes("reported_by"), false);
});

test("runs summary reports mean, median, bounds and distribution", () => {
  assert.deepEqual(summarizeRuns([1, 5, 5, 9]), {
    seeds: 4,
    mean: 5,
    median: 5,
    min: 1,
    max: 9,
    distribution: { "1": 1, "5": 2, "9": 1 },
  });
});

test("measurement payload never carries a victim label", () => {
  const reference = simulatePropagation({ nodes, edges, seedOrgId: "org:A", at: AT, maxHops: 4 });
  const payload = buildMeasurement({
    measuredAt: AT.toISOString(),
    database: "postgres://radar:***@localhost:5433/radar",
    baseline: { organizations: 1673151, sources: 312, events: 26394 },
    observationTime: AT.toISOString(),
    graph: {
      entities: nodes.length,
      relations: edges.length,
      relationsByType: {},
      organizationsOutsideNouvelleAquitaine: 0,
    },
    seed: { orgId: "org:A", targetedEvents: 2 },
    reference,
    allRuns: summarizeRuns([2, 4]),
    nodes,
  });
  const json = JSON.stringify(payload);
  assert.equal(json.includes("Jane Doe"), false);
  for (const forbidden of ["label", "title", "evidence", "name"]) {
    assert.equal(new RegExp(`"${forbidden}"\\s*:`).test(json), false);
  }
});

test("identical snapshots produce identical measurements", () => {
  const options = { nodes, edges, seedOrgId: "org:A", at: AT, maxHops: 6 };
  assert.deepEqual(simulatePropagation(options), simulatePropagation(options));
});
