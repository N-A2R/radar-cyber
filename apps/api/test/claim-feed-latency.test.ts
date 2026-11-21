import { test } from "node:test";
import assert from "node:assert/strict";
import type { CollectContext } from "@radar/shared";
import { claimKey, selectNewClaimPosts, type ClaimPost } from "../src/collectors/claim-feed.js";
import { collector } from "../src/collectors/ransomlook.collector.js";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");

function post(title: string, discovered: string): ClaimPost {
  return { post_title: title, group_name: "test-group", discovered };
}

/**
 * One behaviour per test. The feed is bounded and its `discovered` date comes
 * from the group, not from the feed: an older post can appear late. A single
 * `lastDate` watermark dropped it forever, which is what these tests pin down.
 */

test("a late claim older than the cursor watermark is still selected", () => {
  const posts = [post("Late victim", "2026-11-20T08:00:00.000Z")];
  const selected = selectNewClaimPosts(posts, { lastDate: "2026-11-21T06:00:00.000Z" }, { now: NOW });
  assert.deepEqual(selected.posts, posts);
  assert.equal(selected.keys.length, 1);
});

test("the same claim is not selected twice from the persisted key set", () => {
  const posts = [post("Known victim", "2026-11-21T09:00:00.000Z")];
  const first = selectNewClaimPosts(posts, {}, { now: NOW });
  const second = selectNewClaimPosts(posts, first.cursor, { now: NOW });
  assert.equal(first.posts.length, 1);
  assert.equal(second.posts.length, 0);
  assert.deepEqual(second.keys, []);
});

test("a claim older than the lookback window is ignored", () => {
  const stale = post("Ancient victim", "2026-10-01T09:00:00.000Z");
  const fresh = post("Fresh victim", "2026-11-21T09:00:00.000Z");
  const selected = selectNewClaimPosts([stale, fresh], {}, { now: NOW, lookbackDays: 7 });
  assert.deepEqual(selected.posts, [fresh]);
});

test("the cursor keeps at most maxSeen claim keys", () => {
  const posts = Array.from({ length: 20 }, (_, i) => post(`Victim ${i}`, `2026-11-21T0${i % 10}:00:00.000Z`));
  const selected = selectNewClaimPosts(posts, {}, { now: NOW, maxSeen: 5 });
  assert.equal(selected.cursor.seen.length, 5);
});

test("the collector emits a late claim without changing its dedup key", async () => {
  const late = post("Late victim", "2026-11-20T08:00:00.000Z");
  const expectedKey = `ransomlook:${claimKey(late)}`;
  const ctx: CollectContext = {
    fetchJson: async () => [late],
    fetchText: async () => "",
    cursor: { lastDate: "2026-11-21T06:00:00.000Z", seen: [] },
    log: () => {},
    now: () => new Date(NOW),
  };
  const result = await collector.run(ctx);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.dedupKey, expectedKey);
  assert.equal(result.events[0]?.observedAt, late.discovered);
  assert.equal(result.events[0]?.sourceId, "ransomlook");
});
