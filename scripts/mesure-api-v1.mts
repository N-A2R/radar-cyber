/**
 * Mesure reproductible de la publication de l'API v1 stable.
 * Aucune base, aucun réseau : la mesure porte sur le contrat publié.
 *
 *   pnpm mesure:api-v1
 *   pnpm mesure:api-v1 --json=bench/results/api-v1-stable.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { OPERATIONS } from "../apps/api/src/openapi/catalog.js";
import { checkCompatibility } from "../apps/api/src/openapi/contract.js";
import { V1_CONTRACT } from "../apps/api/src/openapi/v1-contract.js";
import { buildOpenApi, documentedRouteCount } from "../apps/api/src/openapi/spec.js";
import { COMPATIBILITY_POLICY, STABILITY } from "../apps/api/src/openapi/stability.js";
import { API_VERSION } from "../apps/api/src/openapi/version.js";

const output =
  process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length) ??
  "bench/results/api-v1-stable.json";

const report = checkCompatibility(V1_CONTRACT, OPERATIONS);
const spec = buildOpenApi();
const baseline = JSON.parse(
  readFileSync(new URL("../bench/results/couverture-mesuree.json", import.meta.url), "utf8"),
) as { base: { organisations: string; sources: string; evenements: string } };

const result = {
  version: API_VERSION,
  stability: STABILITY,
  baseline: {
    organisations: Number(baseline.base.organisations),
    sources: Number(baseline.base.sources),
    evenements: Number(baseline.base.evenements),
    provenance: "bench/results/couverture-mesuree.json",
  },
  contract: {
    version: V1_CONTRACT.version,
    frozenAt: V1_CONTRACT.frozenAt,
    frozenOperations: report.frozen,
    liveOperations: report.live,
    addedOperations: report.added,
    breakingChanges: report.breaking,
    digest: V1_CONTRACT.digest,
    liveDigest: report.digest,
    digestMatches: report.digestMatches,
  },
  publication: {
    openapi: spec.openapi,
    documentedOperations: documentedRouteCount(spec),
    xStability: spec.info["x-stability"],
    compatibilityRules: COMPATIBILITY_POLICY.rules.length,
    prefixes: (spec.servers as { url: string }[]).map((server) => server.url),
  },
  verdict:
    report.stable && report.digestMatches && spec.info["x-stability"] === STABILITY
      ? "stable"
      : "non stable",
};

writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `${result.verdict}: v${result.version} — ${report.frozen}/${report.live} opérations figées, ` +
    `${report.breaking.length} rupture(s), digest ${report.digestMatches ? "identique" : "différent"}`,
);
console.log(JSON.stringify(result, null, 2));
