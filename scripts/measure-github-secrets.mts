/**
 * Reproducible measurement of credential-shaped strings found in public GitHub
 * repositories of Nouvelle-Aquitaine organizations.
 *
 *   pnpm measure:github-secrets
 *   pnpm measure:github-secrets --json=bench/results/github-secrets-2026-11-22.json
 *
 * The command is offline and deterministic: it recomputes the counter from the
 * redacted evidence corpus. No credential value is ever read, reconstructed,
 * logged or written — the corpus holds fingerprints only.
 */
import { dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { summarizeCorpus, validateCorpus } from "../apps/api/src/github/corpus.js";
import { scanCode } from "../apps/api/src/github/secrets.js";

const argv = process.argv.slice(2);
const output =
  argv.find((argument) => argument.startsWith("--json="))?.slice("--json=".length) ??
  `bench/results/github-secrets-${new Date().toISOString().slice(0, 10)}.json`;

const corpus = validateCorpus(
  JSON.parse(readFileSync("db/data/github-na-secrets.json", "utf8")) as unknown,
);
const summary = summarizeCorpus(corpus);
const baseline = JSON.parse(
  readFileSync("bench/results/leaks-by-domain-2026-11-21.json", "utf8"),
) as { baseline: { organizations: number; sources: number; events: number } };

const result = {
  command: "pnpm measure:github-secrets",
  scope: "nouvelle-aquitaine",
  origin: "public-github",
  method: "SHA-256 fingerprints of credential-shaped strings in public code, deduplicated per organization",
  count: summary.count,
  byKind: summary.byKind,
  byOrg: summary.byOrg,
  organizationsScanned: corpus.organizations.length,
  organizationsWithFindings: summary.organizations,
  repositoriesScanned: summary.repositories,
  filesScanned: summary.filesScanned,
  records: summary.records,
  collectedAt: corpus.collectedAt,
  baseline: baseline.baseline,
  evidence: "db/data/github-na-secrets.json",
  publishedSecretValues: 0,
  measuredAt: new Date().toISOString(),
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (scanCode(serialized).length > 0) throw new Error("measurement output contains credential-shaped text");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, serialized);
console.log(
  `NA GitHub secrets: ${result.count} ` +
    `(orgs=${result.organizationsScanned}, repos=${result.repositoriesScanned}, ` +
    `files=${result.filesScanned}, baseline orgs=${baseline.baseline.organizations}, ` +
    `sources=${baseline.baseline.sources}, events=${baseline.baseline.events}) -> ${output}`,
);
