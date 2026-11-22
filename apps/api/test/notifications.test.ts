/**
 * Behavior tests for the three external notification channels:
 * webhook, email (local SMTP) and RSS. No external service and no production
 * data: every row is created here and removed after its test.
 */
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { after, test, type TestContext } from "node:test";
import Fastify from "fastify";
import { XMLParser } from "fast-xml-parser";
import { closePools, query } from "../src/db.js";
import { installErrorHandler } from "../src/errors.js";
import {
  buildDeliveryMessage,
  deliverPendingAlerts,
  isDeliveryConfigured,
  readDeliveryConfig,
} from "../src/notify/alert-delivery.js";
import { fetchNotificationAlerts } from "../src/notify/notification-alerts.js";
import { buildNotificationMessage, buildRssFeed, sanitizeText } from "../src/notify/notification-content.js";
import { sendSmtpEmail } from "../src/notify/smtp.js";
import alertsRssRoute from "../src/routes/alerts-rss.js";
import { installAccessControl } from "../src/security/rbac.js";

let sequence = 0;
const slug = (): string => `notification-test-${Date.now()}-${sequence++}`;

type Fixture = {
  alertId: number;
  eventId: number | null;
  orgId: number;
  cleanup: () => Promise<void>;
};

async function makeFixture(options: {
  dept?: string;
  tlp?: string;
  title?: string;
  orgName?: string;
  scope?: string;
} = {}): Promise<Fixture> {
  const key = slug();
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, status)
     VALUES ($1,$2,'entreprise','Bordeaux',$3,'confirme') RETURNING id`,
    [options.orgName ?? `Organisation ${key}`, key, options.dept ?? "33"],
  );
  const orgId = Number(org.rows[0]?.id);
  const eventKey = `${key}-event`;
  const event = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, org_id, tlp, regional)
     VALUES ($1,'cti','confirmed_incident',$2,4,'ransomlook',$3,$4,true) RETURNING id`,
    [eventKey, options.title ?? `Incident ${key}`, orgId, options.tlp ?? "AMBER"],
  );
  const eventId = Number(event.rows[0]?.id);
  const alert = await query<{ id: number }>(
    `INSERT INTO alert (rule_id, title, severity, status, org_id, event_id, scope)
     VALUES ($1,$2,4,'open',$3,$4,$5) RETURNING id`,
    [key, options.title ?? `Alerte ${key}`, orgId, eventId, options.scope ?? "organization_incident"],
  );
  const alertId = Number(alert.rows[0]?.id);
  return {
    alertId,
    eventId,
    orgId,
    cleanup: async () => {
      await query("DELETE FROM alert WHERE id = $1", [alertId]);
      await query("DELETE FROM event WHERE id = $1", [eventId]);
      await query("DELETE FROM org WHERE id = $1", [orgId]);
    },
  };
}

type WebhookHit = { headers: http.IncomingHttpHeaders; body: Record<string, unknown> };

async function startWebhookServer(status: number): Promise<{
  port: number;
  hits: WebhookHit[];
  close: () => Promise<void>;
}> {
  const hits: WebhookHit[] = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk.toString("utf8");
    hits.push({ headers: req.headers, body: JSON.parse(raw) as Record<string, unknown> });
    res.writeHead(status, { "content-type": "application/json" });
    res.end("{}");
  });
  const ready = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", ready.resolve);
  await ready.promise;
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    hits,
    close: async () => {
      const done = Promise.withResolvers<void>();
      server.close(() => done.resolve());
      await done.promise;
    },
  };
}

type SmtpCapture = { commands: string[]; body: string };

async function startSmtpServer(): Promise<{
  port: number;
  capture: SmtpCapture;
  close: () => Promise<void>;
}> {
  const capture: SmtpCapture = { commands: [], body: "" };
  const server = net.createServer((socket) => {
    socket.write("220 test.local ESMTP\r\n");
    let inData = false;
    let data = "";
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (inData) {
        data += text;
        if (data.includes("\r\n.\r\n")) {
          capture.body = data;
          inData = false;
          socket.write("250 message accepted\r\n");
        }
        return;
      }
      for (const line of text.split("\r\n").filter(Boolean)) {
        capture.commands.push(line);
        if (/^(EHLO|HELO)\b/.test(line)) socket.write("250 test.local\r\n");
        else if (/^(MAIL FROM|RCPT TO)\b/.test(line)) socket.write("250 OK\r\n");
        else if (line === "DATA") {
          inData = true;
          socket.write("354 send data\r\n");
        } else if (line === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 OK\r\n");
      }
    });
  });
  const ready = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", ready.resolve);
  await ready.promise;
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    capture,
    close: async () => {
      const done = Promise.withResolvers<void>();
      server.close(() => done.resolve());
      await done.promise;
    },
  };
}

after(async () => {
  await closePools();
});

test("webhook receives a structured JSON payload and records channel delivery", async (t: TestContext) => {
  const fixture = await makeFixture({ orgName: "Hôpital M. Dupont contact@hopital.fr" });
  t.after(fixture.cleanup);
  const server = await startWebhookServer(200);
  t.after(server.close);

  const result = await deliverPendingAlerts(() => undefined, {
    cfg: { webhookUrl: `http://127.0.0.1:${server.port}/hook` },
    limit: 1000,
  });
  assert.ok(result.delivered >= 1);
  const hit = server.hits.find((entry) => (entry.body.alert as Record<string, unknown>)?.id === fixture.alertId);
  assert.ok(hit, "the webhook received this alert");
  assert.equal(hit.headers["content-type"], "application/json");
  const payload = JSON.stringify(hit.body);
  assert.ok(!payload.includes("Dupont"), "no victim name in the webhook payload");
  assert.ok(!payload.includes("contact@hopital.fr"), "no personal email in the webhook payload");
  assert.match(payload, /Nouvelle-Aquitaine/);

  const row = await query<{ webhook_delivered_at: Date | null; delivered_at: Date | null }>(
    "SELECT webhook_delivered_at, delivered_at FROM alert WHERE id = $1",
    [fixture.alertId],
  );
  assert.ok(row.rows[0]?.webhook_delivered_at, "webhook channel timestamp written");
  assert.ok(row.rows[0]?.delivered_at, "alert marked delivered");
});

test("a failing webhook is retried later and never marked delivered", async (t: TestContext) => {
  const fixture = await makeFixture();
  t.after(fixture.cleanup);
  const server = await startWebhookServer(500);
  t.after(server.close);

  const result = await deliverPendingAlerts(() => undefined, {
    cfg: { webhookUrl: `http://127.0.0.1:${server.port}/hook` },
    limit: 1000,
  });
  assert.ok(result.failed >= 1);
  const row = await query<{ attempts: number; delivered_at: Date | null; last_error: string | null; next_attempt_at: Date | null }>(
    "SELECT attempts, delivered_at, last_error, next_attempt_at FROM alert WHERE id = $1",
    [fixture.alertId],
  );
  assert.equal(row.rows[0]?.attempts, 1);
  assert.equal(row.rows[0]?.delivered_at, null);
  assert.match(row.rows[0]?.last_error ?? "", /webhook HTTP 500/);
  assert.ok(row.rows[0]?.next_attempt_at, "a retry is scheduled");
});

test("email is delivered through a local SMTP server without personal data", async (t: TestContext) => {
  const fixture = await makeFixture({
    orgName: "CHU M. Martin martin@chu.example",
    title: "Victime Jean Dupont 06 12 34 56 78",
  });
  t.after(fixture.cleanup);
  const server = await startSmtpServer();
  t.after(server.close);

  const result = await deliverPendingAlerts(() => undefined, {
    cfg: {
      emailHost: "127.0.0.1",
      emailPort: server.port,
      emailFrom: "radar@example.invalid",
      emailTo: "ops@example.invalid",
    },
    limit: 1000,
  });
  assert.ok(result.delivered >= 1);
  assert.ok(server.capture.commands.some((line) => line === "MAIL FROM:<radar@example.invalid>"));
  assert.ok(server.capture.commands.some((line) => line === "RCPT TO:<ops@example.invalid>"));
  assert.match(server.capture.body, /Subject: \[Radar Cyber\] Nouvelle-Aquitaine alert/);
  assert.ok(!server.capture.body.includes("Dupont"), "no victim name in the email");
  assert.ok(!server.capture.body.includes("06 12 34 56 78"), "no phone number in the email");
  assert.ok(!server.capture.body.includes("martin@chu.example"), "no personal email in the email");

  const row = await query<{ email_delivered_at: Date | null; delivered_at: Date | null }>(
    "SELECT email_delivered_at, delivered_at FROM alert WHERE id = $1",
    [fixture.alertId],
  );
  assert.ok(row.rows[0]?.email_delivered_at, "email channel timestamp written");
  assert.ok(row.rows[0]?.delivered_at, "alert marked delivered");
});

test("an unreachable SMTP server is recorded as a failed email attempt", async (t: TestContext) => {
  const fixture = await makeFixture();
  t.after(fixture.cleanup);

  const result = await deliverPendingAlerts(() => undefined, {
    cfg: {
      emailHost: "127.0.0.1",
      emailPort: 1,
      emailFrom: "radar@example.invalid",
      emailTo: "ops@example.invalid",
      timeoutMs: 2000,
    },
    limit: 1000,
  });
  assert.ok(result.failed >= 1);
  const row = await query<{ attempts: number; last_error: string | null; email_delivered_at: Date | null }>(
    "SELECT attempts, last_error, email_delivered_at FROM alert WHERE id = $1",
    [fixture.alertId],
  );
  assert.equal(row.rows[0]?.attempts, 1);
  assert.match(row.rows[0]?.last_error ?? "", /SMTP|connect|ECONNREFUSED/i);
  assert.equal(row.rows[0]?.email_delivered_at, null);
});

test("RSS contains only Nouvelle-Aquitaine alerts and no personal data", async (t: TestContext) => {
  const inside = await makeFixture({ title: "Incident Mme Durand durand@example.fr" });
  t.after(inside.cleanup);
  const outside = await makeFixture({ dept: "75", title: "Incident hors région" });
  t.after(outside.cleanup);

  const alerts = await fetchNotificationAlerts({ pendingOnly: false, limit: 1000 });
  const ids = alerts.map((alert) => alert.id);
  assert.ok(ids.includes(inside.alertId), "regional alert is eligible");
  assert.ok(!ids.includes(outside.alertId), "alert outside Nouvelle-Aquitaine is filtered out");

  const xml = buildRssFeed(alerts, { generatedAt: new Date("2026-11-22T00:00:00Z") });
  assert.match(xml, /<language>en<\/language>/);
  assert.match(xml, /Radar Cyber - Nouvelle-Aquitaine alerts/);
  assert.match(xml, new RegExp(`radar-alert-${inside.alertId}`));
  assert.ok(!xml.includes(`radar-alert-${outside.alertId}`), "outside alert absent from the feed");
  assert.ok(!xml.includes("Durand"), "no victim name in the feed");
  assert.ok(!xml.includes("durand@example.fr"), "no personal email in the feed");
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml) as {
    rss?: { channel?: { item?: unknown[] } };
  };
  const items = parsed.rss?.channel?.item;
  const itemList = Array.isArray(items) ? items : [items];
  assert.ok(itemList.length >= 1 && itemList.every((item) => item !== undefined), "feed is valid XML with items");
});

test("TLP:RED and review-scope alerts never enter a notification channel", async (t: TestContext) => {
  const red = await makeFixture({ tlp: "RED", title: "Incident confidentiel" });
  t.after(red.cleanup);
  const review = await makeFixture({ scope: "rupture-revue", title: "Rupture en revue" });
  t.after(review.cleanup);

  const pending = await fetchNotificationAlerts({ pendingOnly: true, limit: 1000 });
  const feed = await fetchNotificationAlerts({ pendingOnly: false, limit: 1000 });
  for (const fixture of [red, review]) {
    assert.ok(!pending.some((alert) => alert.id === fixture.alertId), "excluded from the delivery queue");
    assert.ok(!feed.some((alert) => alert.id === fixture.alertId), "excluded from the public feed");
  }
});

test("the RSS route is public, returns XML and cannot leak free text", async (t: TestContext) => {
  const fixture = await makeFixture({ title: "Victime M. Dupont" });
  t.after(fixture.cleanup);
  const app = Fastify({ logger: false });
  installErrorHandler(app);
  installAccessControl(app);
  await app.register(alertsRssRoute, { prefix: "/api" });
  await app.ready();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({ method: "GET", url: "/api/alerts/rss.xml" });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /application\/rss\+xml/);
  assert.match(response.body, /<rss version="2.0">/);
  assert.ok(!response.body.includes("Dupont"));
});

test("shared message builder emits English structured labels only", () => {
  const alert = {
    id: 42,
    severity: 4,
    status: "open",
    created_at: new Date("2026-11-22T12:00:00Z"),
    attempts: 0,
    org_name: "Entreprise & Fils <test>",
    org_dept: "33",
    source_name: "Presse NA",
    source_url: "https://example.invalid/story?token=secret#part",
  };
  const message = buildNotificationMessage(alert, "https://radar.example.invalid/");
  assert.equal(message.subject, "[Radar Cyber] Nouvelle-Aquitaine alert #42 - severity high");
  assert.equal(message.payload.alert && (message.payload.alert as Record<string, unknown>).title, undefined);
  assert.match(message.text, /Organization: Entreprise & Fils test/);
  assert.equal((message.payload.alert as Record<string, unknown>).link, "https://example.invalid/story");

  const webhookMessage = buildDeliveryMessage(
    { ...alert, title: "Titre confidentiel", event_title: "Titre victime" },
    { webBaseUrl: "https://radar.example.invalid" },
  );
  assert.ok(!JSON.stringify(webhookMessage).includes("confidentiel"));
  assert.ok(!JSON.stringify(webhookMessage).includes("victime"));
});

test("configuration enables delivery only with complete channel settings", () => {
  const empty = readDeliveryConfig({});
  assert.equal(isDeliveryConfigured(empty), false);
  const webhook = readDeliveryConfig({ RADAR_ALERT_WEBHOOK_URL: "https://hooks.example.invalid/radar" });
  assert.equal(isDeliveryConfigured(webhook), true);
  const email = readDeliveryConfig({
    RADAR_ALERT_EMAIL_HOST: "127.0.0.1",
    RADAR_ALERT_EMAIL_FROM: "radar@example.invalid",
    RADAR_ALERT_EMAIL_TO: "ops@example.invalid",
    RADAR_ALERT_EMAIL_PORT: "2525",
    RADAR_ALERT_EMAIL_SECURE: "true",
  });
  assert.equal(isDeliveryConfigured(email), true);
  assert.equal(email.emailPort, 2525);
  assert.equal(email.emailSecure, true);
});

test("sanitizeText removes emails, phones and honorific names", () => {
  const cleaned = sanitizeText("M. Dupont m.dupont@example.fr 06 12 34 56 78");
  assert.ok(!cleaned.includes("Dupont"));
  assert.ok(!cleaned.includes("example.fr"));
  assert.ok(!cleaned.includes("06 12 34 56 78"));
});

test("sendSmtpEmail rejects addresses that could inject SMTP headers", async () => {
  await assert.rejects(
    sendSmtpEmail(
      { host: "127.0.0.1", port: 25, from: "bad\r\nBCC: victim@example.invalid", to: "ops@example.invalid" },
      "subject",
      "body",
    ),
    /invalid SMTP address/,
  );
});
