import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HostLimiter,
  SourceBackoffError,
  SourceHttpError,
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

test("fetchResilient : un 503 lève après retries bornés et pose le backoff", async () => {
  const url = "https://collector.test/indisponible";
  resetSourceBackoff("test:http-503");
  let calls = 0;
  // Le client valide l'URL avant d'appeler le fetch injecté : `.test` évite
  // toute résolution DNS réelle sans toucher au comportement testé ici.
  const opts = {
    source: "test:http-503",
    maxAttempts: 2,
    timeoutMs: 2000,
    fetchImpl: (async () => {
      calls++;
      return new Response("503 page d'erreur", {
        status: 503,
        headers: { "content-type": "text/html", "retry-after": "0" },
      });
    }) as typeof fetch,
  };
  try {
    await assert.rejects(fetchResilient(url, opts), (err: unknown) =>
      err instanceof SourceHttpError && err.status === 503);
    assert.equal(calls, 2, "deux tentatives, pas une boucle sans fin");
    assert.ok(sourceBackoffRemainingMs(opts.source) > 0, "l'échec transitoire alimente le backoff");
    await assert.rejects(fetchResilient(url, opts), (err: unknown) =>
      err instanceof SourceBackoffError && err.retryAfterMs > 0);
    assert.equal(calls, 2, "la source en backoff n'est pas rappelée");
    resetSourceBackoff(opts.source);
    calls = 0;
    opts.fetchImpl = (async () => {
      calls++;
      return new Response("flux valide", { status: 200 });
    }) as typeof fetch;
    const result = await fetchResilient(url, opts);
    assert.equal(result.status, 200);
    assert.equal(result.text, "flux valide");
    assert.equal(sourceBackoffRemainingMs(opts.source), 0, "le succès remet le backoff à zéro");
  } finally {
    resetSourceBackoff(opts.source);
  }
});

test("fetchResilient : un 404 n'est jamais rendu comme contenu", async () => {
  const url = "https://collector.test/absent";
  const source = "test:http-404";
  resetSourceBackoff(source);
  let calls = 0;
  await assert.rejects(
    fetchResilient(url, {
      source,
      maxAttempts: 3,
      fetchImpl: (async () => {
        calls++;
        return new Response("page 404 avec un titre de cyber", {
          status: 404,
          headers: { "content-type": "text/html" },
        });
      }) as typeof fetch,
    }),
    (err: unknown) => err instanceof SourceHttpError && err.status === 404,
  );
  assert.equal(calls, 1, "un statut permanent ne se retente pas");
  assert.equal(sourceBackoffRemainingMs(source), 0);
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
