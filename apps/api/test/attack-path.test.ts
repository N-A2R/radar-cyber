/**
 * One behaviour per test: the shortest chain, its intermediaries, the NA
 * boundary, explicit targets, direct attribution, privacy, gray sources and
 * input validation. All fixtures live in an ephemeral test database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import attackPathRoute from "../src/routes/attack-path.js";

const TAG = `ap${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const WHEN = "2026-05-10T10:00:00.000Z";
const PERSONAL = "Victime Jean Dupont 12 rue des Lilas";
const GRAY = `${TAG}-gray`;
const OTHER = `${TAG}-other`;

let app: FastifyInstance;
let naOrg: number;
let outOrg: number;

type PathResponse = {
  group: string;
  target: string | null;
  found: boolean;
  hops: number;
  path: string[];
  links: { source: string; target: string; type: string }[];
  nodes: { id: string; kind: string; label: string; props: Record<string, unknown> }[];
  intermediaries: string[];
  tookMs: number;
};

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url) VALUES
       ($1, $2, 'leaks', 'https://example.invalid/gray'),
       ($3, $4, 'ransomware', 'https://example.invalid/other')`,
    [GRAY, `Gray source ${TAG}`, OTHER, `Other source ${TAG}`],
  );
  const na = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain)
     VALUES ($1, $2, 'entreprise', '33', $3) RETURNING id`,
    [`NA org ${TAG}`, `na-org-${TAG}`, `${TAG}.example`],
  );
  const outside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain)
     VALUES ($1, $2, 'entreprise', '75', $3) RETURNING id`,
    [`Outside org ${TAG}`, `outside-org-${TAG}`, `outside-${TAG}.example`],
  );
  naOrg = na.rows[0]!.id;
  outOrg = outside.rows[0]!.id;

  const addEvent = async (
    suffix: string,
    group: string | null,
    source: string,
    org: number | null,
    title: string,
  ): Promise<void> => {
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, valid_at,
                          source_id, org_id, evidence)
       VALUES ($1, 'ransomware', 'third_party_claim', $2, $3, $3, $4, $5, $6)`,
      [`${TAG}-${suffix}`, title, WHEN, source, org, JSON.stringify(group ? { group } : {})],
    );
  };

  await addEvent("claim", "alpha-claim", GRAY, null, PERSONAL);
  await addEvent("target", null, GRAY, naOrg, `NA incident ${TAG}`);
  await addEvent("direct", "gamma-direct", GRAY, naOrg, `Direct incident ${TAG}`);
  await addEvent("out-claim", "delta-out", OTHER, null, `Outside claim ${TAG}`);
  await addEvent("out-target", null, OTHER, outOrg, `Outside incident ${TAG}`);

  await query("SELECT refresh_graphe_temporal()");
  app = Fastify();
  await app.register(attackPathRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${TAG}-%`]);
  await query("DELETE FROM org WHERE id IN ($1, $2)", [naOrg, outOrg]);
  await query("DELETE FROM source WHERE id IN ($1, $2)", [GRAY, OTHER]);
  await query("SELECT refresh_graphe_temporal()");
  await closePools();
});

const get = async (url: string): Promise<PathResponse> => {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200, res.body);
  return res.json<PathResponse>();
};

test("returns the shortest chain with its ordered intermediaries", async () => {
  const body = await get("/api/attack-path?group=alpha-claim");
  assert.equal(body.found, true);
  assert.equal(body.hops, 4);
  assert.equal(body.path[0], "group:alpha-claim");
  assert.equal(body.path.at(-1), `org:${naOrg}`);
  assert.deepEqual(body.links.map((link) => link.type), [
    "claims", "reported_by", "reported_by", "targeted_by",
  ]);
  assert.equal(body.intermediaries.length, 3);
  assert.ok(body.intermediaries.includes(`source:${GRAY}`));
  assert.ok(body.nodes.some((node) => node.kind === "event"));
  assert.ok(body.tookMs >= 0);
});

test("only Nouvelle-Aquitaine organizations can be reached", async () => {
  const body = await get("/api/attack-path?group=delta-out");
  assert.equal(body.found, false);
  assert.deepEqual(body.path, []);
  assert.deepEqual(body.nodes, []);
  const na = await get("/api/attack-path?group=alpha-claim");
  assert.equal(na.path.at(-1), `org:${naOrg}`);
});

test("honours an explicit target organization", async () => {
  const body = await get(`/api/attack-path?group=alpha-claim&org=org:${naOrg}`);
  assert.equal(body.target, `org:${naOrg}`);
  assert.equal(body.path.at(-1), `org:${naOrg}`);
  for (const org of [outOrg, 999999999]) {
    const res = await app.inject({
      method: "GET",
      url: `/api/attack-path?group=alpha-claim&org=${org}`,
    });
    assert.equal(res.statusCode, 400, res.body);
  }
});

test("prefers a direct attribution over a longer reporting chain", async () => {
  const body = await get("/api/attack-path?group=gamma-direct");
  assert.equal(body.found, true);
  assert.equal(body.hops, 1);
  assert.deepEqual(body.intermediaries, []);
  assert.deepEqual(body.links.map((link) => link.type), ["attributed_to"]);
});

test("never exposes victim personal data", async () => {
  const res = await app.inject({ method: "GET", url: "/api/attack-path?group=alpha-claim" });
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes("Jean Dupont"));
  assert.ok(!res.body.includes("12 rue"));
});

test("does not filter out gray sources", async () => {
  const body = await get("/api/attack-path?group=alpha-claim");
  const source = body.nodes.find((node) => node.id === `source:${GRAY}`);
  assert.ok(source, "gray source missing from the path");
  const props: unknown = source.props;
  assert.ok(props && typeof props === "object" && "family" in props);
  assert.equal(props.family, "leaks");
});

test("rejects invalid query parameters", async () => {
  for (const url of [
    "/api/attack-path",
    "/api/attack-path?group=",
    "/api/attack-path?group=alpha-claim&maxHops=0",
    "/api/attack-path?group=alpha-claim&maxHops=9",
    "/api/attack-path?group=alpha-claim&maxHops=many",
    "/api/attack-path?group=alpha-claim&org=not-an-id",
  ]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 400, url);
  }
});

test("returns an empty result for an unknown group", async () => {
  const body = await get("/api/attack-path?group=group-that-does-not-exist");
  assert.equal(body.found, false);
  assert.equal(body.hops, 0);
  assert.deepEqual(body.links, []);
  assert.deepEqual(body.intermediaries, []);
});

test("respects the maxHops bound", async () => {
  const short = await get("/api/attack-path?group=alpha-claim&maxHops=2");
  assert.equal(short.found, false);
  const enough = await get("/api/attack-path?group=alpha-claim&maxHops=4");
  assert.equal(enough.found, true);
  assert.equal(enough.hops, 4);
});
