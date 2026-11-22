/**
 * Reproducible measurement of client-verifiable webhook signatures.
 *
 *   DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-webhook-signatures.mts
 *
 * The database is only read: real Nouvelle-Aquitaine alerts are selected with
 * the delivery selector, serialized with the delivery message builder, then
 * posted to a throwaway local receiver. A verifier independent from the signing
 * module checks the raw body, the timestamp and a tampered variant.
 */
import { createHmac } from "node:crypto";
import http from "node:http";
import { closePools, query } from "../apps/api/src/db.js";
import { buildDeliveryMessage } from "../apps/api/src/notify/alert-delivery.js";
import { fetchNotificationAlerts, NA_DEPARTMENTS } from "../apps/api/src/notify/notification-alerts.js";
import {
  buildSignedWebhookHeaders,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "../apps/api/src/notify/webhook-signature.js";

const SECRET = "reproducible-measurement-secret";

type Hit = { raw: string; signature: string; timestamp: string };

const counts = await query<{
  organizations: number;
  sources: number;
  events: number;
  alerts: number;
}>(`
  SELECT (SELECT count(*)::int FROM org) AS organizations,
         (SELECT count(*)::int FROM source) AS sources,
         (SELECT count(*)::int FROM event) AS events,
         (SELECT count(*)::int FROM alert) AS alerts
`);

const alerts = await fetchNotificationAlerts({ pendingOnly: false, limit: 100_000 });
const hits: Hit[] = [];
const receiver = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const signature = req.headers[SIGNATURE_HEADER];
    const timestamp = req.headers[TIMESTAMP_HEADER];
    hits.push({
      raw: Buffer.concat(chunks).toString("utf8"),
      signature: Array.isArray(signature) ? (signature[0] ?? "") : (signature ?? ""),
      timestamp: Array.isArray(timestamp) ? (timestamp[0] ?? "") : (timestamp ?? ""),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
});

const ready = Promise.withResolvers<void>();
receiver.listen(0, "127.0.0.1", ready.resolve);
await ready.promise;
const address = receiver.address();
if (!address || typeof address === "string") throw new Error("local webhook receiver did not start");

try {
  for (const alert of alerts) {
    const rawBody = JSON.stringify(buildDeliveryMessage(alert, { webBaseUrl: "https://radar.local" }).payload);
    const response = await fetch(`http://127.0.0.1:${address.port}/hook`, {
      method: "POST",
      headers: buildSignedWebhookHeaders(SECRET, rawBody),
      body: rawBody,
    });
    if (!response.ok) throw new Error(`local webhook receiver returned HTTP ${response.status}`);
  }
} finally {
  await new Promise<void>((resolve) => receiver.close(() => resolve()));
  await closePools();
}

let clientVerified = 0;
let tamperedRejected = 0;
let freshTimestamps = 0;
const measuredAt = Math.floor(Date.now() / 1000);

for (const hit of hits) {
  const expected = `sha256=${createHmac("sha256", SECRET).update(`${hit.timestamp}.${hit.raw}`).digest("hex")}`;
  if (hit.signature === expected) clientVerified++;
  if (Number.isFinite(Number(hit.timestamp)) && Math.abs(measuredAt - Number(hit.timestamp)) <= 300) {
    freshTimestamps++;
  }
  const parsed: unknown = JSON.parse(hit.raw);
  if (typeof parsed === "object" && parsed !== null && "region" in parsed) {
    const alteredBody = JSON.stringify({ ...parsed, region: "TAMPERED" });
    const alteredSignature = `sha256=${createHmac("sha256", SECRET).update(`${hit.timestamp}.${alteredBody}`).digest("hex")}`;
    if (alteredSignature !== hit.signature) tamperedRejected++;
  }
}

console.log(
  JSON.stringify(
    {
      ...counts.rows[0],
      na_departments: NA_DEPARTMENTS.length,
      eligible_alerts: alerts.length,
      signed_deliveries: hits.length,
      client_verified: clientVerified,
      tampered_rejected: tamperedRejected,
      fresh_timestamps: freshTimestamps,
    },
    null,
    2,
  ),
);
