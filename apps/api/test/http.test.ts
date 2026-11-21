import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  HostLimiter,
  SourceBackoffError,
  backoffDelayMs,
  fetchResilient,
  getValidators,
  noteSourceFailure,
  resetSourceBackoff,
  setValidators,
  sourceBackoffRemainingMs,
} from "../src/collectors/http.js";

test("backoffDelayMs : six cas, paliers puis plafond", () => {
  const cases: Array<[number, number, string]> = [
    [0, 0, "aucun échec"],
    [1, 60_000, "1 min"],
    [2, 300_000, "5 min"],
    [3, 1_800_000, "30 min"],
    [4, 7_200_000, "2 h"],
    [5, 7_200_000, "plafond au-delà de 2 h"],
  ];
  for (const [failures, expected, label] of cases) {
    assert.equal(backoffDelayMs(failures), expected, `${label} (failures=${failures})`);
  }
});

test("backoff stocké par source puis remis à zéro", () => {
  const source = "test:backoff-store";
  resetSourceBackoff(source);
  assert.equal(sourceBackoffRemainingMs(source), 0);
  assert.equal(noteSourceFailure(source), 60_000);
  assert.ok(sourceBackoffRemainingMs(source) > 0);
  assert.equal(sourceBackoffRemainingMs("test:backoff-autre"), 0);
  assert.equal(noteSourceFailure(source), 300_000);
  resetSourceBackoff(source);
  assert.equal(sourceBackoffRemainingMs(source), 0);
  assert.equal(noteSourceFailure(source), 60_000, "premier palier après remise à zéro");
  resetSourceBackoff(source);
});

test("fetchResilient bloque une source en 503 puis reprend après succès", async () => {
  let status = 503;
  const server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "text/plain" });
    res.end("réponse de test");
  });
  const { promise: listening, resolve: onListening } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", onListening);
  await listening;
  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object", "adresse du serveur local");
  const url = `http://127.0.0.1:${addr.port}/backoff`;
  const opts = { source: "test:backoff-http", maxAttempts: 1, timeoutMs: 2000 };
  resetSourceBackoff(opts.source);
  try {
    assert.equal((await fetchResilient(url, opts)).status, 503);
    assert.ok(sourceBackoffRemainingMs(opts.source) > 0);
    await assert.rejects(fetchResilient(url, opts), (err: unknown) =>
      err instanceof SourceBackoffError && err.retryAfterMs > 0);
    resetSourceBackoff(opts.source);
    status = 200;
    assert.equal((await fetchResilient(url, opts)).status, 200);
    assert.equal(sourceBackoffRemainingMs(opts.source), 0, "succès remet le compteur à zéro");
  } finally {
    resetSourceBackoff(opts.source);
    const { promise: closed, resolve: onClose, reject: onCloseError } = Promise.withResolvers<void>();
    server.close((err) => (err ? onCloseError(err) : onClose()));
    await closed;
  }
});

test("HostLimiter espaces appels même hôte", async () => {
  const limiter = new HostLimiter(50);
  const times: number[] = [];
  const run = async () => {
    const t0 = Date.now();
    await limiter.schedule("a", async () => { times.push(Date.now()); });
  };
  await Promise.all([run(), run(), run()]);
  // séquentiels via queue; vérifie écarts
  times.sort((x,y)=>x-y);
  assert.ok(times[1]-times[0] >= 45, `gap1 ${times[1]-times[0]}`);
  assert.ok(times[2]-times[1] >= 45, `gap2 ${times[2]-times[1]}`);
});

test("HostLimiter hôte différent non bloqué", async () => {
  const limiter = new HostLimiter(200);
  const start = Date.now();
  await Promise.all([
    limiter.schedule("x", async () => {}),
    limiter.schedule("y", async () => {}),
  ]);
  assert.ok(Date.now() - start < 100);
});

test("getValidators par défaut undefined", () => {
  assert.equal(getValidators("http://nope.example/"), undefined);
});

test("setValidators merge partiel etag puis lastModified", () => {
  const url = "http://merge.example/";
  setValidators(url, { etag: '"abc"' });
  assert.equal(getValidators(url)?.etag, '"abc"');
  assert.equal(getValidators(url)?.lastModified, undefined);
  setValidators(url, { lastModified: "Wed, 01 Jan 2025" });
  assert.equal(getValidators(url)?.etag, '"abc"');
  assert.equal(getValidators(url)?.lastModified, "Wed, 01 Jan 2025");
});
