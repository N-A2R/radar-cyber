import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import incidentCorroborationRoute from "../src/routes/incident-corroboration.js";

const TAG = `verdict${Date.now().toString(36)}`;
const SOURCES = [`${TAG}-a`, `${TAG}-b`];
const OLD_CLAIM = "2026-11-01T12:00:00.000Z";

function hash(victim: string): string {
  return createHash("sha256").update(`${victim} fr|testgroup`).digest("hex").slice(0, 12);
}

let app: FastifyInstance;
let eventIds: number[] = [];
let orgId: number;

before(async () => {
  for (const sourceId of SOURCES) {
    await query(
      "INSERT INTO source (id, name, family, url, enabled) VALUES ($1,$2,'cti',$3,true)",
      [sourceId, `Source ${sourceId}`, `https://${sourceId}.example.invalid/feed`],
    );
  }
  const org = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, city, dept) VALUES ($1,$2,'entreprise','Bordeaux','33') RETURNING id",
    [`Organisation ${TAG}`, `org-${TAG}`],
  );
  orgId = Number(org.rows[0].id);

  const claimAt = new Date().toISOString();
  const inserted = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity,
                        confidence, source_id, source_url, org_id, regional, evidence)
     VALUES ($1,'ransomware','third_party_claim',$2,$3,3,'A1',$4,$5,$6,false,$7::jsonb),
            ($8,'ransomware','third_party_claim',$2,$3,3,'B2',$9,$10,$6,false,$7::jsonb),
            ($11,'ransomware','third_party_claim',$12,$13,3,'A1',$4,$5,$6,false,$14::jsonb)
     RETURNING id`,
    [
      `${TAG}:1`, `Incident ${TAG}`, claimAt, SOURCES[0], `https://${SOURCES[0]}.example.invalid/v`, orgId,
      JSON.stringify({ group: "testgroup", org_hint: `${TAG}.fr`, claimed_at: claimAt }),
      `${TAG}:2`, SOURCES[1], `https://${SOURCES[1]}.example.invalid/v`,
      `${TAG}:3`, `Incident ancien ${TAG}`, OLD_CLAIM,
      JSON.stringify({ group: "testgroup", org_hint: `${TAG}old.fr`, claimed_at: OLD_CLAIM }),
    ],
  );
  eventIds = inserted.rows.map((row) => Number(row.id));

  app = Fastify({ logger: false });
  await app.register(incidentCorroborationRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (eventIds.length > 0) {
    await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [eventIds]);
  }
  await query("DELETE FROM org WHERE id = $1", [orgId]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCES]);
  await closePools();
});

test("the route exposes one privacy-safe verdict per incident", async () => {
  const res = await app.inject({ method: "GET", url: "/api/incident-corroboration/verdicts" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.delayHours, 48);

  const byHash = new Map<string, { verdict: string; publishers: number }>(
    body.incidents.map((item: { victimHash: string; verdict: string; publishers: number }) =>
      [item.victimHash, item]),
  );
  assert.equal(byHash.get(hash(TAG))?.verdict, "second_source");
  assert.equal(byHash.get(hash(TAG))?.publishers, 2);
  assert.equal(byHash.get(hash(`${TAG}old`))?.verdict, "after_delay");

  const raw = JSON.stringify(body);
  assert.equal(raw.includes(`Incident ${TAG}`), false);
  assert.equal(raw.includes("example.invalid"), false);
});
