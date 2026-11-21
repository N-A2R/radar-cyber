/**
 * Preuve de déploiement : l'API sert l'interface construite à `/` et la sonde
 * `/api/health`, exactement comme après `scripts/install.sh` sur une machine
 * neuve. Le front est compilé dans un répertoire jetable, l'API est lancée sur
 * un port de test (>= 18100) avec la base jetable du harnais, puis le script
 * d'installation rejoue sa propre vérification en mode `--check`.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const API_DIR = fileURLToPath(new URL("../", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
let port = 0;
let dist = "";
let logs = "";
let api: ChildProcess | null = null;

async function freePort(): Promise<number> {
  for (let candidate = 18100; candidate < 18200; candidate++) {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(candidate, "127.0.0.1", () => server.close(() => resolve(true)));
    if (await promise) return candidate;
  }
  throw new Error("aucun port libre entre 18100 et 18199");
}

before(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL absent (lancer via test/run.ts)");
  port = await freePort();
  const work = await mkdtemp(join(tmpdir(), "radar-deploiement-"));
  dist = join(work, "dist");
  execFileSync(
    "pnpm",
    ["-F", "@radar/web", "exec", "vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 }
  );
  api = spawn(TSX, ["src/server.ts"], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
      PORT: String(port),
      HOST: "127.0.0.1",
      RADAR_WEB_DIST: dist,
      RADAR_COLLECT: "0",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout?.on("data", (b: Buffer) => { logs += b.toString(); });
  api.stderr?.on("data", (b: Buffer) => { logs += b.toString(); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw new Error(`API terminée (${api.exitCode}) : ${logs.slice(-2000)}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.status === 200) return;
    } catch { /* pas encore prête */ }
    // Attente réelle : on sonde un processus externe, pas une horloge simulée.
    const { promise: pause, resolve: onPause } = Promise.withResolvers<void>();
    setTimeout(onPause, 250);
    await pause;
  }
  throw new Error(`API démarrée sur ${port} mais /api/health muet : ${logs.slice(-2000)}`);
});

after(async () => {
  if (api && api.exitCode === null) {
    const { promise: exited, resolve } = Promise.withResolvers<void>();
    api.once("exit", () => resolve());
    api.kill("SIGTERM");
    const { promise: timeout, resolve: onTimeout } = Promise.withResolvers<void>();
    const timer = setTimeout(onTimeout, 5000);
    await Promise.race([exited, timeout]);
    clearTimeout(timer);
    if (api.exitCode === null) api.kill("SIGKILL");
  }
  if (dist) await rm(dist.replace(/\/dist$/, ""), { recursive: true, force: true });
});

test("déploiement : / et /api/health répondent 200", async () => {
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json() as { ok: boolean }).ok, true);

  const root = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /id="root"/);
});

test("install.sh --check prouve les deux points d'entrée", (t) => {
  const output = execFileSync(
    "bash",
    ["scripts/install.sh", "--check", "--api-port", String(port)],
    { cwd: ROOT, encoding: "utf8", timeout: 20_000 }
  );
  assert.match(output, /\/api\/health → HTTP 200/);
  t.diagnostic(output.trim());
  assert.match(output, new RegExp(`GET http://127\\.0\\.0\\.1:${port}/ → HTTP 200`));
});
