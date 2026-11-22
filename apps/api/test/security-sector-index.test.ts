/** One test per observable behaviour of the region-wide sector security index. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import securitySectorIndexRoute from "../src/routes/security-sector-index.js";
import {
  classifyDmarc,
  classifySpf,
  classifyTls,
  computeSectorIndices,
  scorePatchLag,
  SECTORS,
  type Sector,
  type SignalObservation,
} from "../src/security/sectorIndex.js";
import { measurePatchLagDays } from "../src/security/patchLag.js";

const COUNTS_PATH = new URL("../../../bench/results/sector-organizations-na.json", import.meta.url);
const OBSERVATIONS_PATH = new URL("../../../bench/corpus/security-observations-na.jsonl", import.meta.url);

function frozenCounts(): { total: number; organizations: Partial<Record<Sector, number>> } {
  return JSON.parse(readFileSync(COUNTS_PATH, "utf8"));
}

function buildReport(
  counts: { total: number; organizations: Partial<Record<Sector, number>> },
  observations: readonly SignalObservation[],
  patchLagDays: number,
) {
  const organizations: Partial<Record<Sector, number>> = {};
  for (const sector of SECTORS) organizations[sector] = counts.organizations[sector];
  return computeSectorIndices({ organizations, observations, patchLagDays });
}

function observation(sector: Sector, overrides: Partial<SignalObservation> = {}): SignalObservation {
  return {
    domain: `${sector}.na.fr`,
    sector,
    department: "33",
    tls: "ok",
    spf: "valid",
    dmarc: "valid",
    observedAt: "2026-11-22T00:00:00.000Z",
    ...overrides,
  };
}

test("the region-wide denominator indexes all nine sectors", () => {
  const counts = frozenCounts();
  const report = buildReport(counts, SECTORS.map((sector) => observation(sector)), 10);
  assert.equal(report.sectors.length, 9);
  assert.equal(report.sectorsIndexed, 9);
  assert.equal(report.totalOrganizations, 1673151);
  assert.deepEqual(report.sectors.map((item) => item.sector), [...SECTORS]);
});

test("frozen organisation counts reproduce the published regional total", () => {
  const counts = frozenCounts();
  const sum = Object.values(counts.organizations).reduce((total, value) => total + (value ?? 0), 0);
  assert.equal(sum, counts.total);
  assert.equal(counts.total, 1673151);
});

test("a longer disclosure lag lowers the patch-lag subscore", () => {
  assert.equal(scorePatchLag(0), 100);
  assert.equal(scorePatchLag(15), 50);
  assert.equal(scorePatchLag(30), 0);
  assert.equal(scorePatchLag(90), 0);
});

test("SPF rejects permissive +all and accepts a constrained record", () => {
  assert.equal(classifySpf(["v=spf1 include:_spf.example.fr -all"]), "valid");
  assert.equal(classifySpf(["v=spf1 +all"]), "permissive");
  assert.equal(classifySpf(["some verification string"]), "missing");
});

test("DMARC requires an enforcement policy, not monitoring", () => {
  assert.equal(classifyDmarc(["v=DMARC1; p=reject; rua=mailto:dmarc@example.fr"]), "valid");
  assert.equal(classifyDmarc(["v=DMARC1; p=quarantine"]), "valid");
  assert.equal(classifyDmarc(["v=DMARC1; p=none"]), "monitor");
  assert.equal(classifyDmarc([]), "missing");
});

test("TLS classifies expiry, weak configuration and hostname mismatch", () => {
  const base = { authorized: true, validTo: new Date("2027-01-01T00:00:00Z"), keyBits: 2048, protocol: "TLSv1.3", now: new Date("2026-11-22T00:00:00Z") };
  assert.equal(classifyTls(base), "ok");
  assert.equal(classifyTls({ ...base, validTo: new Date("2026-01-01T00:00:00Z") }), "expired");
  assert.equal(classifyTls({ ...base, keyBits: 1024 }), "weak");
  assert.equal(classifyTls({ ...base, keyBits: 256, curve: "prime256v1" }), "ok");
  assert.equal(classifyTls({ ...base, protocol: "TLSv1" }), "weak");
  assert.equal(classifyTls({ ...base, authorized: false }), "hostname_mismatch");
});

test("a sector without enough hosts uses regional rates and is labelled", () => {
  const counts = frozenCounts();
  const observations = [
    ...SECTORS.filter((sector) => sector !== "sante" && sector !== "public")
      .flatMap((sector) => [1, 2, 3].map((n) => observation(sector, { domain: `s${n}.${sector}.na.fr` }))),
    ...[1, 2, 3].map((n) => observation("sante", {
      domain: `hop${n}.na.fr`, tls: "expired", spf: "missing", dmarc: "missing",
    })),
    observation("public", { domain: "commune.na.fr" }),
  ];
  const report = buildReport(counts, observations, 0);
  const sante = report.sectors.find((item) => item.sector === "sante");
  const services = report.sectors.find((item) => item.sector === "services");
  assert.equal(sante?.basis, "sector");
  assert.equal(services?.basis, "sector");
  assert.ok(sante && services && sante.index < services.index);

  const thin = report.sectors.find((item) => item.sector === "public");
  assert.equal(thin?.basis, "regional-fallback");
  assert.equal(thin?.measuredHosts, 1);
});

test("a signal without a usable sample falls back to the regional rate", () => {
  const counts = frozenCounts();
  const observations = [
    ...SECTORS.filter((sector) => sector !== "sante").map((sector) => observation(sector)),
    ...[1, 2, 3].map((n) => observation("sante", { domain: `hop${n}.na.fr`, tls: "unreachable" })),
  ];
  const sectors = buildReport(counts, observations, 0).sectors;
  const sante = sectors.find((item) => item.sector === "sante");
  const industrie = sectors.find((item) => item.sector === "industrie");
  assert.equal(sante?.signalBasis.tls, "regional");
  assert.equal(sante?.tlsScore, industrie?.tlsScore);
  assert.equal(sante?.signalBasis.dmarc, "sector");
  assert.equal(sante?.dmarcScore, 100);
});

test("unreachable hosts are excluded from the signal denominators", () => {
  const counts = frozenCounts();
  const observations = [
    observation("commerce", { tls: "unreachable", spf: "unknown", dmarc: "unknown" }),
    ...SECTORS.filter((sector) => sector !== "commerce").map((sector) => observation(sector)),
  ];
  const commerce = buildReport(counts, observations, 0).sectors.find((item) => item.sector === "commerce");
  assert.equal(commerce?.tlsScore, 100);
  assert.equal(commerce?.spfScore, 100);
  assert.equal(commerce?.dmarcScore, 100);
});

test("an observation carries no victim or personal field", () => {
  const keys = Object.keys(observation("sante")).sort();
  assert.deepEqual(keys, ["department", "dmarc", "domain", "observedAt", "sector", "spf", "tls"]);
  const frozen = readFileSync(OBSERVATIONS_PATH, "utf8").split("\n").filter(Boolean)[0];
  if (frozen) {
    assert.deepEqual(Object.keys(JSON.parse(frozen)).sort(), keys);
  }
});

test("patch lag is measured from disclosed CVEs in the frozen NVD window", () => {
  const cves = readFileSync(new URL("../../../bench/corpus/cve-na-window.jsonl", import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const tech = JSON.parse(readFileSync(new URL("../../../bench/corpus/cve-na-technologies.json", import.meta.url), "utf8"));
  const alerts = JSON.parse(readFileSync(new URL("../../../bench/corpus/cve-na-official-alerts.json", import.meta.url), "utf8"));
  const measured = measurePatchLagDays(cves, tech.technologies, alerts, tech.capturedAt);
  assert.ok(measured.days >= 0 && measured.days <= 30);
  assert.ok(measured.relevantCves > 0);
});

test("missing organisation counts are rejected instead of silently zeroed", () => {
  assert.throws(
    () => computeSectorIndices({ organizations: {}, observations: [], patchLagDays: 0 }),
    /Missing region-wide organisation counts/,
  );
});

test("the public route serves the frozen region-wide report", async () => {
  const app = Fastify();
  await app.register(securitySectorIndexRoute, { prefix: "/api" });
  const response = await app.inject({ method: "GET", url: "/api/security/sector-index" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{ sectorsIndexed: number; totalOrganizations: number }>();
  assert.equal(body.sectorsIndexed, 9);
  assert.equal(body.totalOrganizations, 1673151);
  await app.close();
});
