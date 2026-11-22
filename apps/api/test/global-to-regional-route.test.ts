/**
 * HTTP behaviour of the global-to-regional early-warning route.
 *
 * The fixtures carry no victim payload: only synthetic ids, timestamps and a
 * regional flag. The route itself projects the same non-personal columns.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import earlyWarningRoute from "../src/routes/early-warning.js";
import { installAccessControl } from "../src/security/rbac.js";

const TAG = `ew${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE_ID = `ew-fixture:${TAG}`;
const CAMPAIGN_KEY = `ew-fixture:${TAG}`;
const EVENT_IDS: number[] = [];

let app: FastifyInstance;

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, kind, format, enabled, interval_sec)
     VALUES ($1, $2, 'ransomware', 'https://example.invalid/ew', 'narrative', 'html', false, 3600)`,
    [SOURCE_ID, `EW fixture ${TAG}`],
  );
  const times = ["2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z"];
  for (const [index, observedAt] of times.entries()) {
    const inserted = await query<{ id: number }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, regional,
                          source_url, evidence)
       VALUES ($1, 'ransomware', 'confirmed_incident', $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
      [
        `ew-fixture-${TAG}-${index}`,
        `Synthetic fixture ${TAG} ${index}`,
        observedAt,
        SOURCE_ID,
        index === 2,
        `https://example.invalid/ew/${TAG}/${index}`,
        JSON.stringify({ run_id: "1" }),
      ],
    );
    EVENT_IDS.push(Number(inserted.rows[0]!.id));
  }
  await query(
    `INSERT INTO campaign (cle, label, family, debut, fin, incidents, taille, confiance, score, preuve)
     VALUES ($1, $2, 'ransomware', $3, $4, $5::bigint[], 3, 'eleve', 3, '{}'::jsonb)`,
    [CAMPAIGN_KEY, "ew-fixture", "2026-11-01T00:00:00Z", "2026-11-03T00:00:00Z", EVENT_IDS],
  );

  app = Fastify({ logger: false });
  installAccessControl(app);
  await app.register(earlyWarningRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM campaign WHERE cle = $1", [CAMPAIGN_KEY]);
  await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [EVENT_IDS]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE_ID]);
  await closePools();
});

test("the public route reports the propagation delay without victim data", async () => {
  const response = await app.inject({ method: "GET", url: "/api/early-warning/global-to-regional?campaigns=1" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.summary.campaigns, 1);
  assert.equal(body.campaigns[0].propagationHours, 48);
  assert.equal(body.campaigns[0].warningLeadHours, 24);
  assert.ok(!response.body.includes("Synthetic fixture"), "no event title in the response");
});

test("the route defaults to ten campaigns when no limit is given", async () => {
  const response = await app.inject({ method: "GET", url: "/api/early-warning/global-to-regional" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().limit, 10);
});

test("falls back to the default when the campaign limit is above the cap", async () => {
  const response = await app.inject({ method: "GET", url: "/api/early-warning/global-to-regional?campaigns=100" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().limit, 10);
});
