/**
 * Reproducible measurement of the deliverable: both SDKs with executable
 * examples, run against the live API, plus one test per SDK behavior.
 *
 * Usage: RADAR_API_BASE_URL=http://127.0.0.1:8080/api pnpm measure:sdks
 * Every spawned command is bounded to 45 s (no command exceeds 60 s).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TSX = fileURLToPath(new URL("../apps/api/node_modules/.bin/tsx", import.meta.url));
const API = process.env.RADAR_API_BASE_URL ?? "http://127.0.0.1:8080/api";
const ENV = { ...process.env, RADAR_API_BASE_URL: API };

type CommandResult = { ok: boolean; stdout: string; stderr: string; status: number | null };

function run(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: ENV,
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function parseFields(output: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const token of output.split(/\s+/)) {
    const separator = token.indexOf("=");
    if (separator > 0) fields[token.slice(0, separator)] = token.slice(separator + 1);
  }
  return fields;
}

function positiveInt(value: string | undefined): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

const tsTests = readdirSync(`${ROOT}sdks/typescript/test`)
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => `sdks/typescript/test/${file}`)
  .sort();

const commands = {
  exampleTypescript: () => run(TSX, ["sdks/typescript/examples/overview.ts"]),
  examplePython: () => run("python3", ["sdks/python/examples/overview.py"]),
  testsTypescript: () => run(TSX, ["--test", ...tsTests]),
  testsPython: () => run("python3", ["-m", "unittest", "discover", "-s", "sdks/python/tests", "-v"]),
};

const failures: string[] = [];
const examples: Record<string, { ok: boolean; organisations: number; sources: number; events: number }> = {};
const counts: Record<string, { ok: boolean; passed: number; failed: number }> = {};

for (const [name, command] of Object.entries(commands)) {
  const result = command();
  if (!result.ok) {
    failures.push(`${name}: exit ${result.status}; ${result.stderr.slice(-800) || result.stdout.slice(-800)}`);
  }
  if (name.startsWith("example")) {
    const fields = parseFields(result.stdout);
    const sdk = name === "exampleTypescript" ? "typescript" : "python";
    examples[sdk] = {
      ok: result.ok && fields.status === "OK" && fields.scope === "NA" && fields.sdk === sdk,
      organisations: positiveInt(fields.organisations),
      sources: positiveInt(fields.sources),
      events: positiveInt(fields.events),
    };
    if (examples[sdk].organisations === 0 || examples[sdk].sources === 0 || examples[sdk].events === 0) {
      failures.push(`${name}: live counters missing from example output`);
    }
  }
  if (name.startsWith("tests")) {
    const pass = /^# pass (\d+)$/m.exec(result.stdout);
    const fail = /^# fail (\d+)$/m.exec(result.stdout);
    const ran = /^Ran (\d+) tests?/m.exec(result.stderr);
    const pythonOk = /^OK$/m.test(result.stderr);
    counts[name] = name === "testsTypescript"
      ? { ok: result.ok && Number(fail?.[1] ?? 1) === 0, passed: Number(pass?.[1] ?? 0), failed: Number(fail?.[1] ?? 0) }
      : { ok: pythonOk && /FAILED/.test(result.stderr) === false, passed: pythonOk ? Number(ran?.[1] ?? 0) : 0, failed: pythonOk ? 0 : 1 };
    if (!counts[name].ok || counts[name].passed === 0) failures.push(`${name}: no clean pass reported`);
  }
}

for (const key of ["organisations", "sources", "events"] as const) {
  if (examples.typescript[key] !== examples.python[key]) {
    failures.push(`${key}: TypeScript and Python examples disagree`);
  }
}

const examplesOk = Object.values(examples).filter((example) => example.ok).length;
const testsPassed = counts.testsTypescript.passed + counts.testsPython.passed;
const testsExpected = counts.testsTypescript.passed + counts.testsTypescript.failed + counts.testsPython.passed + counts.testsPython.failed;
const summary = {
  api: API,
  examples_executable: `${examplesOk}/2`,
  tests_passed: `${testsPassed}/${testsExpected}`,
  live: examples.typescript,
  failures,
};
const jsonArg = process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length);
if (jsonArg) {
  const target = jsonArg.startsWith("/") ? jsonArg : `${ROOT}${jsonArg}`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(`MEASURE examples_executable=${summary.examples_executable}`);
console.log(`MEASURE tests_passed=${summary.tests_passed}`);
console.log(`MEASURE live=${examples.typescript.organisations}/${examples.typescript.sources}/${examples.typescript.events}`);
console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0 || examplesOk !== 2 || testsPassed !== testsExpected) process.exit(1);
