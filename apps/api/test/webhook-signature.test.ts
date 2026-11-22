/**
 * Behavior tests for signed alert webhooks. Each test covers one observable
 * behavior: client verification, tampering, replay window, fail-closed setup
 * and environment configuration. No external service or production data.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import http from "node:http";
import { after, test, type TestContext } from "node:test";
import { closePools, query } from "../src/db.js";
import { deliverPendingAlerts, readDeliveryConfig } from "../src/notify/alert-delivery.js";
import { signWebhookBody, verifyWebhookSignature } from "../src/notify/webhook-signature.js";

const SECRET = "integration-test-webhook-secret";
const SIGNATURE_HEADER = "x-radar-signature";
const TIMESTAMP_HEADER = "x-radar-timestamp";

type Hit = { raw: string; headers: http.IncomingHttpHeaders };

async function makeFixture(): Promise<{ alertId: number; cleanup: () => Promise<void> }> {
  const key = `signed-webhook-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, status)
     VALUES ($1,$2,'entreprise','Bordeaux','33','confirme') RETURNING id`,
    [`Organization ${key}`, key],
  );
  const orgId = Number(org.rows[0]?.id);
  const event = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, org_id, tlp, regional)
     VALUES ($1,'cti','confirmed_incident',$2,4,'ransomlook',$3,'AMBER',true) RETURNING id`,
    [`${key}-event`, `Incident ${key}`, orgId],
  );
  const eventId = Number(event.rows[0]?.id);
  const alert = await query<{ id: number }>(
    `INSERT INTO alert (rule_id, title, severity, status, org_id, event_id, scope)
     VALUES ($1,$2,4,'open',$3,$4,'organization_incident') RETURNING id`,
    [key, `Alert ${key}`, orgId, eventId],
  );
  const alertId = Number(alert.rows[0]?.id);
  return {
    alertId,
    cleanup: async () => {
      await query("DELETE FROM alert WHERE id = $1", [alertId]);
      await query("DELETE FROM event WHERE id = $1", [eventId]);
      await query("DELETE FROM org WHERE id = $1", [orgId]);
    },
  };
}

async function startCapture(): Promise<{ port: number; hits: Hit[]; close: () => Promise<void> }> {
  const hits: Hit[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      hits.push({ raw: Buffer.concat(chunks).toString("utf8"), headers: req.headers });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  const ready = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", ready.resolve);
  await ready.promise;
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    port: address.port,
    hits,
    close: async () => {
      const done = Promise.withResolvers<void>();
      server.close(() => done.resolve());
      await done.promise;
    },
  };
}

function findHit(hits: Hit[], alertId: number): Hit {
  const hit = hits.find((entry) => {
    const parsed: unknown = JSON.parse(entry.raw);
    return typeof parsed === "object" && parsed !== null && "alert" in parsed
      && typeof parsed.alert === "object" && parsed.alert !== null && "id" in parsed.alert
      && parsed.alert.id === alertId;
  });
  assert.ok(hit, "the webhook was received");
  return hit;
}

/** Independent client implementation: no code from the signing module. */
function clientSignature(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

after(async () => {
  await closePools();
});

test("client verifies the delivered signature over the exact raw body", async (t: TestContext) => {
  const fixture = await makeFixture();
  t.after(fixture.cleanup);
  const server = await startCapture();
  t.after(server.close);

  const result = await deliverPendingAlerts(() => undefined, {
    cfg: { webhookUrl: `http://127.0.0.1:${server.port}/hook`, webhookSecret: SECRET },
    limit: 1000,
  });
  assert.ok(result.delivered >= 1);

  const hit = findHit(server.hits, fixture.alertId);
  const timestamp = String(hit.headers[TIMESTAMP_HEADER]);
  assert.equal(hit.headers["content-type"], "application/json");
  assert.equal(hit.headers[SIGNATURE_HEADER], clientSignature(SECRET, timestamp, hit.raw));
  assert.ok(Math.abs(Date.now() / 1000 - Number(timestamp)) <= 60, "timestamp is inside the replay window");
});

test("an altered payload is rejected by the client verifier", async (t: TestContext) => {
  const fixture = await makeFixture();
  t.after(fixture.cleanup);
  const server = await startCapture();
  t.after(server.close);

  await deliverPendingAlerts(() => undefined, {
    cfg: { webhookUrl: `http://127.0.0.1:${server.port}/hook`, webhookSecret: SECRET },
    limit: 1000,
  });
  const hit = findHit(server.hits, fixture.alertId);
  const signature = String(hit.headers[SIGNATURE_HEADER]);
  const timestamp = String(hit.headers[TIMESTAMP_HEADER]);
  const parsed: unknown = JSON.parse(hit.raw);
  assert.ok(parsed && typeof parsed === "object" && "alert" in parsed);
  const originalAlert = parsed.alert;
  assert.ok(originalAlert && typeof originalAlert === "object" && "severity" in originalAlert);
  const alteredBody = JSON.stringify({ ...parsed, alert: { ...originalAlert, severity: 5 } });

  assert.equal(verifyWebhookSignature({ secret: SECRET, rawBody: hit.raw, signature, timestamp }), true);
  assert.notEqual(clientSignature(SECRET, timestamp, alteredBody), signature);
  assert.equal(verifyWebhookSignature({ secret: SECRET, rawBody: alteredBody, signature, timestamp }), false);
});

test("a signature outside the freshness window is rejected", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const timestamp = Math.floor(now.getTime() / 1000) - 600;
  const rawBody = '{"type":"radar.alert"}';
  const signature = signWebhookBody(SECRET, rawBody, timestamp);

  assert.equal(verifyWebhookSignature({ secret: SECRET, rawBody, signature, timestamp: String(timestamp), now }), false);
  assert.equal(
    verifyWebhookSignature({ secret: SECRET, rawBody, signature, timestamp: String(timestamp), now: new Date(timestamp * 1000) }),
    true,
  );
});

test("a configured webhook without a signing secret sends nothing", async (t: TestContext) => {
  const fixture = await makeFixture();
  t.after(fixture.cleanup);
  const server = await startCapture();
  t.after(server.close);

  const result = await deliverPendingAlerts(() => undefined, {
    cfg: { webhookUrl: `http://127.0.0.1:${server.port}/hook` },
    limit: 1000,
  });
  assert.ok(result.failed >= 1);
  assert.equal(server.hits.length, 0);
  const row = await query<{ last_error: string | null; webhook_delivered_at: Date | null }>(
    "SELECT last_error, webhook_delivered_at FROM alert WHERE id = $1",
    [fixture.alertId],
  );
  assert.match(row.rows[0]?.last_error ?? "", /signing secret is not configured/);
  assert.equal(row.rows[0]?.webhook_delivered_at, null);
});

test("the signing secret is read from the environment", () => {
  const url = "https://hooks.example.invalid/radar";
  const configured = readDeliveryConfig({ RADAR_ALERT_WEBHOOK_URL: url, RADAR_ALERT_WEBHOOK_SECRET: "  env-secret  " });
  assert.equal(configured.webhookSecret, "env-secret");
  assert.equal(readDeliveryConfig({ RADAR_ALERT_WEBHOOK_URL: url }).webhookSecret, undefined);
});
