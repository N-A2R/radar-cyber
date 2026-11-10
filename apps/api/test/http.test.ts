import { test } from "node:test";
import assert from "node:assert/strict";
import { HostLimiter, getValidators, setValidators } from "../src/collectors/http.js";

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
