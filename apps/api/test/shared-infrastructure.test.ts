import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSharedInfrastructure,
  normalizeInfrastructure,
  type InfrastructureObservation,
} from "../src/analyse/shared-infrastructure.js";

const observation = (
  orgId: number,
  kind: InfrastructureObservation["kind"],
  value: string,
): InfrastructureObservation => ({ orgId, kind, value });

test("normalizes an onion URL to its host without port, path or case", () => {
  assert.equal(
    normalizeInfrastructure(observation(1, "leak_site", "HTTP://EverestOnion.ONION.:8080/blog/post/1?uuid=x")),
    "everestonion.onion",
  );
});

test("rejects claim aggregators so news indexes do not merge victims", () => {
  assert.equal(
    normalizeInfrastructure(observation(1, "claim_evidence", "https://www.ransomlook.io/site/view?uuid=1234")),
    null,
  );
  assert.equal(normalizeInfrastructure(observation(2, "event_source", "https://example.org")), null);
});

test("keeps DNS infrastructure values including provider hosts", () => {
  assert.equal(normalizeInfrastructure(observation(1, "dns_a", "217.160.0.138")), "217.160.0.138");
  assert.equal(normalizeInfrastructure(observation(2, "dns_mx", "mx0.mail.ovh.net.")), "mx0.mail.ovh.net");
});

test("clusters two distinct victims sharing one infrastructure anchor", () => {
  const result = detectSharedInfrastructure([
    observation(10, "leak_site", "http://everestabc.onion/blog"),
    observation(11, "leak_site", "https://everestabc.onion/other"),
  ]);
  assert.equal(result.clusterCount, 1);
  assert.deepEqual(result.clusters[0]?.victims, [10, 11]);
  assert.deepEqual(result.clusters[0]?.anchors.map((a) => a.value), ["everestabc.onion"]);
});

test("merges victims transitively through two distinct anchors", () => {
  const result = detectSharedInfrastructure([
    observation(1, "leak_site", "http://alphaaaaa.onion/"),
    observation(2, "leak_site", "http://alphaaaaa.onion/"),
    observation(2, "event_source", "http://bravobbbb.onion/"),
    observation(3, "event_source", "http://bravobbbb.onion/"),
  ]);
  assert.equal(result.clusterCount, 1);
  assert.deepEqual(result.clusters[0]?.victims, [1, 2, 3]);
  assert.equal(result.sharedAnchors, 2);
});

test("does not cluster infrastructure observed for a single victim", () => {
  const result = detectSharedInfrastructure([
    observation(1, "claim_evidence", "http://soloaaaa.onion/post/1"),
    observation(1, "claim_evidence", "http://solobbbb.onion/post/2"),
    observation(2, "claim_evidence", "http://solocccc.onion/post/3"),
  ]);
  assert.equal(result.clusterCount, 0);
  assert.equal(result.victimsInClusters, 0);
});

test("keeps per-victim URLs out of the published clusters", () => {
  const inputs: InfrastructureObservation[] = [
    observation(7, "claim_evidence", "http://sharedaaaa.onion/victim/private-path?mail=someone@example.org"),
    observation(8, "claim_evidence", "http://sharedaaaa.onion/victim/other-path?mail=other@example.org"),
  ];
  const result = detectSharedInfrastructure(inputs);
  assert.equal(JSON.stringify(result).includes("private-path"), false);
  assert.equal(JSON.stringify(result).includes("example.org"), false);
});

test("produces the same clusters regardless of observation order", () => {
  const inputs: InfrastructureObservation[] = [
    observation(2, "leak_site", "http://alphaaaaa.onion/"),
    observation(1, "dns_mx", "mx0.mail.ovh.net"),
    observation(3, "event_source", "http://alphaaaaa.onion/"),
    observation(2, "dns_mx", "mx0.mail.ovh.net"),
  ];
  const forward = detectSharedInfrastructure(inputs);
  const backward = detectSharedInfrastructure([...inputs].reverse());
  assert.deepEqual(forward.clusters, backward.clusters);
  assert.equal(forward.victimsInClusters, 3);
});
