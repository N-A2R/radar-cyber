import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { isNaDepartment, RadarApiError, RadarClient } from "../src/index.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Handler = (_req, res) => {
  res.statusCode = 404;
  res.end("{}");
};
const server = createServer((req, res) => handler(req, res));
const listening = Promise.withResolvers<void>();
server.listen(0, "127.0.0.1", listening.resolve);
await listening.promise;
after(() => {
  server.closeAllConnections();
  const closed = Promise.withResolvers<void>();
  server.close(() => closed.resolve());
  return closed.promise;
});
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

function json(res: ServerResponse, payload: unknown): void {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

test("builds the configured URL with a department query", async () => {
  let seen = "";
  handler = (req, res) => {
    seen = req.url ?? "";
    json(res, { dept: "33", events: [] });
  };
  const events = await new RadarClient({ baseUrl }).getNaEvents("33");
  assert.equal(seen, "/api/na/events?dept=33");
  assert.deepEqual(events, []);
});

test("sends the API key header when configured", async () => {
  let key: string | undefined;
  handler = (req, res) => {
    key = req.headers["x-api-key"] as string | undefined;
    json(res, { ok: true, sources: 312 });
  };
  const health = await new RadarClient({ baseUrl, apiKey: "rk_test" }).getHealth();
  assert.equal(key, "rk_test");
  assert.equal(health.sources, 312);
});

test("raises a typed API error with status and code", async () => {
  handler = (_req, res) => {
    res.statusCode = 403;
    json(res, { error: { code: "FORBIDDEN", message: "denied" } });
  };
  await assert.rejects(
    () => new RadarClient({ baseUrl }).getStats(),
    (error: unknown) =>
      error instanceof RadarApiError &&
      error.status === 403 &&
      error.code === "FORBIDDEN" &&
      error.message === "denied",
  );
});

test("drops free-text fields that could name a victim", async () => {
  handler = (_req, res) => {
    json(res, {
      dept: "33",
      events: [{
        id: 7,
        title: "Victim name appears here",
        summary: "Personal details",
        family: "leaks",
        observedAt: "2026-11-21T10:00:00Z",
        collectedAt: "2026-11-21T10:01:00Z",
        source: "gray-source",
        orgId: 42,
        orgName: "Example Org",
      }],
    });
  };
  const [event] = await new RadarClient({ baseUrl }).getNaEvents("33");
  assert.deepEqual(Object.keys(event).sort(), [
    "collectedAt", "family", "id", "observedAt", "orgId", "source",
  ]);
  assert.ok(!JSON.stringify(event).includes("Victim"));
  assert.equal(event.observedAt, "2026-11-21T10:00:00Z");
  assert.equal(event.collectedAt, "2026-11-21T10:01:00Z");
});

test("keeps gray sources without an origin allowlist", async () => {
  handler = (_req, res) => {
    json(res, [
      { id: "ctlog", name: "CT log", family: "cti", kind: "indicator", enabled: true, lastOkAt: null },
      { id: "onion:gray", name: "Gray feed", family: "leaks", kind: "quarantine", enabled: false, lastOkAt: null },
    ]);
  };
  const sources = await new RadarClient({ baseUrl }).getSources();
  assert.deepEqual(sources.map((source) => source.id), ["ctlog", "onion:gray"]);
});

test("rejects departments outside Nouvelle-Aquitaine", async () => {
  assert.equal(isNaDepartment("33"), true);
  assert.equal(isNaDepartment("75"), false);
  await assert.rejects(() => new RadarClient({ baseUrl }).getNaEvents("75"), RangeError);
});
