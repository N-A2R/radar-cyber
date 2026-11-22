/**
 * One test per behavior of the .onion index: catalog parsing, host identity,
 * evidence freshness, site classification, data safety and HTTP exposure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {
  buildOnionIndex,
  loadOnionIndex,
  onionHost,
  parseOnionCatalog,
  pickLatestProbe,
  type OnionProbeSnapshot,
} from "../src/onion/index.js";
import onionIndexRoute from "../src/routes/onion-index.js";

const CATALOG_SQL = `
INSERT INTO source (id, name, family, url, kind, format, enabled, interval_sec) VALUES
  ('onion:ccw:a', 'a', 'ransomware', 'http://AAAA.onion/', 'narrative', 'html', false, 3600),
  (
    'onion:rl:b',
    'b',
    'ransomware',
    'http://bbbb.onion',
    'narrative',
    'html',
    false,
    3600
  );
`;

test("parses onion sources from the versioned SQL catalog", () => {
  const sources = parseOnionCatalog(CATALOG_SQL);
  assert.deepEqual(sources.map((source) => source.id), ["onion:ccw:a", "onion:rl:b"]);
  assert.equal(sources[0].name, "a");
  assert.equal(onionHost(sources[1].url), "bbbb.onion");
});

test("canonicalises hosts and rejects non-onion URLs", () => {
  assert.equal(onionHost("https://Example.Onion./path?q=1"), "example.onion");
  assert.equal(onionHost("http://abc.onion/"), "abc.onion");
  assert.equal(onionHost("https://example.com"), null);
  assert.equal(onionHost("not a url"), null);
});

test("selects the newest Tor probe snapshot", () => {
  const older = { file: "bench/results/tor-stability-before.json", at: "2026-11-21T20:00:00.000Z", rows: [] };
  const newer = { file: "bench/results/tor-stability-after.json", at: "2026-11-21T20:29:36.381Z", rows: [] };
  assert.equal(pickLatestProbe([older, newer]).file, newer.file);
  assert.equal(pickLatestProbe([newer, older]).file, newer.file);
  assert.throws(() => pickLatestProbe([]), /no Tor probe evidence/);
});

test("counts live and productive sites, not catalog rows", () => {
  const sources = [
    { id: "onion:a", name: "a", url: "http://a.onion/" },
    { id: "onion:a2", name: "a2", url: "http://a.onion" },
    { id: "onion:b", name: "b", url: "http://b.onion/" },
    { id: "onion:c", name: "c", url: "http://c.onion/" },
  ];
  const probe: OnionProbeSnapshot = {
    file: "probe.json",
    at: "2026-11-21T00:00:00.000Z",
    rows: [
      { id: "onion:a", status: 200, items: 4 },
      { id: "onion:a2", status: null, items: 0 },
      { id: "onion:b", status: 200, items: 0 },
      { id: "onion:c", status: 503, items: 2 },
    ],
  };
  const index = buildOnionIndex(sources, probe);
  assert.equal(index.sourceCount, 4);
  assert.equal(index.siteCount, 3);
  assert.equal(index.liveSites, 2);
  assert.equal(index.productiveSites, 2);
  assert.equal(index.liveAndProductiveSites, 1);
  assert.deepEqual(index.sites[0].sourceIds, ["onion:a", "onion:a2"]);
  assert.equal(index.sites[0].items, 4);
});

test("publishes only source metadata from the real evidence", () => {
  const index = loadOnionIndex();
  assert.equal(index.sourceCount, 77);
  assert.equal(index.siteCount, 70);
  assert.equal(index.liveAndProductiveSites, 49);
  const keys = Object.keys(index.sites[0]).sort().join(",");
  assert.equal(keys, "host,httpStatus,items,live,productive,sourceIds");
  for (const forbidden of ["extrait", "sous_cause", "post_title", "victim", "claim"]) {
    assert.ok(!JSON.stringify(index).includes(forbidden), `no ${forbidden} in the index`);
  }
});

test("API route serves the index in English", async () => {
  const app = Fastify({ logger: false });
  await app.register(onionIndexRoute, { prefix: "/api" });
  await app.ready();
  const response = await app.inject({ method: "GET", url: "/api/onion-index" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{ scope: string; liveAndProductiveSites: number }>();
  assert.equal(body.scope, "nouvelle-aquitaine");
  assert.equal(body.liveAndProductiveSites, 49);
  await app.close();
});
