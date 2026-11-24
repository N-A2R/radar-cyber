// Routage Tor des URL `.onion` : reconnaissance, refus immédiat sans proxy,
// et non-régression du chemin clearnet. Aucun accès réseau externe.

import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchResilient, isOnionUrl, SourceBlockedError } from "../src/collectors/http.js";
import { resetTorBackoff } from "../src/collectors/tor/tor-circuit.js";

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

test("fetchResilient rejette une URL .onion sans proxy, sans aucun dispatch", async () => {
  await withEnvUnset("RADAR_TOR_SOCKS_LIST", () => withEnvUnset("RADAR_TOR_SOCKS", async () => {
    const source = "test:onion:sans-proxy";
    resetTorBackoff(source);
    // Aucun repli clearnet : si un jour la garde saute, le spy le voit.
    const fetchSpy = mock.method(globalThis, "fetch", () => {
      throw new Error("dispatch clearnet interdit pour une URL .onion");
    });
    try {
      await assert.rejects(
        fetchResilient("http://abc.onion/", { source, maxAttempts: 3 }),
        (err: unknown) => {
          assert.ok(err instanceof SourceBlockedError, "refus explicite, pas une erreur réseau");
          assert.equal(err.permanent, true, "refus permanent : aucune tentative réseau");
          assert.match(err.message, /RADAR_TOR_SOCKS/);
          return true;
        },
      );
      assert.equal(fetchSpy.mock.callCount(), 0, "aucun appel fetch, aucun repli clearnet");
    } finally {
      fetchSpy.mock.restore();
      resetTorBackoff(source);
    }
  }));
});

test("fetchResilient refuse loopback et IP privées par défaut", async () => {
  const cas: Array<[string, RegExp]> = [
    ["http://127.0.0.1:9/", /adresse IP non publique refusée/],
    ["http://[::1]:9/", /adresse IP non publique refusée|hôte local refusé/],
    ["http://10.1.2.3/", /adresse IP non publique refusée/],
    ["http://192.168.1.1/", /adresse IP non publique refusée/],
  ];
  for (const [url, motif] of cas) {
    await assert.rejects(
      fetchResilient(url, { timeoutMs: 500, maxAttempts: 1, source: `test:prive:${url}` }),
      motif,
      `${url} doit être refusée avant toute connexion`,
    );
  }
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
        allowPrivate: true,
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
