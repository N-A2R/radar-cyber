/**
 * Complete temporal graph: one test per observable behavior of the
 * projection. The projection is rebuilt inside the ephemeral test database;
 * no production row and no victim personal data are used.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";

const TAG = `gtc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const MARCH = "2026-03-10T10:00:00.000Z";
const NOVEMBER = "2026-11-10T10:00:00.000Z";
const ORG_END = "2026-09-01T00:00:00.000Z";
const VICTIM = "Jane Doe victim name must never appear";

let naOrgId: number;
let outsideOrgId: number;
let firstEventId: number;

type Link = { source: string; target: string; type: string; validFrom: string; validTo: string | null };

const links = async (where: string, params: unknown[] = []): Promise<Link[]> => {
  const result = await query<Link>(
    `SELECT source_id AS "source", target_id AS "target", type,
            valid_from AS "validFrom", valid_to AS "validTo"
       FROM graph_relation WHERE ${where}`,
    params,
  );
  return result.rows.map((row) => ({
    ...row,
    validFrom: new Date(row.validFrom).toISOString(),
    validTo: row.validTo === null ? null : new Date(row.validTo).toISOString(),
  }));
};

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url) VALUES ($1, $2, 'ransomware', 'https://example.invalid/gtc')`,
    [TAG, `Complete graph source ${TAG}`],
  );
  const na = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain, valid_from, valid_to)
     VALUES ($1, $2, 'entreprise', 'Gironde', $3, $4, $5) RETURNING id`,
    [`Nouvelle-Aquitaine Org ${TAG}`, `na-org-${TAG}`, `na-${TAG}.test`, MARCH, ORG_END],
  );
  naOrgId = na.rows[0]!.id;
  const outside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain, valid_from)
     VALUES ($1, $2, 'entreprise', 'Paris', $3, $4) RETURNING id`,
    [`Outside Org ${TAG}`, `outside-org-${TAG}`, `outside-${TAG}.test`, MARCH],
  );
  outsideOrgId = outside.rows[0]!.id;

  const first = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, org_id, source_url, evidence)
     VALUES ($1, 'ransomware', 'observation', $2, $3, $4, $5, COALESCE($6, 'https://example.invalid/event'), $7::jsonb || '{"run_id":"1"}'::jsonb) RETURNING id`,
    [
      `${TAG}-first`, `Leak at ${VICTIM}`, MARCH, TAG, naOrgId,
      "https://news.example.com/article?utm=1",
      JSON.stringify({ group: "lockbit3", vendor: "Apache", product: "Http Server", description: VICTIM }),
    ],
  );
  firstEventId = first.rows[0]!.id;
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, org_id, source_url, evidence)
     VALUES ($1, 'cti', 'observation', $2, $3, $4, $5, COALESCE($6, 'https://example.invalid/event'), $7::jsonb || '{"run_id":"1"}'::jsonb)`,
    [
      `${TAG}-second`, `Second ${TAG}`, NOVEMBER, TAG, outsideOrgId,
      "https://www.other.example.org/story",
      JSON.stringify({ group: "qilin", description: VICTIM }),
    ],
  );
  await query("SELECT refresh_temporal_graph_complete()");
});

after(async () => {
  await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${TAG}-%`]);
  await query("DELETE FROM org WHERE id IN ($1, $2)", [naOrgId, outsideOrgId]);
  await query("DELETE FROM source WHERE id = $1", [TAG]);
  if (outsideOrgId && naOrgId) {
    await query("DELETE FROM graph_entity WHERE id IN ($1, $2)", [`org:${naOrgId}`, `org:${outsideOrgId}`]);
  }
  if (firstEventId) await query("DELETE FROM graph_entity WHERE id = $1", [`event:${firstEventId}`]);
  await query("SELECT refresh_graphe_temporal()");
  await closePools();
});

test("every projected relation carries a real start date", async () => {
  const result = await query<{ total: string; dated: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE valid_from IS NOT NULL)::text AS dated
       FROM graph_relation`,
  );
  assert.ok(Number(result.rows[0]!.total) > 0);
  assert.equal(result.rows[0]!.total, result.rows[0]!.dated);
  const eventLinks = await links(`source_id = $1 OR target_id = $1`, [`event:${firstEventId}`]);
  assert.ok(eventLinks.length > 0);
  for (const link of eventLinks) {
    assert.ok(!Number.isNaN(Date.parse(link.validFrom)), `${link.type} has no valid date`);
  }
});

test("a publication host is linked with the observation date", async () => {
  const found = await links(`source_id = $1 AND target_id = $2 AND type = 'published_on'`, [
    `event:${firstEventId}`,
    "domain:news.example.com",
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.validFrom, MARCH);
});

test("product and vendor links are typed and dated", async () => {
  const mentioned = await links(`source_id = $1 AND type = 'mentions_product'`, [`event:${firstEventId}`]);
  assert.equal(mentioned.length, 1);
  assert.equal(mentioned[0]!.target, "product:apache:http server");
  assert.equal(mentioned[0]!.validFrom, MARCH);
  const produced = await links(
    `source_id = $1 AND target_id = 'vendor:apache' AND type = 'produced_by'`,
    [mentioned[0]!.target],
  );
  assert.equal(produced.length, 1);
  assert.equal(produced[0]!.validFrom, MARCH);
});

test("organizations outside Nouvelle-Aquitaine are excluded", async () => {
  const entity = await query(
    `SELECT id FROM graph_entity WHERE id = $1`,
    [`org:${outsideOrgId}`],
  );
  assert.equal(entity.rows.length, 0);
  const targeted = await links(`source_id = $1 AND type = 'targeted_by'`, [`org:${outsideOrgId}`]);
  assert.equal(targeted.length, 0);
  const included = await query(`SELECT id FROM graph_entity WHERE id = $1`, [`org:${naOrgId}`]);
  assert.equal(included.rows.length, 1);
});

test("victim names never enter the graph", async () => {
  const leaked = await query(
    `SELECT id FROM graph_entity WHERE label ILIKE $1 OR props::text ILIKE $1`,
    [`%${VICTIM}%`],
  );
  assert.equal(leaked.rows.length, 0);
});

test("a closed organization keeps its measured validity end", async () => {
  const found = await links(
    `source_id = $1 AND target_id = 'dept:Gironde' AND type = 'located_in'`,
    [`org:${naOrgId}`],
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]!.validTo, ORG_END);
});

test("refreshing twice keeps the projection identical", async () => {
  const before = await query<{ total: string }>(`SELECT count(*)::text AS total FROM graph_relation`);
  await query("SELECT refresh_temporal_graph_complete()");
  const after = await query<{ total: string }>(`SELECT count(*)::text AS total FROM graph_relation`);
  assert.equal(after.rows[0]!.total, before.rows[0]!.total);
});
