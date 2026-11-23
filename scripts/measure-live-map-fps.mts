/**
 * Reproducible measurement of the 3D live map frame rate.
 *
 * Real database (`radar`), Nouvelle-Aquitaine attacks from the last 30 days,
 * WebGL2 in headless Chromium. Two 2 s passes; the published figure is the
 * median frames per second.
 *
 *   pnpm measure:3d
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "../apps/web/node_modules/@playwright/test/index.mjs";
import { closePools, query } from "../apps/api/src/db.js";
import {
  LIVE_ATTACK_SQL,
  liveAttackParams,
  toLiveAttack,
  type LiveAttack,
} from "../apps/api/src/live/attacks.js";

const require = createRequire(new URL("./package.json", import.meta.url));
const ts = require("../apps/web/node_modules/typescript") as typeof import("typescript");
const SOURCE_URL = new URL("../apps/web/src/map/live3d.ts", import.meta.url);
const OUTPUT_URL = new URL("../bench/results/live-map-fps.json", import.meta.url);
const DURATION_MS = 2000;
const RUNS = 2;

type Pass = { frames: number; ms: number; fps: number; p95FrameMs: number; draws: number };

async function main(): Promise<void> {
  const attacksResult = await query<Record<string, unknown>>(LIVE_ATTACK_SQL, liveAttackParams());
  const attacks = attacksResult.rows.map(toLiveAttack)
    .filter((a): a is LiveAttack => a !== null);
  if (attacks.length === 0) throw new Error("no real Nouvelle-Aquitaine attack in the live window");

  const counts = await query<{ orgs: string; sources: string; events: string }>(
    `SELECT (SELECT count(*)::text FROM org) AS orgs,
            (SELECT count(*)::text FROM source) AS sources,
            (SELECT count(*)::text FROM event) AS events`,
  );
  const base = counts.rows[0]!;

  const source = readFileSync(SOURCE_URL, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
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
    source: `live database: ${attacks.length} ongoing Nouvelle-Aquitaine attacks`,
    database: { orgs: Number(base.orgs), sources: Number(base.sources), events: Number(base.events) },
    browser: "Chromium headless, WebGL2 (SwiftShader), 1280x720",
    durationMsPerPass: DURATION_MS,
    passes,
    fps,
    targetFps: 60,
    targetReached: fps >= 60,
  };
  writeFileSync(OUTPUT_URL, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Real attacks: ${attacks.length} (database: ${base.orgs} orgs, ${base.sources} sources, ${base.events} events)`);
  console.log(`Measured frame rate: ${fps} fps (target 60 fps) — ${payload.targetReached ? "REACHED" : "NOT REACHED"}`);
  console.log(`Details: ${passes.map((p) => `${p.fps} fps, p95 ${p.p95FrameMs} ms`).join(" | ")}`);
  await closePools();
}

await main();
