/**
 * Reproducible measurement of TheHive case creation from real radar alerts.
 *
 *   pnpm measure:thehive-cases
 *   pnpm measure:thehive-cases --json=bench/results/thehive-cases.json
 *
 * The alerts come from the live PostgreSQL database (5433 by default). Cases
 * are really POSTed over HTTP to a local TheHive-compatible test double bound
 * to 127.0.0.1: no external service, no paid service, no victim personal data.
 * The single number printed on stdout is the count of created cases.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname } from "node:path";
import { createCases, theHiveClient, type CaseCreationResult, type TheHiveCasePayload } from "../apps/api/src/thehive/cases.js";
import { mapAlertRow, selectParams, SELECT_NA_ALERTS } from "../apps/api/src/thehive/select.js";

const argv = process.argv.slice(2);
const output = argv.find((a) => a.startsWith("--json="))?.slice("--json=".length)
  ?? "bench/results/thehive-cases.json";
const databaseUrl = process.env.RADAR_THEHIVE_DATABASE_URL ?? process.env.DATABASE_URL
  ?? "postgres://radar:radar@localhost:5433/radar";
const command = "pnpm measure:thehive-cases";
process.env.DATABASE_URL = databaseUrl;
const { query, closePools } = await import("../apps/api/src/db.js");

const received: TheHiveCasePayload[] = [];
const server: Server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/case") {
    res.writeHead(404).end("not found");
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    try {
      received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as TheHiveCasePayload);
      res.writeHead(201, { "content-type": "application/json" })
        .end(JSON.stringify({ id: `case-${received.length}` }));
    } catch {
      res.writeHead(400).end("invalid JSON");
    }
  });
});

const listening = Promise.withResolvers<void>();
server.once("error", listening.reject);
server.listen(0, "127.0.0.1", listening.resolve);
await listening.promise;
const address = server.address();
if (address === null || typeof address === "string") throw new Error("local TheHive test double has no port");
const baseUrl = `http://127.0.0.1:${address.port}`;

let measurement: {
  baseline: { organizations: number; sources: number; events: number; alerts: number };
  result: CaseCreationResult;
  fingerprint: string;
  measuredAt: string;
};
try {
  const baseline = await query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM org)::text AS organizations,
            (SELECT count(*) FROM source)::text AS sources,
            (SELECT count(*) FROM event)::text AS events,
            (SELECT count(*) FROM alert)::text AS alerts`,
  );
  const alerts = await query<Record<string, unknown>>(SELECT_NA_ALERTS, selectParams(2000));
  const input = alerts.rows.map(mapAlertRow);
  const result = await createCases(input, theHiveClient({ url: baseUrl, apiKey: "local-measurement-key" }));
  const counts = baseline.rows[0] ?? { organizations: "0", sources: "0", events: "0", alerts: "0" };
  measurement = {
    baseline: {
      organizations: Number(counts.organizations),
      sources: Number(counts.sources),
      events: Number(counts.events),
      alerts: Number(counts.alerts),
    },
    result,
    fingerprint: createHash("sha256")
      .update(received.map((c) => c.externalRef).sort().join("\n"))
      .digest("hex"),
    measuredAt: new Date().toISOString(),
  };
} finally {
  await closePools();
  server.closeAllConnections();
  const closed = Promise.withResolvers<void>();
  server.close(() => closed.resolve());
  await closed.promise;
}

const payload = {
  command,
  endpoint: "local TheHive-compatible test double (127.0.0.1)",
  cases_created: measurement.result.created,
  eligible: measurement.result.eligible,
  failed: measurement.result.failed,
  skipped: measurement.result.skipped,
  requests_received: received.length,
  baseline: measurement.baseline,
  fingerprint: measurement.fingerprint,
  sql: SELECT_NA_ALERTS,
  measuredAt: measurement.measuredAt,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(String(payload.cases_created));
