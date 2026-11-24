import { mock, test } from "node:test";
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

// `setImmediate` n'est pas simulé : il laisse la chaîne de `.then` de la file
// s'inscrire avant qu'on avance l'horloge fictive.
const flush = () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
};

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
  // Horloge et minuteur fictifs : on vérifie la file d'attente et l'espacement
  // sans dépendre de la charge de la machine ni d'un seuil de wall-clock.
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_700_000_000_000 });
  try {
    const limiter = new HostLimiter(50);
    const started: string[] = [];
    const gates: Array<() => void> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const calls = ["a1", "a2", "a3"].map((id) => limiter.schedule("a", async () => {
      started.push(id);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const { promise, resolve } = Promise.withResolvers<void>();
      gates.push(resolve);
      await promise;
      inFlight--;
    }));

    await mock.timers.tick(0);
    assert.deepEqual(started, ["a1"], "premier appel immédiat");
    gates[0]();
    await flush();
    await mock.timers.tick(49);
    assert.deepEqual(started, ["a1"], "aucun appel suivant avant la fin de l'intervalle");
    await mock.timers.tick(1);
    assert.deepEqual(started, ["a1", "a2"], "second appel dès l'intervalle écoulé");
    gates[1]();
    await flush();
    await mock.timers.tick(50);
    assert.deepEqual(started, ["a1", "a2", "a3"], "troisième appel espacé à son tour");
    gates[2]();
    await flush();
    await Promise.all(calls);
    assert.equal(maxInFlight, 1, "un seul appel en vol pour un même hôte");
  } finally {
    mock.timers.reset();
  }
});

test("HostLimiter hôte différent non bloqué", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_700_000_000_000 });
  try {
    const limiter = new HostLimiter(200);
    const started: string[] = [];
    const gates = new Map<string, () => void>();
    const calls = ["x", "y"].map((host) => limiter.schedule(host, async () => {
      started.push(host);
      const { promise, resolve } = Promise.withResolvers<void>();
      gates.set(host, resolve);
      await promise;
    }));

    // Sans avance d'horloge : deux hôtes distincts ne se partagent pas la file.
    await mock.timers.tick(0);
    assert.deepEqual(started.sort(), ["x", "y"], "les deux hôtes démarrent sans timer");
    gates.get("y")?.();
    await mock.timers.tick(0);
    gates.get("x")?.();
    await Promise.all(calls);
    assert.deepEqual(started, ["x", "y"], "chaque hôte a bien terminé son appel");
  } finally {
    mock.timers.reset();
  }
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
