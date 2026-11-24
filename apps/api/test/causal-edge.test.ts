/**
 * Chaînes fournisseur → victime : le critère brut, la construction pure et le
 * rafraîchissement idempotent depuis les tables vivantes.
 *
 * Le jeu de 40 observations versionné par la migration 227 est vérifié tel quel
 * dans une base neuve ; le test d'intégration ajoute ensuite une observation
 * locale, sans donnée personnelle ni source nationale présentée comme locale.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";
import { buildSupplyChainEdge } from "../src/graph/causal-edge.js";
import { JUDGE_SQL, refreshCausalEdges } from "../src/graph/causal-edge-store.js";

const TAG = `ce${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DOMAIN = `${TAG}.example`;
const PROVIDER_SUFFIX = `${TAG}-provider.example`;
const FIRST_SEEN = "2026-06-11T09:30:00Z";
let orgId: number;

before(async () => {
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain) VALUES ($1, $2, 'entreprise', '33', $3) RETURNING id`,
    [`Org test ${TAG}`, `org-${TAG}`, DOMAIN],
  );
  orgId = org.rows[0]!.id;

  await query(
    `INSERT INTO dns_fournisseur (suffix, name, category, mode)
     VALUES ($1, $2, 'dns', 'suffix')`,
    [PROVIDER_SUFFIX, `Test Provider ${TAG}`],
  );
  await query(
    `INSERT INTO provider_domain (domain, org_ids, ns, mx, observed_at)
     VALUES ($1, $2::int[], $3::text[], '{}'::text[], $4)`,
    [DOMAIN, [orgId], [`ns1.${PROVIDER_SUFFIX}`], "2026-11-20T12:00:00Z"],
  );
  await query(
    `INSERT INTO ct_anomalie
       (certificat_id, motif, cible, domaine, whitelist_version, source, premiere_vue)
     VALUES ($1, 'wildcard', $2, $2, 'test', 'crt.sh', $3)`,
    [`cert-${TAG}`, DOMAIN, FIRST_SEEN],
  );
});

after(async () => {
  await query("DELETE FROM ct_anomalie WHERE certificat_id = $1", [`cert-${TAG}`]);
  await query("DELETE FROM provider_domain WHERE domain = $1", [DOMAIN]);
  await query("DELETE FROM dns_fournisseur WHERE suffix = $1", [PROVIDER_SUFFIX]);
  await query(
    `DELETE FROM causal_edge WHERE evidence->>'domain' = $1`,
    [DOMAIN],
  );
  await query("DELETE FROM org WHERE id = $1", [orgId]);
});

test("la migration livre au moins 30 chemins datés, sans exécuter le refresh", async () => {
  const result = await query<{ count: string }>(JUDGE_SQL);
  assert.ok(Number(result.rows[0]!.count) >= 30, `critère brut : ${result.rows[0]!.count}`);
});

test("le constructeur exige deux preuves horodatées et le périmètre NA", () => {
  const base = {
    provider: "OVHcloud",
    domain: "exemple.fr",
    orgId: 42,
    dept: "33",
    firstSeenAt: new Date("2026-06-11T09:30:00.123Z"),
    observedAt: "2026-11-20T12:00:00Z",
    indicatorId: 7,
    indicatorMotif: "wildcard",
    indicatorSource: "crt.sh",
  };
  const edge = buildSupplyChainEdge(base);
  assert.ok(edge);
  assert.equal(edge.relationType, "supply_chain");
  assert.equal(edge.pathLength, 2);
  assert.deepEqual(edge.path, ["provider:ovhcloud", "domain:exemple.fr", "org:42"]);
  assert.equal(edge.evidence.first_seen_at, FIRST_SEEN);
  assert.equal(edge.evidence.portee_source, "globale");
  assert.equal(edge.evidence.ancrage, "organisation_na");

  assert.equal(buildSupplyChainEdge({ ...base, firstSeenAt: "pas-une-date" }), null);
  assert.equal(buildSupplyChainEdge({ ...base, dept: "75" }), null);
  assert.equal(buildSupplyChainEdge({ ...base, indicatorMotif: "" }), null);
});

test("le refresh ajoute le chemin observé une seule fois", async () => {
  const first = await refreshCausalEdges({ query });
  assert.ok(first.observed >= 1);
  assert.equal(first.inserted, 1);
  assert.ok(first.judgeCount >= 31);

  const stored = await query<{
    source_id: string;
    target_id: string;
    path_length: number;
    evidence: Record<string, string>;
  }>(
    `SELECT source_id, target_id, path_length, evidence FROM causal_edge
      WHERE evidence->>'domain' = $1`,
    [DOMAIN],
  );
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0]!.target_id, `org:${orgId}`);
  assert.equal(stored.rows[0]!.source_id, `provider:test-provider-${TAG}`);
  assert.equal(stored.rows[0]!.path_length, 2);
  assert.equal(stored.rows[0]!.evidence.first_seen_at, FIRST_SEEN);
  assert.equal(stored.rows[0]!.evidence.portee_source, "globale");
  assert.equal(stored.rows[0]!.evidence.catalogue, "dns_fournisseur");

  const second = await refreshCausalEdges({ query });
  assert.equal(second.inserted, 0);
  assert.equal(second.judgeCount, first.judgeCount);
});
