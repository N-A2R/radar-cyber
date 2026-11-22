import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseClaim, type ClaimEnrichie, type ClaimSource } from "../src/collectors/leak-sites.js";
import {
  carveJsonArray,
  captureVictimProofs,
  buildWarcRecord,
  FEEDS,
  hasPersonalData,
  measureVictimProofs,
  parseWarcRecord,
  redactPersonalData,
} from "../src/leak-victim-proofs.js";
import type { ProofManifest } from "../src/leak-victim-proofs.js";

function tempLayout(): { dir: string; results: string; manifest: string } {
  const root = mkdtempSync(join(tmpdir(), "leak-victim-proofs-"));
  const dir = join(root, "leak-victim-proofs");
  const results = join(root, "results");
  mkdirSync(results);
  return { dir, results, manifest: join(results, "proofs.json") };
}

function enrich(post: unknown, source: ClaimSource, orgId = 1): ClaimEnrichie {
  const claim = parseClaim(post, source);
  assert.ok(claim);
  return {
    ...claim,
    na: true,
    naMotifs: ["departement"],
    orgId,
    orgName: "Organisation test",
    rattachementVia: null,
  };
}

function persist(manifest: ProofManifest, layout: { results: string; manifest: string }): void {
  writeFileSync(layout.manifest, JSON.stringify(manifest));
}

test("carveJsonArray: keeps published JSON objects byte for byte", () => {
  const feed = '[{"post_title":"A, B","description":"x"}, {"post_title":"B"}]';
  assert.deepEqual(carveJsonArray(feed), ['{"post_title":"A, B","description":"x"}', '{"post_title":"B"}']);
});

test("redactPersonalData: removes victim contact details without losing the organization", () => {
  const raw = '{"post_title":"Cabinet Pau","description":"mail abc@example.fr tel 06 12 34 56 78 id 123456789012345"}';
  const redacted = redactPersonalData(raw);
  assert.match(redacted, /Cabinet Pau/);
  assert.doesNotMatch(redacted, /06 12 34 56 78/);
  assert.equal(hasPersonalData(redacted), false);
});

test("buildWarcRecord: digest and length survive parsing, tampering is detected", () => {
  const record = buildWarcRecord({
    targetUri: FEEDS.ransomlook[2],
    date: "2026-11-22T00:00:00.000Z",
    payload: '{"post_title":"Org"}',
    claimFingerprint: "abc",
    victimKey: "key",
  });
  const parsed = parseWarcRecord(record);
  assert.equal(parsed.digestValid, true);
  assert.equal(parsed.lengthValid, true);
  assert.equal(parsed.targetUri, FEEDS.ransomlook[2]);
  const tampered = parseWarcRecord(record.replace('"Org"', '"Autre"'));
  assert.equal(tampered.digestValid, false);
});

test("captureVictimProofs: archives one capture per NA victim and ignores foreign claims", async () => {
  const layout = tempLayout();
  const posts = [
    { post_title: "Cabinet Pau", group_name: "Alpha", discovered: "2026-03-01", description: "Pau" },
    { post_title: "Cabinet Pau", group_name: "Beta", discovered: "2026-03-02", description: "Gironde" },
    { post_title: "Foreign Corp", group_name: "Gamma", discovered: "2026-03-03", description: "Germany" },
  ];
  const feed = JSON.stringify(posts);
  const options = {
    claims: [
      enrich(posts[0], "ransomlook"),
      enrich(posts[1], "ransomlook"),
      { ...enrich(posts[2], "ransomlook", 99), na: false, naMotifs: [] },
    ],
    dir: layout.dir,
    fetchText: async () => ({ status: 200, text: feed }),
    now: () => new Date("2026-11-22T00:00:00.000Z"),
  };
  const first = await captureVictimProofs(options);
  assert.equal(first.stats.naClaims, 2);
  assert.equal(first.stats.archived, 1);
  assert.equal(first.victims.length, 1);
  const warcPath = join(layout.dir, first.victims[0].warcPath);
  assert.match(parseWarcRecord(readFileSync(warcPath, "utf8")).payload, /Cabinet Pau/);
  const second = await captureVictimProofs(options);
  assert.equal(readFileSync(warcPath, "utf8"), readFileSync(join(layout.dir, second.victims[0].warcPath), "utf8"));
});

test("captureVictimProofs: a claim containing contact details is archived redacted", async () => {
  const layout = tempLayout();
  const post = { post_title: "Cabinet Pau", group_name: "Alpha", discovered: "2026-03-01", description: "contact abc@example.fr" };
  const manifest = await captureVictimProofs({
    claims: [enrich(post, "ransomlook")],
    dir: layout.dir,
    fetchText: async () => ({ status: 200, text: JSON.stringify([post]) }),
    now: () => new Date("2026-11-22T00:00:00.000Z"),
  });
  const raw = readFileSync(join(layout.dir, manifest.victims[0].warcPath), "utf8");
  assert.match(raw, /REDACTED_EMAIL/);
  assert.equal(hasPersonalData(raw), false);
});

test("measureVictimProofs: counts only victims whose archived capture verifies", async () => {
  const layout = tempLayout();
  const post = { post_title: "Cabinet Pau", group_name: "Alpha", discovered: "2026-03-01", description: "Pau" };
  const manifest = await captureVictimProofs({
    claims: [enrich(post, "ransomlook")],
    dir: layout.dir,
    fetchText: async () => ({ status: 200, text: JSON.stringify([post]) }),
    now: () => new Date("2026-11-22T00:00:00.000Z"),
  });
  persist(manifest, layout);
  assert.deepEqual(
    { count: measureVictimProofs(layout.manifest).count, valid: measureVictimProofs(layout.manifest).validClaims },
    { count: 1, valid: 1 },
  );
  const warcPath = join(layout.dir, manifest.victims[0].warcPath);
  writeFileSync(warcPath, readFileSync(warcPath, "utf8").replace("Cabinet Pau", "Cabinet Lille"));
  const damaged = measureVictimProofs(layout.manifest);
  assert.equal(damaged.count, 0);
  assert.match(damaged.invalid[0].reason, /digest/);
});
