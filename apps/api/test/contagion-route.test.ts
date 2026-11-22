/** The contagion endpoint is readable, English and publishes no victim label. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { query } from "../src/db.js";

let app: FastifyInstance;

before(async () => {
  await query(
    `INSERT INTO org (name, slug, kind, sector, city, dept, status)
     VALUES ('CONTAGION ROUTE ORG', 'contagion-route-org', 'entreprise', 'services', 'Bordeaux', '33', 'confirme')
     ON CONFLICT (slug) DO NOTHING`,
  );
  await query(
    `INSERT INTO leak_claim (fingerprint, source, site_slug, group_name, victim, published_at, org_id, na)
     SELECT 'contagion-route-claim', 'grey', 'route-site', 'route-group',
            'PRIVATE ROUTE VICTIM LABEL', '2026-08-10T00:00:00Z', o.id, true
       FROM org o WHERE o.slug = 'contagion-route-org'
     ON CONFLICT (fingerprint) DO NOTHING`,
  );
  app = await buildApp();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM leak_claim WHERE fingerprint = 'contagion-route-claim'");
  await query("DELETE FROM org WHERE slug = 'contagion-route-org'");
});

test("GET /contagion/exposures returns the 30-day exposure list", async () => {
  const response = await app.inject({ method: "GET", url: "/api/contagion/exposures?asOf=2026-08-01" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{ seedCount: number; windowDays: number; exposures: Array<{ name: string }> }>();
  assert.equal(body.windowDays, 30);
  assert.ok(body.exposures.some((e) => e.name === "CONTAGION ROUTE ORG"));
});

test("the endpoint rejects a malformed asOf instead of guessing a date", async () => {
  const response = await app.inject({ method: "GET", url: "/api/contagion/exposures?asOf=not-a-day" });
  assert.equal(response.statusCode, 400);
});

test("raw victim labels are not present in the HTTP response", async () => {
  const response = await app.inject({ method: "GET", url: "/api/contagion/exposures?asOf=2026-08-01" });
  assert.equal(response.body.includes("PRIVATE ROUTE VICTIM LABEL"), false);
});
