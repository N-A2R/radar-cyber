import { test } from "node:test";
import assert from "node:assert/strict";
import { isActionableIndicator, normalizeHost } from "../src/collectors/filter.js";
import type { ActiveIndex } from "../src/collectors/filter.js";

function idx(over: Partial<ActiveIndex> = {}): ActiveIndex {
  return {
    domains: new Set(["acme.fr"]),
    suffixes: new Set(["com", "fr", "gouv.fr"]),
    ips: new Set(["10.0.0.5"]),
    prefixes24: new Set(["192.168.1"]),
    cves: new Set(["CVE-2024-1234"]),
    loadedAt: new Date(),
    ...over,
  };
}

test("domaine org exact", () => {
  const v = isActionableIndicator("acme.fr", "domain", idx());
  assert.equal(v.keep, true);
  assert.equal(v.reason, "org_domain");
});

test("sous-domaine org", () => {
  const v = isActionableIndicator("sub.acme.fr", "domain", idx());
  assert.equal(v.keep, true);
  assert.equal(v.reason, "org_subdomain");
});

test("IP /24", () => {
  const v = isActionableIndicator("192.168.1.99", "ip", idx());
  assert.equal(v.keep, true);
  assert.equal(v.reason, "org_ip");
});

test("CVE connu", () => {
  const v = isActionableIndicator("cve-2024-1234", "cve", idx());
  assert.equal(v.keep, true);
  assert.equal(v.reason, "cve_known");
});

test("hash global", () => {
  const v = isActionableIndicator("deadbeef", "hash", idx());
  assert.equal(v.keep, false);
  assert.equal(v.reason, "global");
});

test("suffixe public", () => {
  const v = isActionableIndicator("com", "domain", idx());
  assert.equal(v.keep, false);
  assert.equal(v.reason, "public_suffix");
});

test("normalizeHost", () => {
  assert.equal(normalizeHost("https://WWW.Example.com/path"), "example.com");
});
