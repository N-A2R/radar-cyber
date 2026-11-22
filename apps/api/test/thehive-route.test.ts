/**
 * End-to-end case creation through the API.
 *
 * A real alert is read from the isolated test database, and the case is really
 * POSTed over HTTP to a local TheHive-compatible test double. No victim name
 * from the event title may appear in the case sent to TheHive.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { installErrorHandler } from "../src/errors.js";
import thehiveRoute from "../src/routes/thehive.js";

const TAG = `th${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const VICTIM_NAME = `Victime ${TAG}`;

let app: FastifyInstance;
let server: Server;
let caseId: number;
let alertId: number;
let eventId: number;
let orgId: number;
let baseUrl: string;
const received: Array<{ headers: Record<string, unknown>; body: Record<string, unknown> }> = [];
const previousUrl = process.env.RADAR_THEHIVE_URL;
const previousKey = process.env.RADAR_THEHIVE_API_KEY;

before(async () => {
  server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/api/case") {
      res.writeHead(404).end("not found");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        headers: req.headers as Record<string, unknown>,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
      });
      res.writeHead(201, { "content-type": "application/json" })
        .end(JSON.stringify({ id: `case-${received.length}` }));
    });
  });
  const ready = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", ready.resolve);
  await ready.promise;
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no local port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.RADAR_THEHIVE_URL = baseUrl;
  process.env.RADAR_THEHIVE_API_KEY = "route-test-key";

  await query(
    "INSERT INTO source (id, name, family, url, retain_raw) VALUES ($1,$2,'ransomware',$3,false)",
    [SOURCE, `${TAG} gray mirror`, `https://example.invalid/${TAG}`],
  );
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, domain, status, dept)
     VALUES ($1,$2,'entreprise','Bordeaux',$3,'confirme','33') RETURNING id`,
    [`${TAG} SARL`, `${TAG}-org`, `${TAG}.example`],
  );
  orgId = Number(org.rows[0]?.id);
  const event = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, source_url, org_id, regional, tlp, evidence)
     VALUES ($1,'ransomware','third_party_claim',$2,now(),$3,$4,$5,true,'CLEAR',$6::jsonb) RETURNING id`,
    [
      `thehive-route:${TAG}`,
      `${VICTIM_NAME} - rançongiciel`,
      SOURCE,
      `https://example.invalid/${TAG}/claim`,
      orgId,
      JSON.stringify({ run_id: "1" }),
    ],
  );
  eventId = Number(event.rows[0]?.id);
  // Le trigger victim_alert_on_event crée déjà une alerte pour cette
  // revendication ; ce test isole l'alerte qu'il déclare lui-même.
  await query("DELETE FROM alert WHERE event_id=$1", [eventId]);
  const alert = await query<{ id: number }>(
    `INSERT INTO alert (rule_id, title, severity, status, event_id, org_id, scope)
     VALUES ('ransomware-claim','alert',4,'open',$1,$2,'organization_incident') RETURNING id`,
    [eventId, orgId],
  );
  alertId = Number(alert.rows[0]?.id);
  caseId = alertId;

  app = Fastify({ logger: false });
  installErrorHandler(app);
  await app.register(thehiveRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (server) {
    server.closeAllConnections();
    const closed = Promise.withResolvers<void>();
    server.close(() => closed.resolve());
    await closed.promise;
  }
  if (eventId) {
    await query("DELETE FROM alert WHERE event_id=$1", [eventId]);
    await query("DELETE FROM event WHERE id=$1", [eventId]);
  }
  if (SOURCE) await query("DELETE FROM source WHERE id=$1", [SOURCE]);
  if (previousUrl === undefined) delete process.env.RADAR_THEHIVE_URL;
  else process.env.RADAR_THEHIVE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.RADAR_THEHIVE_API_KEY;
  else process.env.RADAR_THEHIVE_API_KEY = previousKey;
  await closePools();
});

test("creates a case in TheHive from a live API request", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/thehive/cases",
    payload: { dryRun: false, limit: 500 },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json<{
    mode: string;
    created: number;
    cases: Array<{ alertId: number; caseId: string; externalRef: string }>;
  }>();
  assert.equal(body.mode, "live");
  assert.equal(body.created, 1);
  assert.equal(body.cases[0]?.alertId, caseId);
  assert.equal(body.cases[0]?.caseId, "case-1");
  assert.equal(received.length, 1);
  assert.equal(received[0]?.headers.authorization, "Bearer route-test-key");
  assert.equal(received[0]?.body.externalRef, `radar-cyber:alert:${caseId}`);
  assert.doesNotMatch(JSON.stringify(received[0]?.body), new RegExp(VICTIM_NAME));
  assert.equal(alertId, caseId);
});

test("dry run plans a case without any outbound request", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/thehive/cases",
    payload: { dryRun: true, limit: 500 },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json<{ mode: string; planned: number; cases: unknown[] }>();
  assert.equal(body.mode, "dry-run");
  assert.equal(body.planned, 1);
  assert.equal(body.cases.length, 1);
  assert.equal(received.length, 1, "no additional TheHive request");
});
