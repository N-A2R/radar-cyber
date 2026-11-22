/** Check the measured crisis-communication objective against the saved result. */
import { readFileSync } from "node:fs";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { assessObjective } = await import("../apps/api/src/crisis-communications/objective.js");

const path = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
  ?? "bench/results/communications-crise-2026-11-22.json";
const payload = JSON.parse(readFileSync(path, "utf8")) as {
  result: { detections: number; datedDelays: number };
  corpus: { pressPagesAccepted: number; outsideNaAccepted: number };
};
const verdict = assessObjective({
  detections: payload.result.detections,
  datedDetections: payload.result.datedDelays,
  pressPagesAccepted: payload.corpus.pressPagesAccepted,
  outsideNaAccepted: payload.corpus.outsideNaAccepted,
});
for (const check of verdict.checks) {
  console.log(`${check.passed ? "OK  " : "FAIL"} ${check.label}: ${check.observed} (expected ${check.expected})`);
}
console.log(verdict.met ? "OBJECTIVE MET" : "OBJECTIVE NOT MET");
if (!verdict.met) process.exitCode = 1;
