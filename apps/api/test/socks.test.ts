// Routage Tor des URL `.onion` : reconnaissance, refus immédiat sans proxy,
// et non-régression du chemin clearnet. Aucun accès réseau externe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchResilient, isOnionUrl } from "../src/collectors/http.js";

function withEnvUnset(name: string, fn: () => Promise<void>): Promise<void> {
  const saved = process.env[name];
  delete process.env[name];
  return fn().finally(() => {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  });
}

test("isOnionUrl reconnaît les hôtes .onion", () => {
  assert.equal(isOnionUrl("http://abc.onion/"), true);
  assert.equal(isOnionUrl("https://a.b.onion:8080/x"), true);
  assert.equal(isOnionUrl("onion.example"), false);
  assert.equal(isOnionUrl("example.com/?u=x.onion"), false);
});

test("isOnionUrl ignore les URL invalides", () => {
  assert.equal(isOnionUrl("pas une url"), false);
  assert.equal(isOnionUrl(""), false);
});

test("fetchResilient rejette une URL .onion sans RADAR_TOR_SOCKS, immédiatement", async () => {
  await withEnvUnset("RADAR_TOR_SOCKS", async () => {
    const t0 = Date.now();
    await assert.rejects(fetchResilient("http://abc.onion/"), /RADAR_TOR_SOCKS/);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 500, `échec non immédiat : ${elapsed} ms`);
  });
});

test("fetchResilient sert le clearnet via un serveur local", async () => {
  await withEnvUnset("RADAR_TOR_SOCKS", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("clearnet-ok");
    });
    const { promise: listening, resolve: onListening } = Promise.withResolvers<void>();
    server.listen(0, "127.0.0.1", onListening);
    await listening;
    try {
      const addr = server.address();
      assert.ok(addr !== null && typeof addr === "object", "adresse du serveur local");
      const res = await fetchResilient(`http://127.0.0.1:${addr.port}/ping`, {
        timeoutMs: 5000,
        maxAttempts: 1,
      });
      assert.equal(res.status, 200);
      assert.equal(res.text, "clearnet-ok");
      assert.equal(res.notModified, false);
    } finally {
      const { promise: closed, resolve: onClose, reject: onCloseError } =
        Promise.withResolvers<void>();
      server.close((err) => (err ? onCloseError(err) : onClose()));
      await closed;
    }
  });
});
