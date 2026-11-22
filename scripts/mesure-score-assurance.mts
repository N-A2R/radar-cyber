/**
 * Reproducible measurement of the organization insurance score.
 *
 * Reads the real local database, scores every Nouvelle-Aquitaine organization
 * with the published formula, and writes the raw result plus its checksum.
 * No network call, no paid service, no victim data.
 *
 *   pnpm measure:insurance-score
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { loadInsuranceCorpus, loadInsuranceGroups } from "../apps/api/src/insurance/query.js";
import { computeInsuranceScore, INSURANCE_SCORE_VERSION, SCORE_WEIGHTS } from "../apps/api/src/insurance/score.js";

const OUTPUT = "bench/results/insurance-score.json";
const REFERENCE = "docs/score-assurance-organisation.md";

const corpus = await loadInsuranceCorpus();
const groups = await loadInsuranceGroups(corpus.referenceDate);

let organizationsScored = 0;
let organizationsWithIncidents = 0;
let organizationsWithEvidence = 0;
const distribution = Array.from({ length: 11 }, (_, index) => ({
  bucket: index === 10 ? "100" : `${index * 10}-${index * 10 + 9}`,
  organizations: 0,
}));
const componentTotals = Object.fromEntries(Object.keys(SCORE_WEIGHTS).map((key) => [key, 0]));
const sourceIds = new Set<string>();
const fingerprint: unknown[] = [];

for (const group of groups) {
  const scored = computeInsuranceScore({
    sirenPresent: group.sirenPresent,
    nafPresent: group.nafPresent,
    coordinatesPresent: group.coordinatesPresent,
    registryIdentifierPresent: group.registryIdentifierPresent,
    workforce: group.workforce,
    incidentCount: group.incidentCount,
    maxIncidentSeverity: group.maxIncidentSeverity,
    ambientCount: group.ambientCount,
    distinctSources: group.distinctSources,
    sectorClaimRate: group.sectorClaimRate,
    overallClaimRate: group.overallClaimRate,
  });
  const weight = group.organizationCount;
  organizationsScored += weight;
  if (group.incidentCount > 0) organizationsWithIncidents += weight;
  if (group.distinctSources > 0) organizationsWithEvidence += weight;
  distribution[Math.min(10, Math.floor(scored.score / 10))].organizations += weight;
  for (const component of scored.components) {
    componentTotals[component.key] += component.points * weight;
  }
  for (const id of group.sourceIds) sourceIds.add(id);
  fingerprint.push([
    group.sector, group.sirenPresent, group.nafPresent, group.coordinatesPresent,
    group.registryIdentifierPresent, group.workforce, group.incidentCount,
    group.maxIncidentSeverity, group.ambientCount, group.distinctSources,
    Number(group.sectorClaimRate.toFixed(12)), Number(group.overallClaimRate.toFixed(12)),
    weight, scored.score,
  ]);
}

fingerprint.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const checksum = createHash("sha256").update(JSON.stringify({
  referenceDate: corpus.referenceDate,
  version: INSURANCE_SCORE_VERSION,
  fingerprint,
})).digest("hex");

const result = {
  schemaVersion: 1,
  scoreVersion: INSURANCE_SCORE_VERSION,
  measuredAt: new Date().toISOString(),
  referenceDate: corpus.referenceDate,
  methodology: REFERENCE,
  reproduce: "pnpm measure:insurance-score",
  objective: {
    description: "a comparable and auditable insurance score for every Nouvelle-Aquitaine organization",
    achieved: organizationsScored === corpus.naOrganizations,
    organizationsScored,
    naOrganizations: corpus.naOrganizations,
    coveragePercent: Number((100 * organizationsScored / corpus.naOrganizations).toFixed(4)),
  },
  corpus: {
    organizations: corpus.organizations,
    sources: corpus.sources,
    activeSources: corpus.activeSources,
    events: corpus.events,
    attachedEvents: corpus.attachedEvents,
    inputGroups: groups.length,
  },
  evidence: {
    organizationsWithIncidents,
    organizationsWithEvidence,
    distinctSourceIds: sourceIds.size,
    greySourcesIncluded: true,
    victimDataUsed: false,
    paidServicesUsed: false,
  },
  distribution,
  componentAverages: Object.fromEntries(
    Object.entries(componentTotals).map(([key, total]) => [
      key,
      Number((total / organizationsScored).toFixed(4)),
    ]),
  ),
  checksum,
};

await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(`OBJECTIVE: ${result.objective.achieved ? "reached" : "NOT reached"} — ${organizationsScored.toLocaleString("en-US")} / ${corpus.naOrganizations.toLocaleString("en-US")} NA organizations scored (${result.objective.coveragePercent}%)`);
console.log(`Reference date: ${corpus.referenceDate}; input groups: ${groups.length}; distinct sources: ${sourceIds.size}`);
console.log(`Mean components: ${JSON.stringify(result.componentAverages)}`);
console.log(`Checksum: ${checksum}`);
console.log(`Written: ${OUTPUT}`);
