/**
 * Reproducible, offline measurement of the region-wide sector security index.
 *
 * Inputs are frozen, versioned observations produced from public free sources:
 *   - organisation counts: bench/results/sector-organizations-na.json
 *   - DNS/TLS observations: bench/corpus/security-observations-na.jsonl
 *   - CVE disclosure dates: bench/corpus/cve-na-window.jsonl
 *
 * Usage:
 *   pnpm mesure:securite-secteurs
 *   pnpm mesure:securite-secteurs -- --json bench/results/security-sector-index-na.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { measurePatchLagDays } from "../apps/api/src/security/patchLag.js";
import {
  computeSectorIndices,
  SECTORS,
  type Sector,
  type SectorIndexReport,
  type SignalObservation,
} from "../apps/api/src/security/sectorIndex.js";

type FrozenCounts = {
  total: number;
  organizations: Partial<Record<Sector, number>>;
};


function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function option(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}


export function buildReport(
  counts: FrozenCounts,
  observations: readonly SignalObservation[],
  patchLagDays: number,
): SectorIndexReport {
  const organizations: Partial<Record<Sector, number>> = {};
  for (const sector of SECTORS) organizations[sector] = counts.organizations[sector];
  return computeSectorIndices({ organizations, observations, patchLagDays });
}

function main(): void {
  const countsPath = option("counts", "bench/results/sector-organizations-na.json");
  const observationsPath = option("observations", "bench/corpus/security-observations-na.jsonl");
  const cvePath = option("cve-corpus", "bench/corpus/cve-na-window.jsonl");
  const techPath = option("technologies", "bench/corpus/cve-na-technologies.json");
  const alertsPath = option("alerts", "bench/corpus/cve-na-official-alerts.json");
  const output = option("json", "bench/results/security-sector-index-na.json");

  const counts = readJson<FrozenCounts>(countsPath);
  const observations = readJsonl<SignalObservation>(observationsPath);
  const cves = readJsonl<NvdCveRecord>(cvePath);
  const technologies = readJson<{ technologies: TechnologyObservation[]; capturedAt: string }>(techPath);
  const alerts = readJson<AlertCorpus>(alertsPath);

  const declared = Object.values(counts.organizations).reduce((sum, value) => sum + (value ?? 0), 0);
  if (declared !== counts.total) {
    throw new Error(`Organisation total mismatch: ${declared} vs ${counts.total}`);
  }
  if (observations.length === 0) {
    throw new Error(`No security observations in ${observationsPath}; run the collector first`);
  }

  const patchLag = measurePatchLagDays(
    cves,
    technologies.technologies,
    alerts,
    technologies.capturedAt,
  );
  const report = buildReport(counts, observations, patchLag.days);

  writeFileSync(output, `${JSON.stringify({ ...report, relevantCves: patchLag.relevantCves }, null, 2)}\n`);

  console.log(`Scope: ${report.scope}`);
  console.log(`Organisations covered: ${report.totalOrganizations.toLocaleString("en-US")}`);
  console.log(`Sectors indexed: ${report.sectorsIndexed}/${SECTORS.length}`);
  console.log(`Patch lag: ${report.patchLagDays} days (${patchLag.relevantCves} relevant CVEs)`);
  console.log("");
  console.log("| Sector | Index | Orgs | Basis | Hosts | TLS | SPF | DMARC |");
  console.log("|---|---:|---:|---|---:|---:|---:|---:|");
  for (const sector of report.sectors) {
    console.log(`| ${sector.sector} | ${sector.index} | ${sector.organizations} | ${sector.basis} | ${sector.measuredHosts} | ${sector.tlsScore} | ${sector.spfScore} | ${sector.dmarcScore} |`);
  }
  console.log("");
  console.log(`Written to ${output}`);
}

main();
