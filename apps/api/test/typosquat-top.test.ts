/** One test per behaviour of the scaled Nouvelle-Aquitaine typosquat scan. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVariants,
  isAlarm,
  loadTopTargets,
  mapTargetRows,
  pageProof,
  scanTargets,
  TOP_TARGETS_SQL,
  type DomainProbe,
  type ScanTarget,
} from "../src/detect/typosquat-top.js";
import { genererVariantes, variantesTld, type TyposquatFinding, type Variant } from "../src/detect/typosquat.js";

const NOW = new Date("2026-11-22T12:00:00Z");
const TARGET: ScanTarget = { rank: 1, orgId: 42, orgName: "Universite de Poitiers", domain: "univ-poitiers.fr", dept: "86", effectif: 2000 };
const BAD = "univ-poitier.fr";

function probe(active = BAD): DomainProbe & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async dns(domain) { calls.push(`dns:${domain}`); return domain === active ? { a: ["192.0.2.10"], aaaa: [] } : { a: [], aaaa: [] }; },
    async certificate() { calls.push("cert"); return null; },
    async page() {
      calls.push("page");
      return { status: 200, url: `https://${active}/`, title: "Universite de Poitiers - connexion", text: "Identifiant Mot de passe" };
    },
  };
}

function finding(overrides: Partial<TyposquatFinding> = {}): TyposquatFinding {
  return {
    orgId: 42, orgName: "Universite de Poitiers", dept: "86",
    officialDomains: ["univ-poitiers.fr"], base: "univ-poitiers.fr", domain: BAD,
    kind: "omission", similarity: 0.95, a: ["192.0.2.10"], aaaa: [], cert: null,
    page: { status: 200, url: `https://${BAD}/`, title: "Universite de Poitiers - connexion", text: "Identifiant Mot de passe" },
    ...overrides,
  };
}

test("loadTopTargets passes ranked pagination to the Nouvelle-Aquitaine-only query", async () => {
  let sql = "";
  let params: unknown[] = [];
  const rows = await loadTopTargets({
    limit: 250, offset: 500,
    runner: async (text, p) => { sql = text; params = p; return { rows: [] }; },
  });
  assert.deepEqual(rows, []);
  assert.deepEqual(params, [250, 500]);
  for (const dept of ["16", "17", "18", "23", "24", "33", "40", "47", "64", "79", "86", "87"]) {
    assert.ok(TOP_TARGETS_SQL.includes(`'${dept}'`), `department ${dept} must be in scope`);
  }
  assert.ok(!sql.includes("'75'"), "Ile-de-France is out of scope");
});

test("mapTargetRows keeps one stable rank per official domain", () => {
  const rows = [
    { rank: "2", org_id: "9", label: "CHU de Poitiers", domain: "CHU-Poitiers.fr", dept: "86", effectif: "500" },
    { rank: "2", org_id: "9", label: "CHU de Poitiers", domain: "CHU-Poitiers.fr", dept: "86", effectif: "500" },
    { rank: "1", org_id: "7", label: "Universite de Poitiers", domain: "univ-poitiers.fr", dept: "86", effectif: null },
    { rank: "3", org_id: "8", label: "", domain: "no-label.fr", dept: "86", effectif: null },
  ];
  assert.deepEqual(mapTargetRows(rows), [
    { rank: 1, orgId: 7, orgName: "Universite de Poitiers", domain: "univ-poitiers.fr", dept: "86", effectif: null },
    { rank: 2, orgId: 9, orgName: "CHU de Poitiers", domain: "chu-poitiers.fr", dept: "86", effectif: 500 },
  ]);
});

test("buildVariants exhaustive mode keeps every generated typo plus the usual TLD candidates", () => {
  const all = genererVariantes(TARGET.domain, 1000);
  const exhaustive = buildVariants(TARGET, 1000);
  const typos = exhaustive.filter((v) => v.kind !== "tld");
  assert.equal(typos.length, all.length);
  assert.deepEqual(new Set(typos.map((v) => v.domain)), new Set(all.map((v: Variant) => v.domain)));
  assert.equal(exhaustive.length - typos.length, variantesTld(TARGET.domain).length);
  assert.ok(exhaustive.length > buildVariants(TARGET, 8).length);
});

test("buildVariants deduplicates typo and alternate-TLD candidates", () => {
  const variants = buildVariants(TARGET, 8);
  assert.ok(variants.length > 5);
  assert.ok(variants.some((v) => v.domain === BAD));
  assert.ok(variants.some((v) => v.domain === "univ-poitiers.com" && v.kind === "tld"));
  assert.equal(new Set(variants.map((v) => v.domain)).size, variants.length);
});

test("pageProof reports a copied brand with a credential form, not a parked page", () => {
  assert.equal(pageProof(finding()).confirmed, true);
  assert.equal(pageProof(finding({ page: { status: 200, url: `https://${BAD}/`, title: "Domain for sale", text: "Acheter ce domaine" } })).confirmed, false);
  assert.equal(pageProof(finding({ page: { status: 200, url: "https://www.univ-poitiers.fr/", title: "Universite de Poitiers", text: "connexion" } })).confirmed, false);
  assert.equal(pageProof(finding({ kind: "tld", domain: "univ-poitiers.com" })).confirmed, false);
  assert.equal(pageProof(finding({ page: { status: 200, url: `https://${BAD}/`, title: "Universite de Poitiers", text: "Lien connexion en pied de page" } })).confirmed, false);
  assert.equal(pageProof(finding({ orgName: "Blue Spirit Studio", page: { status: 200, url: `https://${BAD}/`, title: "Spirit-Pro (Martenss) - connexion", text: "Mot de passe" } })).confirmed, false);
});

test("scanTargets probes only DNS-active variants and keeps page evidence", async () => {
  const sonde = probe();
  const result = await scanTargets([TARGET], sonde, { now: NOW, maxVariantes: 8 });
  assert.equal(result.probes.dns, result.variants);
  assert.equal(result.probes.certificate, 1);
  assert.equal(result.probes.page, 1);
  assert.equal(result.detections.length, 1);
  assert.equal(result.detections[0]?.method, "page-evidence");
  assert.ok(result.detections[0]?.proof.includes("credential-form"));
  assert.equal(result.detections[0]?.finding.a[0], "192.0.2.10");
});

test("scanTargets measures false positives against naive alarms", async () => {
  const withProof = await scanTargets([TARGET], probe(), { now: NOW });
  assert.equal(isAlarm(withProof.active[0] as TyposquatFinding), true);
  assert.deepEqual([withProof.alarms, withProof.falsePositives, withProof.falsePositiveRate], [1, 0, 0]);

  const quiet = await scanTargets([TARGET], probe("univ-poitiers-other.fr"), { now: NOW });
  assert.equal(quiet.active.length, 0);
  assert.deepEqual([quiet.alarms, quiet.falsePositives, quiet.falsePositiveRate], [0, 0, 0]);
});
