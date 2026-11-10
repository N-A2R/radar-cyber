import test from "node:test";
import assert from "node:assert/strict";
import { scoreIndicator } from "../src/enrich/score.js";
import { enrichIndicator } from "../src/enrich/index.js";

test("scoreIndicator boundaries", () => {
  assert.equal(scoreIndicator({ type: "hash" }), scoreIndicator({ type: "hash" }));
  const zero = scoreIndicator({ type: "hash", sources: [] });
  assert.ok(zero >= 0 && zero <= 100);
  const one = scoreIndicator({ type: "domain", sources: ["a"], first_seen: new Date().toISOString() });
  const five = scoreIndicator({ type: "domain", sources: ["a","b","c","d","e"], first_seen: new Date(Date.now()-40*86400000).toISOString() });
  assert.ok(five > one);
});

test("enrichIndicator degrades gracefully", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("net down"); }) as any;
  const r = await enrichIndicator({ type: "domain", value: "example.com" });
  assert.ok(Array.isArray(r.errors));
  globalThis.fetch = originalFetch;
});
