/**
 * Reproducible measurement of the 3D live map frame rate.
 *
 * No live database, no sliding 30-day window: the workload comes from a
 * versioned fixture with an explicit seed and parameters. Two 2 s passes;
 * the published figure is the median frames per second. Output records the
 * fixture digest, generated corpus digest, timestamp and browser version.
 *
 *   pnpm measure:3d                 # full replay, writes bench/results/live-map-fps.json
 *   pnpm measure:3d -- --dry-run    # corpus/provenance check only, no browser
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const FIXTURE_PATH = "bench/fixtures/live-map-fps-corpus.json";
const FIXTURE_URL = new URL(`../${FIXTURE_PATH}`, import.meta.url);
const SOURCE_URL = new URL("../apps/web/src/map/live3d.ts", import.meta.url);
const OUTPUT_URL = new URL("../bench/results/live-map-fps.json", import.meta.url);
const DURATION_MS = 2000;
const RUNS = 2;

type LiveAttack = {
  id: string;
  family: string;
  assertionType: string;
  severity: number;
  observedAt: string;
  lat: number;
  lon: number;
  orgId: number | null;
  sourceId: string;
  dept: string | null;
};

type CorpusSpec = {
  schema: string;
  frozenAt: string;
  provenance: string;
  generator: string;
  seed: number;
  count: number;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  families: readonly string[];
  assertionTypes: readonly string[];
  severity: { min: number; max: number };
  observedAtStart: string;
  observedAtStepMinutes: number;
  depts: readonly string[];
  sourceIds: readonly string[];
  orgId: { start: number; step: number; nullEvery: number };
};

type Pass = { frames: number; ms: number; fps: number; p95FrameMs: number; draws: number };

/** Integer LCG: state = (1664525 * state + 1013904223) mod 2^32. */
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function loadCorpus(): { attacks: LiveAttack[]; corpus: Record<string, unknown> } {
  const bytes = readFileSync(FIXTURE_URL);
  const spec = JSON.parse(bytes.toString("utf8")) as CorpusSpec;
  if (spec.schema !== "live-map-fps-corpus/v1") throw new Error(`unsupported fixture schema: ${spec.schema}`);
  if (!Number.isInteger(spec.seed) || !Number.isInteger(spec.count) || spec.count <= 0) {
    throw new Error("fixture seed and count must be positive integers");
  }
  if (!spec.families.length || !spec.assertionTypes.length || !spec.depts.length || !spec.sourceIds.length) {
    throw new Error("fixture pools must not be empty");
  }
  if (spec.orgId.nullEvery <= 0) throw new Error("fixture orgId.nullEvery must be positive");

  const next = randomFrom(spec.seed);
  const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)]!;
  const attacks: LiveAttack[] = Array.from({ length: spec.count }, (_, i) => ({
    id: `fixture-${String(i + 1).padStart(4, "0")}`,
    family: pick(spec.families),
    assertionType: pick(spec.assertionTypes),
    severity: spec.severity.min + Math.floor(next() * (spec.severity.max - spec.severity.min + 1)),
    observedAt: new Date(Date.parse(spec.observedAtStart) + i * spec.observedAtStepMinutes * 60_000).toISOString(),
    lat: round6(spec.bbox.minLat + next() * (spec.bbox.maxLat - spec.bbox.minLat)),
    lon: round6(spec.bbox.minLon + next() * (spec.bbox.maxLon - spec.bbox.minLon)),
    orgId: i % spec.orgId.nullEvery === 0 ? null : spec.orgId.start + i * spec.orgId.step,
    sourceId: pick(spec.sourceIds),
    dept: pick(spec.depts),
  }));

  return {
    attacks,
    corpus: {
      fixture: FIXTURE_PATH,
      fixtureSha256: createHash("sha256").update(bytes).digest("hex"),
      attacksSha256: createHash("sha256").update(JSON.stringify(attacks)).digest("hex"),
      frozenAt: spec.frozenAt,
      provenance: spec.provenance,
      generator: spec.generator,
      seed: spec.seed,
      params: {
        count: spec.count,
        bbox: spec.bbox,
        families: spec.families,
        assertionTypes: spec.assertionTypes,
        severity: spec.severity,
        observedAtStart: spec.observedAtStart,
        observedAtStepMinutes: spec.observedAtStepMinutes,
        depts: spec.depts,
        sourceIds: spec.sourceIds,
        orgId: spec.orgId,
      },
    },
  };
}

async function main(): Promise<void> {
  const { attacks, corpus } = loadCorpus();
  if (process.argv.includes("--dry-run")) {
    console.log(`Fixture: ${FIXTURE_PATH} sha256 ${corpus.fixtureSha256}`);
    console.log(`Corpus: ${attacks.length} attacks sha256 ${corpus.attacksSha256}`);
    console.log(`Generator: ${corpus.generator} seed ${corpus.seed}`);
    return;
  }

  const { chromium } = await import("../apps/web/node_modules/@playwright/test/index.mjs");
  const require = createRequire(new URL("./package.json", import.meta.url));
  const ts = require("../apps/web/node_modules/typescript") as {
    transpileModule(source: string, options: { compilerOptions: { module: number; target: number } }): { outputText: string };
    ModuleKind: { CommonJS: number };
    ScriptTarget: { ES2022: number };
  };
  const source = readFileSync(SOURCE_URL, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const browserVersion = browser.version();
  const passes: Pass[] = [];
  try {
    const page = await browser.newPage();
    await page.setContent("<canvas id='map' width='1280' height='720'></canvas>");
    await page.addScriptTag({ content: `(function(){ const exports = {}; ${code}; window.Live3D = exports; })()` });
    // tsx/esbuild injects `__name` into functions serialized by Playwright.
    await page.evaluate("window.__name = (fn) => fn");
    for (let run = 0; run < RUNS; run++) {
      const result = await page.evaluate(async ({ attacks: rows, duration }) => {
        const canvas = document.querySelector("canvas")!;
        const gl = canvas.getContext("webgl2", { antialias: false });
        if (!gl) throw new Error("WebGL2 unavailable in the measurement browser");
        const renderer = new window.Live3D.LiveAttackRenderer(gl);
        renderer.setAttacks(rows);
        if (renderer.attackCount !== rows.length) throw new Error("attack upload mismatch");
        const points = rows.map((a) => window.Live3D.mercator(a.lon, a.lat));
        const xs = points.map((p) => p[0]);
        const ys = points.map((p) => p[1]);
        const minX = Math.min(...xs); const maxX = Math.max(...xs);
        const minY = Math.min(...ys); const maxY = Math.max(...ys);
        const sx = 1.6 / Math.max(maxX - minX, 1e-6);
        const sy = 1.6 / Math.max(maxY - minY, 1e-6);
        const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
        const matrix = new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, -cx * sx, -cy * sy, 0, 1]);

        const intervals: number[] = [];
        const started = performance.now();
        let last = started;
        await new Promise<void>((resolve) => {
          const frame = (now: number) => {
            renderer.draw(matrix, now);
            intervals.push(now - last);
            last = now;
            if (now - started < duration) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        const elapsed = last - started;
        const sorted = intervals.slice(1).sort((a, b) => a - b);
        const error = gl.getError();
        if (error !== 0) throw new Error(`WebGL error ${error}`);
        const frames = intervals.length;
        const result = {
          frames,
          ms: Math.round(elapsed * 100) / 100,
          fps: Math.round(frames * 100000 / elapsed) / 100,
          p95FrameMs: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 100) / 100,
          draws: renderer.frames,
        };
        renderer.dispose();
        return result;
      }, { attacks, duration: DURATION_MS });
      passes.push(result);
    }
  } finally {
    await browser.close();
  }

  const fpsValues = passes.map((p) => p.fps).sort((a, b) => a - b);
  const fps = fpsValues[Math.floor(fpsValues.length / 2)]!;
  const payload = {
    command: "pnpm measure:3d",
    measuredAt: new Date().toISOString(),
    corpus,
    source: `frozen seeded corpus: ${attacks.length} attacks (${FIXTURE_PATH}, sha256 ${corpus.attacksSha256})`,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    browser: {
      engine: "Chromium",
      version: browserVersion,
      headless: true,
      webgl: "WebGL2 (SwiftShader)",
      viewport: "1280x720",
    },
    durationMsPerPass: DURATION_MS,
    runs: RUNS,
    passes,
    fps,
    targetFps: 60,
    targetReached: fps >= 60,
  };
  writeFileSync(OUTPUT_URL, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Corpus: ${attacks.length} attacks, sha256 ${corpus.attacksSha256}`);
  console.log(`Measured frame rate: ${fps} fps (target 60 fps) — ${payload.targetReached ? "REACHED" : "NOT REACHED"}`);
  console.log(`Details: ${passes.map((p) => `${p.fps} fps, p95 ${p.p95FrameMs} ms`).join(" | ")}`);
  console.log(`Output: ${OUTPUT_URL.pathname}`);
}

await main();
