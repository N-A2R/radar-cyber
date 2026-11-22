/**
 * Reproducible J-21 precision measurement on 100 Nouvelle-Aquitaine incidents.
 *
 *   npm run measure:anticipation:precision-100
 *   npm run measure:anticipation:precision-100 -- --check
 *
 * Reads only versioned files. No network, no paid service, no victim personal
 * data in the output. `--check` fails when the generated report differs.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  computePrecision,
  renderFrenchReport,
  type Incident100,
} from "../apps/api/src/analyse/precision-anticipation.js";
import { lireInstantanes } from "../apps/api/src/analyse/rapport-anticipation.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const argv = process.argv.slice(2);
const option = (name: string, fallback: string) =>
  argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const check = argv.includes("--check");

const corpusPath = option("corpus", `${ROOT}bench/anticipation/corpus-100.json`);
const snapshotPath = option("snapshot", `${ROOT}bench/anticipation/J-21-100.jsonl`);
const jsonPath = option("json", `${ROOT}bench/results/precision-anticipation-100.json`);
const reportPath = option("report", `${ROOT}docs/anticipation-precision-100.md`);
const corpusText = readFileSync(corpusPath, "utf8");
const parsed: unknown = JSON.parse(corpusText);
if (
  typeof parsed !== "object" ||
  parsed === null ||
  !("incidents" in parsed) ||
  !Array.isArray(parsed.incidents)
) {
  throw new Error(`${corpusPath} must contain an incidents array`);
}
const corpus = parsed.incidents as Incident100[];
const snapshotText = readFileSync(snapshotPath, "utf8");
const snapshots = lireInstantanes(snapshotText);
const result = computePrecision({ corpus, snapshots });
const report = renderFrenchReport(result);
const hashes = {
  corpus: createHash("sha256").update(corpusText).digest("hex"),
  snapshot: createHash("sha256").update(snapshotText).digest("hex"),
};

if (check) {
  const current = readFileSync(reportPath, "utf8");
  if (current !== report) {
    console.error(`${reportPath.slice(ROOT.length)} is out of date; regenerate it.`);
    process.exitCode = 1;
  } else {
    console.log(`report matches inputs: ${result.decisionPrecision} decision precision`);
  }
} else {
  writeFileSync(reportPath, report, "utf8");
  writeFileSync(
    jsonPath,
    `${JSON.stringify({ hashes, ...result }, null, 2)}\n`,
    "utf8",
  );
  console.log(`incidents: ${result.incidents}`);
  console.log(`signals emitted: ${result.signalsEmitted}`);
  console.log(`decision precision: ${result.decisionPrecision}`);
  console.log(`detection precision: ${result.detectionPrecision ?? "not estimable"}`);
  console.log(`report: ${reportPath.slice(ROOT.length)}`);
}
